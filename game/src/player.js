// Danny Reyes on foot: third-person character, camera-relative WASD movement, run, jump,
// punch and pistol combat. The player owns the orbit-camera yaw (mouse drag), so the
// renderer can place the camera behind the player from getState().cameraYaw. While driving
// (onFoot false) the mesh hides and the player rides along with the assigned car.

import * as THREE from '../vendor/three.module.js';

const WALK_SPEED = 4.2;
const RUN_SPEED = 7.6;
const ACCEL = 34;
const JUMP_SPEED = 6.4;
const GRAVITY = 16;
const RADIUS = 0.45;
const PUNCH_RANGE = 1.7;
const PUNCH_COOLDOWN = 0.45;
const SHOOT_COOLDOWN = 0.28;
const TURN_RATE = 12;

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}

function buildCharacterMesh() {
  const group = new THREE.Group();

  const skin = 0xc98d64;
  const jacket = 0x2e5d8a;
  const jeans = 0x2b3440;
  const shoes = 0x1a1a1a;

  const torso = box(0.62, 0.72, 0.34, jacket, 0, 1.08, 0);
  const head = box(0.34, 0.34, 0.32, skin, 0, 1.66, 0);
  const hair = box(0.36, 0.12, 0.34, 0x14100c, 0, 1.86, 0);
  const legL = box(0.24, 0.68, 0.26, jeans, -0.17, 0.36, 0);
  const legR = box(0.24, 0.68, 0.26, jeans, 0.17, 0.36, 0);
  const shoeL = box(0.26, 0.1, 0.38, shoes, -0.17, 0.05, 0.04);
  const shoeR = box(0.26, 0.1, 0.38, shoes, 0.17, 0.05, 0.04);
  const armL = box(0.2, 0.62, 0.22, jacket, -0.43, 1.1, 0);
  const armR = box(0.2, 0.62, 0.22, jacket, 0.43, 1.1, 0);
  // Pistol in the right hand; hidden while holstered.
  const pistol = new THREE.Group();
  pistol.add(box(0.07, 0.12, 0.3, 0x222222, 0, 0, 0.08));
  pistol.add(box(0.06, 0.14, 0.08, 0x333333, 0, -0.1, -0.02));
  pistol.position.set(0.43, 0.82, 0.12);
  pistol.visible = false;

  group.add(torso, head, hair, legL, legR, shoeL, shoeR, armL, armR, pistol);
  group.userData = { legL, legR, armL, armR, pistol };
  return group;
}

export function createPlayer(scene, city) {
  const mesh = buildCharacterMesh();
  scene.add(mesh);

  // Blob shadow: a dark circle on the ground under the player (renderer shadows are off).
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  scene.add(shadow);

  const state = {
    x: 0,
    z: 0,
    y: 0,
    heading: 0,
    speed: 0,
    health: 100,
    onFoot: true,
    car: null,
  };
  let cameraYaw = 0; // Orbit yaw: 0 looks south (+z), drag rotates it.
  let vy = 0;
  let grounded = true;
  let armed = false;
  let punchTimer = 0;
  let shootTimer = 0;
  let walkPhase = 0;
  let invulnerable = 0;

  // Hooks the game wires up: onShoot(origin, direction), onPunch(origin, range).
  const hooks = { onShoot: null, onPunch: null };

  function syncMesh() {
    mesh.position.set(state.x, state.y, state.z);
    mesh.rotation.y = state.heading;
    shadow.position.set(state.x, 0.02, state.z);
    // Shrink the blob shadow a little while airborne.
    const s = state.y > 0 ? Math.max(0.6, 1 - state.y * 0.25) : 1;
    shadow.scale.set(s, s, 1);
  }

  function tryMove(nx, nz) {
    // Axis-separated so the player slides along building walls instead of sticking.
    if (!city || !city.collideCircle(nx, state.z, RADIUS)) state.x = nx;
    if (!city || !city.collideCircle(state.x, nz, RADIUS)) state.z = nz;
  }

  function punch() {
    if (punchTimer > 0) return;
    punchTimer = PUNCH_COOLDOWN;
    // Quick arm swing, resolved by the game through the hook.
    if (hooks.onPunch) {
      const fx = Math.sin(state.heading);
      const fz = Math.cos(state.heading);
      hooks.onPunch(
        new THREE.Vector3(state.x + fx * 0.5, 1.1, state.z + fz * 0.5),
        PUNCH_RANGE,
      );
    }
  }

  function shoot() {
    if (shootTimer > 0 || !armed) return;
    shootTimer = SHOOT_COOLDOWN;
    if (hooks.onShoot) {
      const fx = Math.sin(cameraYaw);
      const fz = Math.cos(cameraYaw);
      // Aim from chest height, level with the camera's forward direction.
      hooks.onShoot(
        new THREE.Vector3(state.x, 1.45, state.z),
        new THREE.Vector3(fx, 0, fz).normalize(),
      );
    }
  }

  function update(dt, input, cityArg) {
    const c = cityArg || city;
    punchTimer = Math.max(0, punchTimer - dt);
    shootTimer = Math.max(0, shootTimer - dt);
    invulnerable = Math.max(0, invulnerable - dt);

    // Mouse-drag orbits the camera around the player.
    cameraYaw += (input.mouseDX || 0) * 0.0045;
    // Clamp vertical drag so it can pitch the camera (renderer reads it via state).
    state.cameraPitch = THREE.MathUtils.clamp(
      (state.cameraPitch || 0.35) - (input.mouseDY || 0) * 0.0025, 0.08, 1.1,
    );

    if (!state.onFoot) {
      // Riding in a car: hide the character, ride along with the car.
      mesh.visible = false;
      shadow.visible = false;
      if (state.car) {
        state.x = state.car.x;
        state.z = state.car.z;
        state.heading = state.car.heading;
        state.speed = Math.abs(state.car.speed || 0);
      }
      syncMesh();
      return;
    }
    mesh.visible = true;
    shadow.visible = true;

    const k = input.keys;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);

    // Camera-relative: with orbit yaw 0 the camera sits north of the player looking
    // south (+z), so the on-screen forward is (sin(cameraYaw), cos(cameraYaw)) and
    // right is (-cos(cameraYaw), sin(cameraYaw)).
    const camFx = Math.sin(cameraYaw);
    const camFz = Math.cos(cameraYaw);
    const camRx = -Math.cos(cameraYaw);
    const camRz = Math.sin(cameraYaw);
    let mx = camFx * fwd + camRx * strafe;
    let mz = camFz * fwd + camRz * strafe;
    const mag = Math.hypot(mx, mz);
    if (mag > 0) {
      mx /= mag;
      mz /= mag;
    }
    const targetSpeed = mag > 0 ? (run ? RUN_SPEED : WALK_SPEED) : 0;
    // Accelerate toward the target speed; stop quicker than starting (responsive halt).
    const rate = targetSpeed > state.speed ? ACCEL : ACCEL * 1.6;
    state.speed = THREE.MathUtils.clamp(
      state.speed + Math.sign(targetSpeed - state.speed) * rate * dt,
      0, Math.max(state.speed, targetSpeed),
    );
    if (targetSpeed === 0 && state.speed < 0.05) state.speed = 0;
    tryMove(state.x + mx * state.speed * dt, state.z + mz * state.speed * dt);

    // Face the movement direction; when standing still, face the camera forward.
    const faceTarget = mag > 0 ? Math.atan2(mx, mz) : cameraYaw;
    let diff = faceTarget - state.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    state.heading += THREE.MathUtils.clamp(diff, -TURN_RATE * dt, TURN_RATE * dt);

    // Jump.
    if (grounded && input.pressed && input.pressed('Space')) {
      vy = JUMP_SPEED;
      grounded = false;
    }
    if (!grounded) {
      vy -= GRAVITY * dt;
      state.y += vy * dt;
      if (state.y <= 0) {
        state.y = 0;
        vy = 0;
        grounded = true;
      }
    }

    // Combat.
    if (input.pressed && input.pressed('KeyQ')) {
      armed = !armed;
      mesh.userData.pistol.visible = armed;
    }
    if (input.pressed && input.pressed('KeyF')) punch();
    if (input.consumeClick && input.consumeClick()) {
      if (armed) shoot();
      else punch();
    }

    // Walk-cycle swing for legs and arms.
    if (state.speed > 0.3 && grounded) {
      walkPhase += dt * state.speed * 1.6;
      const swing = Math.sin(walkPhase) * 0.55;
      mesh.userData.legL.rotation.x = swing;
      mesh.userData.legR.rotation.x = -swing;
      mesh.userData.armL.rotation.x = -swing * 0.7;
      mesh.userData.armR.rotation.x = armed ? 0 : swing * 0.7;
    } else {
      mesh.userData.legL.rotation.x = 0;
      mesh.userData.legR.rotation.x = 0;
      mesh.userData.armL.rotation.x = 0;
      if (!armed) mesh.userData.armR.rotation.x = 0;
    }
    // Punch swing: right arm snaps forward, then eases back.
    if (punchTimer > PUNCH_COOLDOWN - 0.18) mesh.userData.armR.rotation.x = -1.4;
    else if (armed) mesh.userData.armR.rotation.x = -0.5;

    syncMesh();
  }

  function takeDamage(n) {
    if (invulnerable > 0 || state.health <= 0) return state.health;
    state.health = Math.max(0, state.health - n);
    invulnerable = 0.5;
    return state.health;
  }

  function setPosition(x, z) {
    state.x = x;
    state.z = z;
    state.y = 0;
    vy = 0;
    grounded = true;
    syncMesh();
  }

  function getState() {
    return {
      x: state.x,
      z: state.z,
      y: state.y,
      heading: state.heading,
      speed: state.speed,
      health: state.health,
      onFoot: state.onFoot,
      car: state.car,
      armed,
      cameraYaw,
      cameraPitch: state.cameraPitch || 0.35,
    };
  }

  // Full reset for a new game / respawn: health, position, on foot, unarmed.
  function reset(x, z) {
    state.x = x;
    state.z = z;
    state.y = 0;
    state.heading = 0;
    state.speed = 0;
    state.health = 100;
    state.onFoot = true;
    state.car = null;
    cameraYaw = 0;
    state.cameraPitch = 0.35;
    vy = 0;
    grounded = true;
    armed = false;
    invulnerable = 0;
    punchTimer = 0;
    shootTimer = 0;
    mesh.visible = true;
    shadow.visible = true;
    mesh.userData.pistol.visible = false;
    syncMesh();
  }

  syncMesh();

  return {
    mesh,
    get x() { return state.x; },
    get z() { return state.z; },
    get heading() { return state.heading; },
    get speed() { return state.speed; },
    get health() { return state.health; },
    get onFoot() { return state.onFoot; },
    set onFoot(v) { state.onFoot = v; },
    get car() { return state.car; },
    set car(v) { state.car = v; },
    get armed() { return armed; },
    get cameraYaw() { return cameraYaw; },
    set cameraYaw(v) { cameraYaw = v; },
    hooks,
    update,
    takeDamage,
    setPosition,
    reset,
    getState,
  };
}
