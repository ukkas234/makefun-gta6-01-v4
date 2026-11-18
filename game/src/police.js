// police.js — Wanted system + police pursuit for Solmara.
// Wanted 0-5 stars. Cops chase in cars and on foot; an on-foot cop that stays
// within 2 m of the player for 2 s busts them. No network, no placeholders.
import * as THREE from '../vendor/three.module.js';
import { createCar } from './vehicles.js';

const MAX_WANTED = 5;
const DECAY_SECONDS = 20; // -1 star per 20 s while no cop is within 60 m
const HIDDEN_RADIUS = 60;
const BUST_RADIUS = 2;
const BUST_SECONDS = 2;
const COP_CAR_SPEED = 26; // m/s, slightly faster than most traffic
const COP_FOOT_SPEED = 5.6;
const RAM_DISTANCE = 3.6;
const SPAWN_DISTANCE = 70; // cops appear this far from the player, on a road

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function angleTo(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
}

function turnToward(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > maxStep) return current + maxStep;
  if (diff < -maxStep) return current - maxStep;
  return target;
}

function makeFootCop(scene) {
  // Simple box character: dark-navy uniform, cap brim, pale face, badge dot.
  const group = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1b2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x0e1526 });
  const badge = new THREE.MeshLambertMaterial({ color: 0xf2c94c });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.26), dark);
  legs.position.y = 0.4;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.32), navy);
  torso.position.y = 1.13;
  const star = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), badge);
  star.position.set(-0.14, 1.28, 0.17);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.32), skin);
  head.position.y = 1.62;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.38), dark);
  cap.position.y = 1.82;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.16), dark);
  brim.position.set(0, 1.78, 0.24);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.13), navy);
  armL.position.set(-0.36, 1.12, 0);
  const armR = armL.clone();
  armR.position.x = 0.36;

  group.add(legs, torso, star, head, cap, brim, armL, armR);
  group.traverse((child) => {
    if (child.isMesh) child.castShadow = false;
  });
  scene.add(group);
  return { mesh: group, x: 0, z: 0, heading: 0, speed: 0, armL, armR, walkPhase: 0 };
}

export function createPolice(scene, city) {
  let wanted = 0;
  let decayTimer = 0;
  let bustTimer = 0;
  let ramWantedCooldown = 0;
  let sirenOn = false;
  const cars = []; // police cars {car}
  const footCops = []; // on-foot cops
  const scratch = { x: 0, z: 0 };

  function roadPointNear(px, pz, distance) {
    // Pick a road point roughly `distance` away from the player, in a random
    // direction, snapped onto the nearest road when the city offers it.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const a = Math.random() * Math.PI * 2;
      const x = px + Math.cos(a) * distance;
      const z = pz + Math.sin(a) * distance;
      if (city && typeof city.nearestRoadPoint === 'function') {
        const p = city.nearestRoadPoint(x, z);
        if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) return { x: p.x, z: p.z };
      }
      if (city && typeof city.isOnRoad === 'function') {
        if (city.isOnRoad(x, z)) return { x, z };
      } else {
        return { x, z };
      }
    }
    return { x: px + distance, z: pz };
  }

  function spawnCar(px, pz) {
    const at = roadPointNear(px, pz, SPAWN_DISTANCE);
    const car = createCar('sedan', at.x, at.z, Math.random() * Math.PI * 2, { isPolice: true });
    car.speed = 0;
    if (car.mesh) scene.add(car.mesh);
    cars.push(car);
    return car;
  }

  function spawnFootCop(px, pz) {
    const at = roadPointNear(px, pz, 28);
    const cop = makeFootCop(scene);
    cop.x = at.x;
    cop.z = at.z;
    cop.mesh.position.set(at.x, 0, at.z);
    footCops.push(cop);
    return cop;
  }

  function removeCar(car) {
    if (car.mesh) scene.remove(car.mesh);
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  function removeFootCop(cop) {
    scene.remove(cop.mesh);
    const i = footCops.indexOf(cop);
    if (i >= 0) footCops.splice(i, 1);
  }

  function desiredCars() {
    if (wanted <= 0) return 0;
    if (wanted <= 2) return 1;
    if (wanted === 3) return 2;
    return 3;
  }

  function desiredFootCops(playerOnFoot) {
    if (wanted <= 0 || !playerOnFoot) return 0;
    return Math.min(wanted, 3);
  }

  function updateCar(car, dt, player) {
    const px = player.x;
    const pz = player.z;
    const targetHeading = angleTo(car.x, car.z, px, pz);
    car.heading = turnToward(car.heading, targetHeading, 2.6 * dt);
    // Ease up to pursuit speed; slow down a touch when very close so the ram
    // lands instead of overshooting the player every pass.
    const d = Math.sqrt(dist2(car.x, car.z, px, pz));
    const targetSpeed = d < 12 ? COP_CAR_SPEED * 0.55 : COP_CAR_SPEED;
    car.speed += (targetSpeed - car.speed) * Math.min(1, 2.2 * dt);

    const step = car.speed * dt;
    let nx = car.x + Math.sin(car.heading) * step;
    let nz = car.z + Math.cos(car.heading) * step;
    if (city && typeof city.collideCircle === 'function' && city.collideCircle(nx, nz, 1.6)) {
      // Blocked by a building: try veering left, then right, else stop.
      const left = car.heading - 0.7;
      const lx = car.x + Math.sin(left) * step;
      const lz = car.z + Math.cos(left) * step;
      const right = car.heading + 0.7;
      const rx = car.x + Math.sin(right) * step;
      const rz = car.z + Math.cos(right) * step;
      if (!city.collideCircle(lx, lz, 1.6)) {
        car.heading = left;
        nx = lx;
        nz = lz;
      } else if (!city.collideCircle(rx, rz, 1.6)) {
        car.heading = right;
        nx = rx;
        nz = rz;
      } else {
        car.speed = 0;
        nx = car.x;
        nz = car.z;
      }
    }
    car.x = nx;
    car.z = nz;
    if (car.mesh) {
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }

    // Ram: shove the player's car and scrub its speed when we make contact.
    if (player.car && d < RAM_DISTANCE) {
      const push = angleTo(car.x, car.z, px, pz);
      player.car.x += Math.sin(push) * 1.6;
      player.car.z += Math.cos(push) * 1.6;
      player.car.speed *= 0.82;
      if (player.car.mesh) {
        player.car.mesh.position.set(player.car.x, 0, player.car.z);
      }
      car.speed *= 0.6;
    }
  }

  function updateFootCop(cop, dt, player) {
    const targetHeading = angleTo(cop.x, cop.z, player.x, player.z);
    cop.heading = turnToward(cop.heading, targetHeading, 4 * dt);
    const d = Math.sqrt(dist2(cop.x, cop.z, player.x, player.z));
    // Cops only close in on a player on foot; against a car they hold position
    // and wait instead of sprinting into traffic.
    const speed = player.onFoot ? COP_FOOT_SPEED : 0;
    cop.speed = speed;
    if (speed > 0 && d > 0.6) {
      const step = Math.min(speed * dt, d - 0.4);
      const nx = cop.x + Math.sin(cop.heading) * step;
      const nz = cop.z + Math.cos(cop.heading) * step;
      if (!city || typeof city.collideCircle !== 'function' || !city.collideCircle(nx, nz, 0.5)) {
        cop.x = nx;
        cop.z = nz;
      }
    }
    cop.walkPhase += dt * (speed > 0 ? 9 : 0);
    const swing = Math.sin(cop.walkPhase) * 0.5;
    cop.armL.rotation.x = swing;
    cop.armR.rotation.x = -swing;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
  }

  function update(dt, player, trafficCars) {
    // Keep the force matched to the wanted level.
    const wantCars = desiredCars();
    while (cars.length < wantCars) spawnCar(player.x, player.z);
    while (cars.length > wantCars) removeCar(cars[cars.length - 1]);
    const wantFoot = desiredFootCops(player.onFoot);
    while (footCops.length < wantFoot) spawnFootCop(player.x, player.z);
    while (footCops.length > wantFoot) removeFootCop(footCops[footCops.length - 1]);

    // Player ramming a police car raises the heat (only counts while driving).
    // Cooldown stops one collision from stacking stars every frame.
    ramWantedCooldown = Math.max(0, ramWantedCooldown - dt);
    if (player.car && ramWantedCooldown <= 0) {
      for (const cop of cars) {
        if (dist2(cop.x, cop.z, player.car.x, player.car.z) < RAM_DISTANCE * RAM_DISTANCE) {
          if (Math.abs(player.car.speed) > 8) {
            addWanted(1);
            ramWantedCooldown = 3;
            break;
          }
        }
      }
    }

    for (const car of cars) updateCar(car, dt, player);
    for (const cop of footCops) updateFootCop(cop, dt, player);

    // Busted: an on-foot cop within 2 m of an on-foot player for 2 s.
    let busted = false;
    if (player.onFoot) {
      let closest = Infinity;
      for (const cop of footCops) {
        closest = Math.min(closest, Math.sqrt(dist2(cop.x, cop.z, player.x, player.z)));
      }
      if (closest <= BUST_RADIUS) {
        bustTimer += dt;
        if (bustTimer >= BUST_SECONDS) {
          busted = true;
          bustTimer = 0;
        }
      } else {
        bustTimer = 0;
      }
    } else {
      bustTimer = 0;
    }

    // Wanted decay: -1 star per 20 s while no cop is within 60 m.
    if (wanted > 0) {
      if (nearestCopDist(player.x, player.z) > HIDDEN_RADIUS) {
        decayTimer += dt;
        if (decayTimer >= DECAY_SECONDS) {
          decayTimer = 0;
          wanted = Math.max(0, wanted - 1);
        }
      } else {
        decayTimer = 0;
      }
    } else {
      decayTimer = 0;
    }

    sirenOn = wanted > 0;
    return { busted };
  }

  function addWanted(n) {
    wanted = Math.max(0, Math.min(MAX_WANTED, wanted + n));
    if (n > 0) decayTimer = 0;
    return wanted;
  }

  function nearestCopDist(x, z) {
    let best = Infinity;
    for (const car of cars) best = Math.min(best, Math.sqrt(dist2(car.x, car.z, x, z)));
    for (const cop of footCops) best = Math.min(best, Math.sqrt(dist2(cop.x, cop.z, x, z)));
    return best;
  }

  function reset() {
    wanted = 0;
    decayTimer = 0;
    bustTimer = 0;
    ramWantedCooldown = 0;
    sirenOn = false;
    while (cars.length > 0) removeCar(cars[0]);
    while (footCops.length > 0) removeFootCop(footCops[0]);
  }

  return {
    get wanted() {
      return wanted;
    },
    get sirenOn() {
      return sirenOn;
    },
    get cars() {
      return cars;
    },
    get footCops() {
      return footCops;
    },
    addWanted,
    update,
    reset,
    nearestCopDist,
  };
}
