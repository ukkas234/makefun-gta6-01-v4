// main.js — Solmara boot + fixed 1/60 s loop + screens + glue.
// Boot: builds the city, player, traffic, police, missions, HUD and audio, then
// runs the game. Screens: title, playing, paused, busted/wasted overlay,
// mission-complete overlay, story-complete screen, plus missions/controls lists.
// Glue: E enter/exit/steal, wanted events, mission triggers, save/load, HUD
// updates, game clock. ?shot=start|drive|chase|night (&seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.

import * as THREE from '../vendor/three.module.js';
import { STEP, BALANCE, WORLD_SEED } from './config.js';
import { mulberry32 } from './random.js';
import { createCity } from './city.js';
import { createWorld3D } from './render.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createTraffic } from './traffic.js';
import { createCar, driveCar } from './vehicles.js';
import { createPolice } from './police.js';
import { MISSIONS, createMissionManager } from './missions.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, saveSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25; // longest frame the loop catches up on
const DAY_LENGTH = 600; // real seconds per full game day
const ENTER_DIST = 4.5;
const WITNESS_DIST = 25;
const SHOOT_RANGE = 90;
const POLICE_STATION = { x: 0, z: 52 };
const HOSPITAL = { x: 52, z: 0 };
const HOME_SPAWN = { x: 0, z: 26 };

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : WORLD_SEED;

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

// ---------- world ----------
const world = createWorld3D(canvas);
const rng = mulberry32(seed);
const city = createCity(world.scene, rng);
const player = createPlayer(world.scene, city);
const traffic = createTraffic(world.scene, city, 14);
const police = createPolice(world.scene, city);
const audio = createAudio();
const hud = createHUD();
const input = createInput(canvas);
const save = loadSave();

// Parked cars the player can take without stealing from traffic.
const looseCars = [];
function parkCar(type, x, z, heading) {
  const car = createCar(type, x, z, heading);
  world.scene.add(car.mesh);
  looseCars.push(car);
  return car;
}
parkCar('sedan', 4, 52, 0);
parkCar('taxi', -4, -52, Math.PI);
parkCar('muscle', 56, 4, Math.PI / 2);
parkCar('van', -56, -4, -Math.PI / 2);

// ---------- pedestrians (ambient, sidewalk walkers) ----------
const peds = [];
function makePedMesh(shirt, pants) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), mat(shirt));
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.28), mat(0xd9a986));
  head.position.y = 1.55;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), mat(pants));
  legL.position.set(-0.13, 0.32, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  g.add(torso, head, legL, legR);
  g.userData = { legL, legR };
  return g;
}
const PED_SHIRTS = [0xd8d8d8, 0x3a6fd8, 0xc22e2e, 0x2f7a33, 0xf2c230, 0x8a5fc2];
for (let i = 0; i < 12; i += 1) {
  const line = [-156, -104, -52, 0, 52, 104, 156][i % 7];
  const along = [-208, -104, 0, 104, 208][Math.floor(i / 7) % 5];
  const mesh = makePedMesh(PED_SHIRTS[i % PED_SHIRTS.length], 0x2b3440);
  const ped = {
    mesh,
    x: line + 8,
    z: along,
    heading: [0, Math.PI / 2, Math.PI, -Math.PI / 2][i % 4],
    speed: 1.2 + (i % 3) * 0.3,
    fleeTimer: 0,
    cool: 0,
    phase: Math.random() * 6,
  };
  mesh.position.set(ped.x, 0, ped.z);
  world.scene.add(mesh);
  peds.push(ped);
}
function pedFlee(ped, fromX, fromZ) {
  ped.fleeTimer = 3;
  ped.heading = Math.atan2(ped.x - fromX, ped.z - fromZ);
}
function updatePeds(dt) {
  for (const ped of peds) {
    ped.cool = Math.max(0, ped.cool - dt);
    const fleeing = ped.fleeTimer > 0;
    if (fleeing) ped.fleeTimer -= dt;
    const speed = fleeing ? 6 : ped.speed;
    const nx = ped.x + Math.sin(ped.heading) * speed * dt;
    const nz = ped.z + Math.cos(ped.heading) * speed * dt;
    if (!city.collideCircle(nx, nz, 0.4)) {
      ped.x = nx;
      ped.z = nz;
    } else {
      ped.heading += Math.PI; // blocked: turn around
    }
    // At an intersection, sometimes turn onto the cross street.
    if (!fleeing && Math.random() < dt * 0.25) {
      const onX = Math.abs(ped.x - Math.round(ped.x / 52) * 52) < 3;
      const onZ = Math.abs(ped.z - Math.round(ped.z / 52) * 52) < 3;
      if (onX && onZ) ped.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
    ped.phase += dt * speed * 2.4;
    const swing = Math.sin(ped.phase) * 0.45;
    ped.mesh.userData.legL.rotation.x = swing;
    ped.mesh.userData.legR.rotation.x = -swing;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
    // A fast car bearing down on a ped scares them off (and counts as a hit).
    if (!player.onFoot && player.car && Math.abs(player.car.speed) > 3 && ped.cool <= 0) {
      const d = Math.hypot(ped.x - player.x, ped.z - player.z);
      if (d < 2.5) {
        ped.cool = 5;
        pedFlee(ped, player.x, player.z);
        police.addWanted(1);
        hud.showMessage('You hit a pedestrian! The cops saw that.');
      }
    }
  }
}

// ---------- mission marker (3D beam + ground ring) ----------
let markerGroup = null;
let markerPos = null;
function spawnMarker(x, z, label) {
  clearMarker();
  markerPos = { x, z, label: label || '' };
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.3, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = 13;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  group.add(beam, ring);
  group.position.set(x, 0, z);
  group.userData.ring = ring;
  world.scene.add(group);
  markerGroup = group;
}
function clearMarker() {
  if (markerGroup) {
    world.scene.remove(markerGroup);
    markerGroup = null;
  }
  markerPos = null;
}

// ---------- game object handed to missions.js / shots.js ----------
let hour = 10; // game clock, 0-24
let screen = 'title';
let storyPending = false;
let missionsReturn = 'title'; // where the missions list goes back to
let controlsReturn = 'title';

const game = {
  player,
  city,
  traffic,
  police,
  hud,
  audio,
  save,
  setObjective(text) { hud.setObjective(text); },
  addMoney(n) {
    save.money = Math.max(0, save.money + n);
    saveSave(save);
  },
  showMessage(text) { hud.showMessage(text); },
  spawnMarker,
  clearMarker,
  setClock(h) {
    hour = ((h % 24) + 24) % 24;
    world.setTimeOfDay(hour);
  },
  setScreen(s) { setScreen(s); },
  showMissionComplete(title, reward) { showMissionComplete(title, reward); },
  putPlayerInCar(type, x, z, heading) {
    const car = createCar(type, x, z, heading, { isPlayer: true });
    world.scene.add(car.mesh);
    looseCars.push(car);
    enterCar(car, false);
    return car;
  },
};
const missions = createMissionManager(game);

// ---------- screens ----------
const screens = {
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  missions: document.getElementById('screen-missions'),
  controls: document.getElementById('screen-controls'),
  busted: document.getElementById('screen-busted'),
  'mission-complete': document.getElementById('screen-mission-done'),
  story: document.getElementById('screen-story'),
};
function showOnly(id) {
  for (const [key, el] of Object.entries(screens)) {
    if (el) el.style.display = key === id ? 'flex' : 'none';
  }
}
function setScreen(next) {
  screen = next;
  if (next === 'playing') showOnly(null);
  else if (next === 'wasted') showOnly('busted');
  else showOnly(next);
  if (statusEl) {
    statusEl.textContent =
      next === 'title' ? 'Solmara. Press New Game to start.' :
      next === 'playing' ? 'Playing.' :
      next === 'paused' ? 'Paused.' : next;
  }
}
function announce(text) { if (statusEl) statusEl.textContent = text; }

function syncMuteButtons() {
  const label = audio.muted ? 'Sound: Off' : 'Sound: On';
  for (const id of ['btn-mute-title', 'btn-mute-pause']) {
    const b = document.getElementById(id);
    if (b) b.textContent = label;
  }
}
function toggleMute() {
  audio.setMuted(!audio.muted);
  save.muted = audio.muted;
  saveSave(save);
  syncMuteButtons();
  audio.click();
}

function refreshContinue() {
  const btn = document.getElementById('btn-continue');
  if (!btn) return;
  const hasProgress = save.money > 0 || save.missionsDone.length > 0 || save.packages.length > 0;
  btn.disabled = !hasProgress;
}

function resetWorldForPlay() {
  missions.abort();
  police.reset();
  clearMarker();
  if (player.car) {
    const car = player.car;
    car.isPlayer = false;
    car.speed = 0;
    if (!looseCars.includes(car)) looseCars.push(car);
  }
  player.reset(HOME_SPAWN.x, HOME_SPAWN.z);
  hour = 10;
  world.setTimeOfDay(hour);
  hud.setObjective('Free roam — open Missions from the pause menu');
  hud.setMission('');
  world.setFollow(player.getState());
}

function startPlay() {
  resetWorldForPlay();
  setScreen('playing');
  announce('Playing. Steal a car with E, or open Missions from the pause menu.');
}

function newGame() {
  save.money = BALANCE.startMoney;
  save.missionsDone = [];
  save.packages = [];
  saveSave(save);
  audio.click();
  startPlay();
  hud.showMessage('Welcome to Solmara, Danny. Steal a car — press E near one.');
}

function continueGame() {
  audio.click();
  startPlay();
  hud.showMessage(`Welcome back, Danny. $${save.money} in your pocket.`);
}

function pauseGame() {
  if (screen !== 'playing') return;
  setScreen('paused');
  saveSave(save);
  audio.engine(0, false);
  audio.siren(false);
  announce('Paused.');
}
function resumeGame() {
  if (screen !== 'paused') return;
  setScreen('playing');
  announce('Playing.');
}
function quitToTitle() {
  saveSave(save);
  audio.engine(0, false);
  audio.siren(false);
  refreshContinue();
  setScreen('title');
}

function openMissions(from) {
  missionsReturn = from;
  const list = document.getElementById('mission-list');
  list.innerHTML = '';
  const open = missions.available();
  const done = save.missionsDone;
  MISSIONS.forEach((m, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    const isDone = done.includes(m.id);
    const isOpen = open.includes(i);
    b.textContent = `${m.id} — ${m.title} — $${m.reward}${isDone ? ' ✓' : isOpen ? '' : ' (locked)'}`;
    b.classList.toggle('done', isDone);
    b.classList.toggle('locked', !isOpen && !isDone);
    b.disabled = !isOpen;
    b.addEventListener('click', () => {
      audio.click();
      if (screen === 'title') startPlay();
      else setScreen('playing');
      if (missions.start(i)) announce(`Mission started: ${m.title}.`);
    });
    list.appendChild(b);
  });
  setScreen('missions');
}
function openControls(from) {
  controlsReturn = from;
  setScreen('controls');
}

function showMissionComplete(title, reward) {
  document.getElementById('mission-done-title').textContent = title;
  document.getElementById('mission-done-reward').textContent = `+$${reward}`;
  setScreen('mission-complete');
}

function doBusted() {
  const fine = Math.min(save.money, BALANCE.fines.busted);
  save.money -= fine;
  saveSave(save);
  police.reset();
  exitCar(true);
  player.reset(POLICE_STATION.x, POLICE_STATION.z);
  audio.siren(false);
  document.getElementById('busted-title').textContent = 'BUSTED';
  document.getElementById('busted-text').textContent =
    `The Solmara PD caught you. Fine: $${fine}.`;
  setScreen('busted');
  announce('Busted.');
}
function doWasted() {
  const fine = Math.min(save.money, BALANCE.fines.wasted);
  save.money -= fine;
  saveSave(save);
  police.reset();
  exitCar(true);
  player.reset(HOSPITAL.x, HOSPITAL.z);
  audio.siren(false);
  document.getElementById('busted-title').textContent = 'WASTED';
  document.getElementById('busted-text').textContent =
    `You got flattened. Hospital bill: $${fine}.`;
  setScreen('wasted');
  announce('Wasted.');
}

// ---------- enter / exit / steal ----------
function nearestEnterableCar(x, z) {
  let best = traffic.nearestCar(x, z, ENTER_DIST);
  let bestD = best ? Math.hypot(best.x - x, best.z - z) : Infinity;
  for (const car of looseCars) {
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD && d <= ENTER_DIST) {
      best = car;
      bestD = d;
    }
  }
  return best;
}
function enterCar(car, stolen) {
  player.car = car;
  player.onFoot = false;
  car.isPlayer = true;
  player.cameraYaw = car.heading;
  if (stolen) {
    const seenByCop = police.nearestCopDist(player.x, player.z) < 60;
    const seenByTraffic = traffic.nearestCar(player.x, player.z, WITNESS_DIST) !== null;
    if (seenByCop || seenByTraffic) {
      police.addWanted(1);
      hud.showMessage('Car stolen — someone saw that! +1 star.');
    } else {
      hud.showMessage('Car stolen. Nice and quiet.');
    }
  }
}
function exitCar(silent) {
  if (!player.car) return;
  const car = player.car;
  car.isPlayer = false;
  car.speed = 0;
  const leftX = Math.cos(car.heading);
  const leftZ = -Math.sin(car.heading);
  const px = car.x + leftX * 2.6;
  const pz = car.z + leftZ * 2.6;
  player.car = null;
  player.onFoot = true;
  player.cameraYaw = car.heading;
  if (!city.collideCircle(px, pz, 0.5)) player.setPosition(px, pz);
  else player.setPosition(car.x, car.z);
  if (!looseCars.includes(car)) looseCars.push(car);
  if (!silent) hud.showMessage('Out of the car.');
}
function tryEnterExit() {
  if (player.onFoot) {
    const car = nearestEnterableCar(player.x, player.z);
    if (!car) {
      hud.showMessage('No car close enough. Walk up to one and press E.');
      return;
    }
    if (car.isPolice) {
      hud.showMessage("You can't steal a police car.");
      return;
    }
    const wasTraffic = traffic.takeCar(car);
    const i = looseCars.indexOf(car);
    if (i >= 0) looseCars.splice(i, 1);
    audio.click();
    enterCar(car, wasTraffic || i < 0);
    if (!wasTraffic && i >= 0) hud.showMessage('Back in your car.');
  } else {
    exitCar(false);
  }
}

// ---------- combat hooks ----------
player.hooks.onShoot = (origin, dir) => {
  audio.shot();
  police.addWanted(1);
  // Closest target along the ray (xz plane, targets are upright).
  let bestT = SHOOT_RANGE;
  let bestKind = null;
  let bestTarget = null;
  const testTarget = (x, z, radius, kind, target) => {
    const dx = x - origin.x;
    const dz = z - origin.z;
    const t = dx * dir.x + dz * dir.z;
    if (t < 0 || t > bestT) return;
    const px = origin.x + dir.x * t;
    const pz = origin.z + dir.z * t;
    if (Math.hypot(x - px, z - pz) <= radius) {
      bestT = t;
      bestKind = kind;
      bestTarget = target;
    }
  };
  for (const car of traffic.cars) testTarget(car.x, car.z, 2.2, 'traffic', car);
  for (const car of looseCars) testTarget(car.x, car.z, 2.2, 'loose', car);
  for (const car of police.cars) testTarget(car.x, car.z, 2.2, 'copcar', car);
  for (const cop of police.footCops) testTarget(cop.x, cop.z, 0.7, 'footcop', cop);
  for (const ped of peds) testTarget(ped.x, ped.z, 0.7, 'ped', ped);
  if (bestKind === 'traffic') {
    // Driver bails: the car becomes a parked loose car.
    traffic.takeCar(bestTarget);
    bestTarget.speed = 0;
    looseCars.push(bestTarget);
    hud.showMessage('You shot up a car — the driver ran for it!');
  } else if (bestKind === 'loose') {
    hud.showMessage('You shot your own ride. Nice.');
  } else if (bestKind === 'copcar') {
    police.addWanted(1);
    hud.showMessage('You shot a police car! +1 star.');
  } else if (bestKind === 'footcop') {
    bestTarget.x += dir.x * 4;
    bestTarget.z += dir.z * 4;
    bestTarget.mesh.position.set(bestTarget.x, 0, bestTarget.z);
    hud.showMessage('You hit a cop! +1 star.');
  } else if (bestKind === 'ped') {
    pedFlee(bestTarget, player.x, player.z);
    hud.showMessage('You shot at a pedestrian! +1 star.');
  }
  for (const ped of peds) {
    if (Math.hypot(ped.x - player.x, ped.z - player.z) < 25) pedFlee(ped, player.x, player.z);
  }
};
player.hooks.onPunch = (origin, range) => {
  audio.punch();
  let hit = false;
  for (const cop of police.footCops) {
    if (Math.hypot(cop.x - player.x, cop.z - player.z) < range + 0.5) {
      const a = Math.atan2(cop.x - player.x, cop.z - player.z);
      cop.x += Math.sin(a) * 3;
      cop.z += Math.cos(a) * 3;
      cop.mesh.position.set(cop.x, 0, cop.z);
      police.addWanted(1);
      hud.showMessage('You punched a cop! +1 star.');
      hit = true;
    }
  }
  for (const ped of peds) {
    if (Math.hypot(ped.x - player.x, ped.z - player.z) < range + 0.5) {
      pedFlee(ped, player.x, player.z);
      police.addWanted(1);
      hud.showMessage('You punched a pedestrian! +1 star.');
      hit = true;
    }
  }
  if (!hit) {
    const car = nearestEnterableCar(player.x, player.z);
    if (car) hud.showMessage('You thumped the car. It does nothing.');
  }
};

// ---------- per-step simulation ----------
function stepWorld(dt) {
  // Clock.
  hour = (hour + dt * (24 / DAY_LENGTH)) % 24;
  world.setTimeOfDay(hour);

  // Pause / mute edges.
  if (input.pressed('Escape') || input.pressed('KeyP')) {
    pauseGame();
    input.update();
    return;
  }
  if (input.pressed('KeyM')) toggleMute();

  // Enter / exit / steal.
  if (input.pressed('KeyE')) tryEnterExit();

  // Driving.
  if (!player.onFoot && player.car) {
    const car = player.car;
    const speedBefore = car.speed;
    if (input.pressed('KeyR')) {
      const p = city.nearestRoadPoint(car.x, car.z);
      car.x = p.x;
      car.z = p.z;
      car.heading = Math.round(car.heading / (Math.PI / 2)) * (Math.PI / 2);
      car.speed = 0;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      hud.showMessage('Car reset to the road.');
    } else {
      const k = input.keys;
      driveCar(car, dt, {
        throttle: (k.has('KeyW') || k.has('ArrowUp')) ? 1 : 0,
        brake: (k.has('KeyS') || k.has('ArrowDown')) ? 1 : 0,
        steer: ((k.has('KeyA') || k.has('ArrowLeft')) ? 1 : 0) -
          ((k.has('KeyD') || k.has('ArrowRight')) ? 1 : 0),
        handbrake: k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight'),
      }, city);
      // Head-on crash at speed hurts.
      if (speedBefore > 18 && Math.abs(car.speed) < 1) {
        player.takeDamage(12);
        hud.flash('CRASH!');
        audio.punch();
      }
    }
  }

  player.update(dt, input, city);
  traffic.update(dt, { x: player.x, z: player.z }, player.car || null);
  updatePeds(dt);
  const prevMission = missions.active;
  missions.update(dt);
  const policeResult = police.update(dt, player, traffic.cars);
  if (markerGroup) {
    const s = 1 + Math.sin(performance.now() / 300) * 0.12;
    markerGroup.userData.ring.scale.set(s, s, 1);
  }

  // Mission finished / failed.
  if (prevMission && !missions.active) {
    if (prevMission.isDone) {
      storyPending = prevMission.id === 'M5';
      showMissionComplete(prevMission.title, prevMission.reward);
    }
  }

  // Busted / wasted.
  if (policeResult.busted) {
    input.update();
    doBusted();
    return;
  }
  if (player.health <= 0) {
    input.update();
    doWasted();
    return;
  }

  // Audio.
  const driving = !player.onFoot && !!player.car;
  const speed01 = driving
    ? Math.min(1, Math.abs(player.car.speed) / (player.car.topSpeed || 34))
    : Math.min(1, player.speed / 7.6);
  audio.engine(speed01, driving || player.speed > 0.1);
  audio.siren(police.sirenOn);

  input.update();
}

function hudState() {
  const driving = !player.onFoot && !!player.car;
  const hh = Math.floor(hour) % 24;
  const mm = Math.floor((hour % 1) * 60);
  return {
    health: player.health,
    wanted: police.wanted,
    money: save.money,
    speed: driving ? Math.abs(player.car.speed) * 3.6 : 0,
    driving,
    armed: player.armed,
    clock: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    minimap: {
      player: { x: player.x, z: player.z, heading: player.heading },
      cars: traffic.cars,
      police: police.cars,
      peds,
      marker: markerPos,
      north: 0,
    },
    screen,
  };
}

// ---------- buttons ----------
function bind(id, fn) {
  const b = document.getElementById(id);
  if (b) b.addEventListener('click', fn);
}
bind('btn-new', newGame);
bind('btn-continue', continueGame);
bind('btn-missions-title', () => openMissions('title'));
bind('btn-missions-pause', () => openMissions('paused'));
bind('btn-controls-title', () => openControls('title'));
bind('btn-controls-pause', () => openControls('paused'));
bind('btn-mute-title', toggleMute);
bind('btn-mute-pause', toggleMute);
bind('btn-resume', resumeGame);
bind('btn-quit', quitToTitle);
bind('btn-missions-back', () => setScreen(missionsReturn));
bind('btn-controls-back', () => setScreen(controlsReturn));
bind('btn-busted-ok', () => { audio.click(); setScreen('playing'); });
bind('btn-mission-done-ok', () => {
  audio.click();
  if (storyPending) {
    storyPending = false;
    setScreen('story');
  } else {
    setScreen('playing');
  }
});
bind('btn-story-roam', () => { audio.click(); setScreen('playing'); });
bind('btn-story-title', () => { audio.click(); refreshContinue(); setScreen('title'); });

// Enter key confirms the visible overlay's primary button.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Enter') return;
  if (screen === 'busted' || screen === 'wasted') {
    document.getElementById('btn-busted-ok').click();
  } else if (screen === 'mission-complete') {
    document.getElementById('btn-mission-done-ok').click();
  } else if (screen === 'paused') {
    resumeGame();
  } else if (screen === 'title') {
    newGame();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'playing') pauseGame();
});
window.addEventListener('beforeunload', () => saveSave(save));

// ---------- boot ----------
audio.setMuted(!!save.muted);
syncMuteButtons();
refreshContinue();
player.reset(HOME_SPAWN.x, HOME_SPAWN.z);
world.setTimeOfDay(hour);
world.setFollow(player.getState());
hud.setObjective('Free roam — open Missions from the pause menu');
setScreen('title');

// ---------- screenshot mode ----------
function runShot(name) {
  stageShot(name, game);
  let painted = 0;
  function paint() {
    world.setFollow(player.getState());
    world.update(STEP);
    hud.update(hudState());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// ---------- main loop ----------
function runGame() {
  let accumulator = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Resume from pause with Esc/P (edge read once per frame while paused).
    if (screen === 'paused' && (input.pressed('Escape') || input.pressed('KeyP'))) {
      resumeGame();
    }
    if (screen === 'playing') {
      accumulator += frameDt;
      while (accumulator >= STEP && screen === 'playing') {
        stepWorld(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      input.update();
    }
    world.setFollow(player.getState());
    world.update(Math.max(frameDt, 0.001));
    hud.update(hudState());
  }
  requestAnimationFrame(frame);
}

if (shotName) runShot(shotName);
else runGame();
