// Solmara — every tuning number and colour in one place.
// World units are metres; ground plane is y=0, x east, z south.

/** Fixed simulation step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** City layout: 10x10 blocks of 40 m, separated by 12 m roads on a 52 m pitch. */
export const CITY = {
  blocks: 10,
  block: 40,
  road: 12,
  pitch: 52,
  half: 260, // roads run at x,z = -260..260; city footprint ~520x520 m
  size: 520,
  beachStart: 266, // south edge: sand strip from here...
  waterStart: 292, // ...to here, then open water
  bounds: 300, // playable area clamp (hills/water beyond)
};

export const BLOCK = CITY.block;
export const ROAD = CITY.road;

/** Road centre-line coordinates, one per axis. */
export const ROAD_LINES = [];
for (let c = -CITY.half; c <= CITY.half; c += CITY.pitch) ROAD_LINES.push(c);

/** Keyboard bindings (event.code values). */
export const KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  run: 'ShiftLeft',
  runRight: 'ShiftRight',
  jump: 'Space',
  punch: 'KeyF',
  weapon: 'KeyQ',
  interact: 'KeyE',
  flipCar: 'KeyR',
  mute: 'KeyM',
  pause: 'Escape',
  pauseAlt: 'KeyP',
};

export const PLAYER = {
  walkSpeed: 5,
  runSpeed: 9,
  jumpSpeed: 7,
  gravity: 20,
  height: 1.8,
  radius: 0.45,
  maxHealth: 100,
  punchRange: 1.6,
  punchDamage: 15,
  pistolDamage: 34,
  pistolRange: 90,
};

export const COLORS = {
  skyDay: 0x87b5e0,
  skyDusk: 0xe08a5a,
  skyNight: 0x0b1026,
  sunDay: 0xfff2d8,
  sunNight: 0x8fa8ff,
  asphalt: '#2e2f33',
  sidewalk: '#8d8f94',
  grass: '#4d8a3f',
  sand: '#d9c08a',
  water: '#1d6f9e',
  neonPink: '#ff2e88',
  neonCyan: '#22e6ff',
  neonYellow: '#ffd23e',
  hudText: '#eef1f5',
  hudPanel: 'rgba(12, 16, 24, 0.72)',
};

/** Economy and wanted-system tuning. */
export const BALANCE = {
  rewards: {
    m1: 200, // First Wheels
    m2: 350, // Hot Deliveries
    m3: 400, // Lose the Heat
    m4: 500, // The Pickup
    m5: 1500, // The Big One
    package: 50, // each hidden package
  },
  fines: {
    busted: 100,
    wasted: 50,
  },
  decay: {
    secondsPerStar: 20, // -1 star per 20 s hidden (no cop within 60 m)
    hiddenRadius: 60,
  },
  wanted: {
    maxStars: 5,
    stealSeen: 1,
    hitPedestrian: 1,
    shoot: 1,
    ramCop: 1,
    bustDistance: 2,
    bustSeconds: 2,
  },
  startMoney: 150,
};

/** localStorage key for the save game. */
export const SAVE_KEY = 'solmara-save-v1';

/** Deterministic world seed used for screenshots (?shot=) and new games. */
export const WORLD_SEED = 1337;

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
