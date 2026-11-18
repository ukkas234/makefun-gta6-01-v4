// Solmara's 3D view: scene, third-person camera, WebGL renderer, fog, hemisphere +
// directional sun and a full day/night cycle. Night is a dark blue sky with dim cool
// light; streetlights and neon are emissive materials owned by the city, so they read
// on their own once the sun goes down. Renderer shadows stay OFF (blob shadows only);
// pixelRatio is capped at 1.5 for desktop frame rate.

import * as THREE from '../vendor/three.module.js';

const DAY_SKY = new THREE.Color(0x87b5e0);
const DUSK_SKY = new THREE.Color(0xe08a5a);
const NIGHT_SKY = new THREE.Color(0x0a1128);
const DAY_FOG = new THREE.Color(0x9db8cc);
const NIGHT_FOG = new THREE.Color(0x0a1128);
const DAY_SUN = new THREE.Color(0xfff2d8);
const NIGHT_MOON = new THREE.Color(0x8fa8d8);
const DAY_HEMI_SKY = new THREE.Color(0xbfd9ff);
const NIGHT_HEMI_SKY = new THREE.Color(0x1a2a4a);
const GROUND = new THREE.Color(0x3a3f45);
const NIGHT_GROUND = new THREE.Color(0x14161c);

const FOG_NEAR = 120;
const FOG_FAR = 620;
const CAMERA_DISTANCE = 9;
const CAMERA_HEIGHT = 3.4;

/** Sun elevation (radians above the horizon) for an hour of the day. */
function sunElevation(hour) {
  // Noon is overhead, 06:00/18:00 on the horizon, night below it.
  return Math.sin(((hour - 6) / 12) * Math.PI) * 1.1;
}

export function createWorld3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = DAY_SKY.clone();
  scene.fog = new THREE.Fog(DAY_FOG.getHex(), FOG_NEAR, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
  camera.position.set(0, CAMERA_HEIGHT, -CAMERA_DISTANCE);

  const hemi = new THREE.HemisphereLight(DAY_HEMI_SKY.getHex(), GROUND.getHex(), 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(DAY_SUN.getHex(), 2.4);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(sun.target);

  // Faint cool fill from the opposite side so night streets never go pitch black.
  const fill = new THREE.DirectionalLight(0x4a5a7a, 0.25);
  fill.position.set(-80, 60, -120);
  scene.add(fill);

  let timeOfDay = 12; // Hour of day, 0–24.
  let nightFactor = 0; // 0 = full day, 1 = full night.
  let followTarget = null; // {x, z, cameraYaw, cameraPitch} — third-person follow.
  const smoothCamPos = new THREE.Vector3(0, CAMERA_HEIGHT, -CAMERA_DISTANCE);
  let camSmoothed = false;

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  /** Set the game clock. `hour` is 0–24 (06:00 dawn, 12:00 noon, 18:00 dusk). */
  function setTimeOfDay(hour) {
    timeOfDay = ((hour % 24) + 24) % 24;
    const elev = sunElevation(timeOfDay);
    const dayFactor = THREE.MathUtils.clamp(elev / 0.9, 0, 1);
    nightFactor = 1 - dayFactor;

    // Sky: day blue, through dusk orange near the horizon hours, to dark night blue.
    const sky = DAY_SKY.clone();
    const duskAmount = THREE.MathUtils.clamp(1 - Math.abs(elev) / 0.35, 0, 1) * (1 - nightFactor);
    sky.lerp(DUSK_SKY, duskAmount * 0.7);
    sky.lerp(NIGHT_SKY, nightFactor);
    scene.background = sky;

    const fogColor = DAY_FOG.clone().lerp(NIGHT_FOG, nightFactor);
    scene.fog.color.copy(fogColor);
    scene.fog.near = FOG_NEAR - nightFactor * 40;
    scene.fog.far = FOG_FAR - nightFactor * 180;

    // Sun by day, moon by night: same light, lower and cooler after dark.
    const sunAzimuth = ((timeOfDay - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(
      Math.cos(sunAzimuth),
      Math.max(0.08, Math.sin(sunAzimuth)),
      0.35,
    ).normalize();
    sun.position.copy(sunDir).multiplyScalar(240);
    sun.color.copy(DAY_SUN).lerp(NIGHT_MOON, nightFactor);
    sun.intensity = 2.4 * dayFactor + 0.35 * nightFactor;
    hemi.color.copy(DAY_HEMI_SKY).lerp(NIGHT_HEMI_SKY, nightFactor);
    hemi.groundColor.copy(GROUND).lerp(NIGHT_GROUND, nightFactor);
    hemi.intensity = 0.9 * dayFactor + 0.35 * nightFactor;
    fill.intensity = 0.25 + nightFactor * 0.15;
    renderer.toneMappingExposure = 1.05 - nightFactor * 0.15;
  }

  /** Third-person follow target: the player state ({x, z, cameraYaw, cameraPitch}). */
  function setFollow(target) {
    followTarget = target;
  }

  function update(dt) {
    if (followTarget) {
      const yaw = followTarget.cameraYaw || 0;
      const pitch = followTarget.cameraPitch || 0.35;
      const dist = CAMERA_DISTANCE;
      const height = CAMERA_HEIGHT + Math.sin(pitch) * 4;
      // Camera sits opposite the view direction from the player.
      const cx = followTarget.x - Math.sin(yaw) * dist;
      const cz = followTarget.z - Math.cos(yaw) * dist;
      // Smooth follow: snap on the first frame, then damp so turns and sprints
      // don't whip the camera.
      if (!camSmoothed) {
        smoothCamPos.set(cx, height, cz);
        camSmoothed = true;
      } else {
        smoothCamPos.x = THREE.MathUtils.damp(smoothCamPos.x, cx, 8, dt);
        smoothCamPos.y = THREE.MathUtils.damp(smoothCamPos.y, height, 8, dt);
        smoothCamPos.z = THREE.MathUtils.damp(smoothCamPos.z, cz, 8, dt);
      }
      camera.position.copy(smoothCamPos);
      camera.lookAt(followTarget.x, 1.6, followTarget.z);
    }
    renderer.render(scene, camera);
  }

  resize();
  window.addEventListener('resize', resize);
  setTimeOfDay(timeOfDay);

  return {
    scene,
    camera,
    renderer,
    setTimeOfDay,
    setFollow,
    update,
    /** 0 = full day, 1 = full night (for HUD / streetlight logic). */
    get nightFactor() { return nightFactor; },
    get timeOfDay() { return timeOfDay; },
  };
}
