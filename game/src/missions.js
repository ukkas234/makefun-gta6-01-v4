// missions.js — Story missions + hidden packages for Solmara.
// Five sequential, replayable missions. The manager owns the active mission,
// completion payouts, and the 10 hidden packages ($50 each) found in free roam.
// No network, no placeholders.

// All markers sit on road intersections (multiples of 52 inside the 520 m city).
const GARAGE = { x: 156, z: 104, label: 'Garage' };
const DELIVERY_POINTS = [
  { x: -156, z: 52, label: 'Delivery 1' },
  { x: 52, z: -208, label: 'Delivery 2' },
  { x: 208, z: -52, label: 'Delivery 3' },
];
const BRIEFCASE_SPOT = { x: -52, z: 156, label: 'Briefcase' };
const SAFEHOUSE = { x: 208, z: 208, label: 'Safehouse' };
const BANK = { x: -104, z: -156, label: 'Bank' };

const PACKAGE_SPOTS = [
  { x: -208, z: -208 },
  { x: -104, z: 208 },
  { x: 0, z: -104 },
  { x: 104, z: 0 },
  { x: 208, z: 156 },
  { x: -208, z: 104 },
  { x: 52, z: 208 },
  { x: -52, z: -52 },
  { x: 156, z: -156 },
  { x: 0, z: 156 },
];
const PACKAGE_REWARD = 50;
const PACKAGE_RADIUS = 3;

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function snapToRoad(game, x, z) {
  const city = game.city;
  if (city && typeof city.nearestRoadPoint === 'function') {
    const p = city.nearestRoadPoint(x, z);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) return { x: p.x, z: p.z };
  }
  return { x, z };
}

function placeMarker(game, spot) {
  const at = snapToRoad(game, spot.x, spot.z);
  game.spawnMarker(at.x, at.z, spot.label);
  return at;
}

function baseMission(id, title, briefing, reward) {
  return {
    id,
    title,
    briefing,
    reward,
    stage: 0,
    failed: false,
    isDone: false,
    start() {},
    update() {},
  };
}

const M1 = baseMission(
  'M1',
  'First Wheels',
  'Steal any car and drive it to the garage on the east side.',
  200,
);
M1.start = function start(game) {
  this.stage = 0;
  this.failed = false;
  this.isDone = false;
  game.setObjective('Steal a car, then drive to the Garage');
  game.showMessage('M1 — First Wheels: steal any car (E near a car).');
  placeMarker(game, GARAGE);
  if (game.audio) game.audio.click();
};
M1.update = function update(dt, game) {
  const player = game.player;
  if (this.stage === 0) {
    if (!player.onFoot && player.car) {
      this.stage = 1;
      game.setObjective('Drive to the Garage');
    }
    return;
  }
  if (dist(player.x, player.z, GARAGE.x, GARAGE.z) < 8) {
    this.isDone = true;
  }
};

const M2 = baseMission(
  'M2',
  'Hot Deliveries',
  'Deliver 3 packages across Solmara within 150 seconds. Drive fast, drive clean.',
  350,
);
M2.start = function start(game) {
  this.stage = 0;
  this.failed = false;
  this.isDone = false;
  this.timeLeft = 150;
  game.setObjective('Deliver package 1 of 3 — 150 s left');
  game.showMessage('M2 — Hot Deliveries: 3 drops, 150 seconds. Go!');
  this.current = placeMarker(game, DELIVERY_POINTS[0]);
  if (game.audio) game.audio.click();
};
M2.update = function update(dt, game) {
  this.timeLeft -= dt;
  const left = Math.max(0, Math.ceil(this.timeLeft));
  game.setObjective(`Deliver package ${this.stage + 1} of 3 — ${left} s left`);
  if (this.timeLeft <= 0) {
    this.failed = true;
    game.showMessage('M2 failed — out of time. Try again from the Missions menu.');
    return;
  }
  const player = game.player;
  if (dist(player.x, player.z, this.current.x, this.current.z) < 6) {
    this.stage += 1;
    if (game.audio) game.audio.pickup();
    if (this.stage >= DELIVERY_POINTS.length) {
      this.isDone = true;
      return;
    }
    this.current = placeMarker(game, DELIVERY_POINTS[this.stage]);
    game.showMessage(`Package ${this.stage} delivered. ${3 - this.stage} to go.`);
  }
};

const M3 = baseMission(
  'M3',
  'Lose the Heat',
  'The cops are on you at 2 stars. Break line of sight and stay hidden until the heat dies down.',
  400,
);
M3.start = function start(game) {
  this.stage = 0;
  this.failed = false;
  this.isDone = false;
  game.police.addWanted(2);
  game.setObjective('Lose the cops — get to 0 stars');
  game.showMessage('M3 — Lose the Heat: 2 stars. Hide until it cools off.');
  if (game.audio) game.audio.click();
};
M3.update = function update(dt, game) {
  if (game.police.wanted <= 0) {
    this.isDone = true;
  } else {
    game.setObjective(`Lose the cops — ${game.police.wanted} star${game.police.wanted === 1 ? '' : 's'} left`);
  }
};

const M4 = baseMission(
  'M4',
  'The Pickup',
  'Drive to the briefcase on the south side, grab it on foot, then lose 2 stars of heat at the safehouse.',
  500,
);
M4.start = function start(game) {
  this.stage = 0;
  this.failed = false;
  this.isDone = false;
  game.setObjective('Drive to the Briefcase');
  game.showMessage('M4 — The Pickup: drive to the briefcase, grab it on foot.');
  this.spot = placeMarker(game, BRIEFCASE_SPOT);
  if (game.audio) game.audio.click();
};
M4.update = function update(dt, game) {
  const player = game.player;
  if (this.stage === 0) {
    // Pick up on foot, within arm's reach of the briefcase.
    if (player.onFoot && dist(player.x, player.z, this.spot.x, this.spot.z) < 2.5) {
      this.stage = 1;
      game.police.addWanted(2);
      this.safe = placeMarker(game, SAFEHOUSE);
      game.setObjective('Escape the heat — reach the Safehouse');
      game.showMessage('Briefcase grabbed! 2 stars — get to the Safehouse.');
      if (game.audio) game.audio.pickup();
    }
    return;
  }
  if (dist(player.x, player.z, this.safe.x, this.safe.z) < 6) {
    if (game.police.wanted <= 0) {
      this.isDone = true;
    } else {
      game.setObjective(`Reach the Safehouse — ${game.police.wanted} star${game.police.wanted === 1 ? '' : 's'} to lose first`);
    }
  }
};

const M5 = baseMission(
  'M5',
  'The Big One',
  'Hit the bank on the north-west side. Get inside on foot, grab the cash, then outrun a 3-star chase to the safehouse.',
  1500,
);
M5.start = function start(game) {
  this.stage = 0;
  this.failed = false;
  this.isDone = false;
  this.holdTime = 0;
  game.setObjective('Drive to the Bank');
  game.showMessage('M5 — The Big One: drive to the bank, then go in on foot.');
  this.bank = placeMarker(game, BANK);
  if (game.audio) game.audio.click();
};
M5.update = function update(dt, game) {
  const player = game.player;
  if (this.stage === 0) {
    if (dist(player.x, player.z, this.bank.x, this.bank.z) < 8) {
      this.stage = 1;
      this.holdTime = 0;
      game.setObjective('On foot: stand at the vault and hold E — 3 s');
      game.showMessage('Inside the bank. Hold position at the vault for 3 seconds.');
    }
    return;
  }
  if (this.stage === 1) {
    const near = player.onFoot && dist(player.x, player.z, this.bank.x, this.bank.z) < 3;
    if (near) {
      this.holdTime += dt;
      const left = Math.max(0, 3 - this.holdTime).toFixed(1);
      game.setObjective(`Grabbing the cash… ${left} s`);
      if (this.holdTime >= 3) {
        this.stage = 2;
        game.police.addWanted(3);
        this.safe = placeMarker(game, SAFEHOUSE);
        game.setObjective('Escape the 3-star chase — reach the Safehouse');
        game.showMessage('Cash grabbed! 3 stars — run for the Safehouse!');
        if (game.audio) game.audio.sting();
      }
    } else {
      this.holdTime = 0;
      game.setObjective('On foot: stand at the vault and hold E — 3 s');
    }
    return;
  }
  if (dist(player.x, player.z, this.safe.x, this.safe.z) < 6) {
    if (game.police.wanted <= 0) {
      this.isDone = true;
    } else {
      game.setObjective(`Escape — ${game.police.wanted} star${game.police.wanted === 1 ? '' : 's'} to lose first`);
    }
  }
};

export const MISSIONS = [M1, M2, M3, M4, M5];

export function createMissionManager(game) {
  let active = null;
  const collected = new Set(
    (game.save && Array.isArray(game.save.packages) ? game.save.packages : []).map(String),
  );

  function doneList() {
    if (game.save && Array.isArray(game.save.missionsDone)) return game.save.missionsDone;
    return [];
  }

  function available() {
    // Sequential unlock: mission i is open when all earlier ones are done.
    const done = doneList();
    const open = [];
    for (let i = 0; i < MISSIONS.length; i += 1) {
      if (i === 0 || done.includes(MISSIONS[i - 1].id)) open.push(i);
    }
    return open;
  }

  function start(i) {
    if (active) {
      game.showMessage('Finish or fail the current mission first.');
      return false;
    }
    if (!available().includes(i)) {
      game.showMessage('That mission is locked — finish the previous one first.');
      return false;
    }
    active = MISSIONS[i];
    active.start(game);
    if (game.hud && typeof game.hud.setMission === 'function') {
      game.hud.setMission(active.title);
    }
    return true;
  }

  function complete(mission) {
    game.addMoney(mission.reward);
    if (game.audio) game.audio.sting();
    game.showMessage(`Mission complete: ${mission.title} — $${mission.reward}`);
    if (mission.id === 'M5') {
      game.showMessage('STORY COMPLETE — Solmara is yours, Danny.');
    }
    const done = doneList();
    if (!done.includes(mission.id)) done.push(mission.id);
    game.clearMarker();
    if (game.hud && typeof game.hud.setMission === 'function') game.hud.setMission('');
    game.setObjective('Free roam — open Missions from the pause menu');
    active = null;
  }

  function fail(mission) {
    game.showMessage(`Mission failed: ${mission.title}.`);
    game.clearMarker();
    if (game.hud && typeof game.hud.setMission === 'function') game.hud.setMission('');
    game.setObjective('Free roam — open Missions from the pause menu');
    active = null;
  }

  function updatePackages() {
    const player = game.player;
    if (!player) return;
    for (let i = 0; i < PACKAGE_SPOTS.length; i += 1) {
      if (collected.has(String(i))) continue;
      const spot = PACKAGE_SPOTS[i];
      if (dist(player.x, player.z, spot.x, spot.z) < PACKAGE_RADIUS) {
        collected.add(String(i));
        const found = game.save && Array.isArray(game.save.packages) ? game.save.packages : null;
        if (found && !found.includes(i)) found.push(i);
        game.addMoney(PACKAGE_REWARD);
        if (game.audio) game.audio.pickup();
        game.showMessage(
          `Hidden package ${collected.size}/10 — +$${PACKAGE_REWARD}`,
        );
      }
    }
  }

  function abort() {
    if (!active) return;
    active = null;
    game.clearMarker();
    if (game.hud && typeof game.hud.setMission === 'function') game.hud.setMission('');
    game.setObjective('Free roam — open Missions from the pause menu');
  }

  function update(dt) {
    updatePackages();
    if (!active) return;
    active.update(dt, game);
    if (active.isDone) {
      const done = active;
      complete(done);
    } else if (active.failed) {
      fail(active);
    }
  }

  return {
    get active() {
      return active;
    },
    get packagesFound() {
      return collected.size;
    },
    start,
    update,
    abort,
    available,
  };
}

// Re-exported for the HUD / pause menu: where the hidden packages sit.
export const HIDDEN_PACKAGES = PACKAGE_SPOTS.map((spot, i) => ({ ...spot, index: i }));
