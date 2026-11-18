// vehicles.js — Solmara car types, low-poly car meshes, and arcade driving physics.
// Original work for the Solmara open-world crime sandbox (make.fun gta6-01).
// Positions: ground plane y = 0, x east, z south. A car's forward direction is
// (sin(heading), cos(heading)) in xz, and mesh.rotation.y === heading.
import * as THREE from '../vendor/three.module.js';

// Dimensions are in metres. topSpeed is m/s, accel is m/s^2.
export const CAR_TYPES = {
  sedan: { topSpeed: 34, accel: 15, color: 0x3a6fd8, length: 4.4, width: 1.9, height: 1.35 },
  taxi: { topSpeed: 32, accel: 14, color: 0xf2c230, length: 4.4, width: 1.9, height: 1.35 },
  muscle: { topSpeed: 46, accel: 20, color: 0xc22e2e, length: 4.7, width: 2.0, height: 1.25 },
  van: { topSpeed: 26, accel: 10, color: 0x8a8f98, length: 5.6, width: 2.2, height: 2.1 },
};

const WHEEL_RADIUS = 0.36;
const WHEEL_WIDTH = 0.28;

function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity || 1,
    transparent: !!opts.transparent,
    opacity: opts.opacity !== undefined ? opts.opacity : 1,
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function makeWheel(x, z) {
  const geo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 12);
  const mat = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const wheel = new THREE.Mesh(geo, mat);
  wheel.rotation.z = Math.PI / 2; // cylinder axis across the car (x axis)
  wheel.position.set(x, WHEEL_RADIUS, z);
  // Hubcap disc so the wheel reads from the side.
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, WHEEL_WIDTH + 0.02, 10),
    new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }),
  );
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);
  return wheel;
}

// A translucent cone in front of the car, switched on at night for the player car
// (and for police cars). The cone itself is only a visual cue; the scene's real
// night lighting comes from render.js.
function makeHeadlightCone(side, zFront) {
  const geo = new THREE.ConeGeometry(0.55, 3.2, 12, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cone = new THREE.Mesh(geo, mat);
  // ConeGeometry points +y; rotate so it points forward (+z) and slightly down.
  cone.rotation.x = Math.PI / 2 + 0.12;
  cone.position.set(side, 0.55, zFront + 1.6);
  cone.visible = false;
  return cone;
}

export function createCarMesh(type, color) {
  const def = CAR_TYPES[type] || CAR_TYPES.sedan;
  const paint = color !== undefined ? color : def.color;
  const L = def.length;
  const W = def.width;
  const group = new THREE.Group();

  // Blob shadow: a flat dark ellipse under the car. The renderer runs with
  // shadows OFF, so this is what grounds the car visually.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(L * 0.62, W * 0.72, 1);
  shadow.position.y = 0.02;
  group.add(shadow);

  // Main body: lower slab + cabin. Vans get a tall single box instead of a cabin.
  const bodyH = type === 'van' ? 1.5 : 0.62;
  const bodyY = type === 'van' ? 0.55 + bodyH / 2 : 0.42 + bodyH / 2;
  const body = box(L, bodyH, W, paint, 0, bodyY, 0);
  group.add(body);

  // Front and rear bumpers, slightly darker than the paint.
  const bumperColor = new THREE.Color(paint).multiplyScalar(0.55).getHex();
  group.add(box(0.28, 0.22, W * 0.96, bumperColor, L / 2 - 0.1, 0.32, 0));
  group.add(box(0.28, 0.22, W * 0.96, bumperColor, -L / 2 + 0.1, 0.32, 0));

  if (type === 'van') {
    // Van: windshield band and a side window strip on the tall box.
    group.add(box(0.06, 0.5, W * 0.86, 0x1c2733, L / 2 - 0.06, 1.45, 0));
    group.add(box(L * 0.5, 0.45, 0.04, 0x1c2733, -0.2, 1.45, W / 2 + 0.01));
    group.add(box(L * 0.5, 0.45, 0.04, 0x1c2733, -0.2, 1.45, -W / 2 - 0.01));
  } else {
    const cabinL = L * 0.5;
    const cabinW = W * 0.82;
    const cabin = box(cabinL, 0.55, cabinW, paint, -L * 0.04, 0.42 + bodyH + 0.26, 0);
    group.add(cabin);
    // Glass: windshield, rear window and side glass, slightly proud of the cabin.
    const glass = 0x1c2733;
    group.add(box(0.05, 0.42, cabinW * 0.94, glass, cabinL / 2 - L * 0.04 - 0.02, 0.42 + bodyH + 0.26, 0));
    group.add(box(0.05, 0.42, cabinW * 0.94, glass, -cabinL / 2 - L * 0.04 + 0.02, 0.42 + bodyH + 0.26, 0));
    group.add(box(cabinL * 0.86, 0.4, 0.04, glass, -L * 0.04, 0.42 + bodyH + 0.28, cabinW / 2 + 0.01));
    group.add(box(cabinL * 0.86, 0.4, 0.04, glass, -L * 0.04, 0.42 + bodyH + 0.28, -cabinW / 2 - 0.01));
    if (type === 'muscle') {
      // Hood scoop + rear spoiler for the muscle car.
      group.add(box(0.7, 0.12, 0.5, bumperColor, L * 0.28, 0.42 + bodyH + 0.08, 0));
      group.add(box(0.08, 0.05, W * 0.9, bumperColor, -L / 2 + 0.22, 0.42 + bodyH + 0.14, 0));
    }
    if (type === 'taxi') {
      // Roof sign.
      group.add(box(0.5, 0.16, 0.28, 0xf2c230, -L * 0.04, 0.42 + bodyH + 0.62, 0, { emissive: 0x8a6d00 }));
      group.add(box(0.52, 0.05, 0.3, 0x222222, -L * 0.04, 0.42 + bodyH + 0.72, 0));
    }
  }

  // Wheels.
  const axleF = L * 0.32;
  const axleR = -L * 0.32;
  const track = W / 2 + 0.02;
  const wheels = [
    makeWheel(axleF, track), makeWheel(axleF, -track),
    makeWheel(axleR, track), makeWheel(axleR, -track),
  ];
  for (const w of wheels) group.add(w);
  group.userData.wheels = wheels;

  // Headlights (front) and tail lights (rear). Headlight cones start hidden;
  // createCar() turns them on for the player / police car, render.js toggles
  // them with the day/night cycle.
  const hl = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 0.9 });
  group.add(box(0.06, 0.16, 0.3, 0xffffff, L / 2 + 0.01, 0.62, W * 0.28, { emissive: 0xffedb0, emissiveIntensity: 0.9 }));
  group.add(box(0.06, 0.16, 0.3, 0xffffff, L / 2 + 0.01, 0.62, -W * 0.28, { emissive: 0xffedb0, emissiveIntensity: 0.9 }));
  void hl;
  const tailMat = new THREE.MeshLambertMaterial({ color: 0x7a0d0d, emissive: 0xcc1111, emissiveIntensity: 0.8 });
  const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.32), tailMat);
  tailL.position.set(-L / 2 - 0.01, 0.62, W * 0.28);
  const tailR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.32), tailMat);
  tailR.position.set(-L / 2 - 0.01, 0.62, -W * 0.28);
  group.add(tailL, tailR);
  group.userData.tailLights = [tailL, tailR];

  const coneL = makeHeadlightCone(W * 0.28, L / 2);
  const coneR = makeHeadlightCone(-W * 0.28, L / 2);
  group.add(coneL, coneR);
  group.userData.headlightCones = [coneL, coneR];

  group.userData.carType = type;
  group.userData.length = L;
  group.userData.width = W;
  return group;
}

export function createCar(type, x, z, heading, opts = {}) {
  const def = CAR_TYPES[type] || CAR_TYPES.sedan;
  const color = opts.color !== undefined ? opts.color : def.color;
  const mesh = createCarMesh(type, color);
  const isPlayer = !!opts.isPlayer;
  const isPolice = !!opts.isPolice;
  if (isPlayer || isPolice) {
    for (const cone of mesh.userData.headlightCones) cone.visible = true;
  }
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return {
    mesh,
    x, z, heading,
    speed: 0, // signed m/s along the forward axis
    type,
    color,
    length: def.length,
    width: def.width,
    topSpeed: def.topSpeed,
    accel: def.accel,
    isPlayer,
    isPolice,
  };
}

const REVERSE_MAX = 12; // m/s
const STEER_MAX = 0.55; // radians of heading change per second at full lock, scaled by speed
const GRIP = 8; // how fast lateral velocity is killed (arcade grip)

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Arcade driving. controls: {throttle 0..1, steer -1..1, brake 0..1, handbrake bool}.
// throttle accelerates forward, brake slows down and then reverses, handbrake
// (Space / Shift in car) cuts grip so the car slides and turns harder. The car
// collides with the city via city.collideCircle when the city object provides it.
export function driveCar(car, dt, controls, city) {
  const c = controls || {};
  const throttle = clamp(c.throttle || 0, 0, 1);
  const brake = clamp(c.brake || 0, 0, 1);
  const steer = clamp(c.steer || 0, -1, 1);
  const handbrake = !!c.handbrake;

  // Longitudinal: engine force, braking, rolling drag, handbrake slide.
  if (throttle > 0 && car.speed < car.topSpeed) {
    car.speed += car.accel * throttle * dt * (1 - Math.max(0, car.speed) / (car.topSpeed * 1.15));
  }
  if (brake > 0) {
    if (car.speed > 0.5) {
      car.speed -= 26 * brake * dt; // strong brake
    } else {
      car.speed -= car.accel * 0.55 * brake * dt; // reverse
    }
  }
  if (handbrake) {
    car.speed -= car.speed * 2.2 * dt;
    if (Math.abs(car.speed) < 0.4) car.speed = 0;
  } else {
    // Rolling drag + engine braking when no input.
    car.speed -= car.speed * 0.35 * dt;
    if (throttle === 0 && brake === 0 && Math.abs(car.speed) < 0.15) car.speed = 0;
  }
  car.speed = clamp(car.speed, -REVERSE_MAX, car.topSpeed);

  // Steering: turn rate grows with speed up to a point, then falls off at very
  // high speed; reversing flips the turn direction. Handbrake sharpens the turn.
  const speedFactor = clamp(Math.abs(car.speed) / 8, 0, 1) * (1 - clamp(Math.abs(car.speed) / car.topSpeed, 0, 1) * 0.45);
  const turnRate = STEER_MAX * speedFactor * (handbrake ? 1.7 : 1);
  car.heading += steer * turnRate * Math.sign(car.speed || 1) * dt;

  // Integrate, with a slide fallback so the car can scrape along a wall instead
  // of sticking to it.
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const r = Math.max(car.width, car.length) * 0.42;
  const nx = car.x + fx * car.speed * dt;
  const nz = car.z + fz * car.speed * dt;
  const blocked = city && typeof city.collideCircle === 'function'
    ? (px, pz) => city.collideCircle(px, pz, r)
    : () => false;
  if (!blocked(nx, nz)) {
    car.x = nx;
    car.z = nz;
  } else if (!blocked(nx, car.z)) {
    car.x = nx;
    car.speed *= 0.6; // scraped the wall, lost some speed
  } else if (!blocked(car.x, nz)) {
    car.z = nz;
    car.speed *= 0.6;
  } else {
    car.speed = 0; // head-on into something solid
  }

  // Keep the car inside the playable area (city ~520x520 m plus a margin).
  car.x = clamp(car.x, -275, 275);
  car.z = clamp(car.z, -275, 275);

  // Sync the mesh: position, heading, a touch of body roll in corners and a
  // pitch dip under braking, plus spinning wheels.
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.mesh.rotation.z = clamp(-steer * Math.min(Math.abs(car.speed) / 20, 1) * 0.06, -0.08, 0.08);
  car.mesh.rotation.x = clamp(-(throttle > 0 ? 0.02 : 0) + (brake > 0 ? 0.03 : 0), -0.05, 0.05);
  const wheels = car.mesh.userData.wheels || [];
  const spin = (car.speed * dt) / WHEEL_RADIUS;
  for (const w of wheels) w.rotation.x += spin;
  const steerAngle = steer * 0.35 * Math.min(Math.abs(car.speed) / 6 + 0.2, 1);
  if (wheels[0]) wheels[0].rotation.y = steerAngle;
  if (wheels[1]) wheels[1].rotation.y = steerAngle;

  // Brake lights flare while braking or handbraking.
  const braking = brake > 0 || handbrake;
  for (const t of car.mesh.userData.tailLights || []) {
    t.material.emissiveIntensity = braking ? 2.2 : 0.8;
  }
  return car;
}
