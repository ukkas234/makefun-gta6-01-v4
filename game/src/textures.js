// All textures are generated on canvas at runtime — no external assets, no network.
// Every factory returns a THREE.CanvasTexture ready to use as a map (and, for lit facades,
// as an emissiveMap so windows glow at night).

import * as THREE from '../vendor/three.module.js';

/** Tiny deterministic PRNG for speckle placement so textures look identical every run. */
function speck(seed) {
  let a = seed | 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function speckleFill(ctx, rng, width, height, count, colors, sizeMin, sizeMax) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    const s = sizeMin + rng() * (sizeMax - sizeMin);
    ctx.fillRect(rng() * width, rng() * height, s, s);
  }
}

/**
 * Asphalt tile (256x256): dark road surface, speckles, edge lines and a dashed centre line
 * running vertically so it repeats along a road segment.
 */
export function asphaltTexture() {
  const S = 256;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const rng = speck(41);
  ctx.fillStyle = '#2e2f33';
  ctx.fillRect(0, 0, S, S);
  speckleFill(ctx, rng, S, S, 2600, ['#34353a', '#28292d', '#3a3b40', '#232427'], 1, 3);
  // worn tyre tracks
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(52, 0, 26, S);
  ctx.fillRect(178, 0, 26, S);
  // solid edge lines
  ctx.fillStyle = '#d8d8c8';
  ctx.fillRect(6, 0, 3, S);
  ctx.fillRect(S - 9, 0, 3, S);
  // dashed centre line
  ctx.fillStyle = '#e8d44d';
  for (let y = 0; y < S; y += 64) ctx.fillRect(S / 2 - 2, y + 8, 4, 32);
  return toTexture(canvas);
}

/** Sidewalk tile (128x128): pale paving slabs with expansion joints. */
export function sidewalkTexture() {
  const S = 128;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const rng = speck(97);
  ctx.fillStyle = '#8d8f94';
  ctx.fillRect(0, 0, S, S);
  speckleFill(ctx, rng, S, S, 500, ['#97999e', '#83858a', '#a2a4a9'], 1, 2);
  ctx.strokeStyle = '#6d6f74';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 2; i += 1) {
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(S, i * 64); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, S); ctx.stroke();
  }
  return toTexture(canvas);
}

const FACADE_VARIANTS = [
  { base: '#7a6a58', trim: '#5d5044', glass: '#2c3e50' }, // warm brick residential
  { base: '#5b6b7a', trim: '#46545f', glass: '#1d2f45' }, // blue-grey office glass
  { base: '#8a8f96', trim: '#6f747b', glass: '#33414f' }, // pale concrete
  { base: '#9c5a44', trim: '#7c4636', glass: '#3a2c28' }, // red brick
  { base: '#4f5d54', trim: '#3d4842', glass: '#22303a' }, // green-grey midrise
];

/**
 * Building facade (256x256, one face): window grid over a coloured base.
 * `variant` picks a palette; `lit` lights a random subset of windows warm yellow
 * (used as emissiveMap at night so the city glows).
 */
export function facadeTexture(variant = 0, lit = false) {
  const S = 256;
  const v = FACADE_VARIANTS[((variant % FACADE_VARIANTS.length) + FACADE_VARIANTS.length) % FACADE_VARIANTS.length];
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const rng = speck(1000 + variant * 77 + (lit ? 13 : 0));
  ctx.fillStyle = v.base;
  ctx.fillRect(0, 0, S, S);
  speckleFill(ctx, rng, S, S, 350, [v.trim, v.base], 1, 3);
  // ground-floor band
  ctx.fillStyle = v.trim;
  ctx.fillRect(0, S - 26, S, 26);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, S - 28, S, 2);
  // window grid: 6 columns x 8 rows
  const cols = 6;
  const rows = 8;
  const ww = 26;
  const wh = 18;
  const gx = (S - cols * ww) / (cols + 1);
  const gy = 14;
  const rowStep = (S - 26 - gy - rows * wh) / (rows - 1) + wh;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = gx + c * (ww + gx);
      const y = gy + r * rowStep;
      const litWindow = lit && rng() < 0.45;
      ctx.fillStyle = litWindow ? '#ffd98a' : v.glass;
      ctx.fillRect(x, y, ww, wh);
      if (litWindow) {
        ctx.fillStyle = 'rgba(255, 217, 138, 0.35)';
        ctx.fillRect(x - 2, y - 2, ww + 4, wh + 4);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x, y, ww, 5);
      }
      ctx.strokeStyle = v.trim;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, ww, wh);
    }
  }
  return toTexture(canvas);
}

/** Grass tile (128x128): mottled green lawn. */
export function grassTexture() {
  const S = 128;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const rng = speck(7);
  ctx.fillStyle = '#4d8a3f';
  ctx.fillRect(0, 0, S, S);
  speckleFill(ctx, rng, S, S, 1400, ['#5a9a48', '#437a36', '#679f52', '#3c6e31'], 1, 3);
  return toTexture(canvas);
}

/** Sand tile (128x128): warm beach sand with speckles. */
export function sandTexture() {
  const S = 128;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const rng = speck(21);
  ctx.fillStyle = '#d9c08a';
  ctx.fillRect(0, 0, S, S);
  speckleFill(ctx, rng, S, S, 900, ['#cbb37e', '#e6d09a', '#bfa76e', '#ecd6a8'], 1, 3);
  return toTexture(canvas);
}

/** Water tile (128x128): deep blue with soft wave streaks. */
export function waterTexture() {
  const S = 128;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const rng = speck(55);
  ctx.fillStyle = '#1d6f9e';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i += 1) {
    ctx.strokeStyle = rng() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,40,70,0.18)';
    ctx.lineWidth = 1 + rng() * 2;
    const y = rng() * S;
    ctx.beginPath();
    ctx.moveTo(rng() * S * 0.4, y);
    ctx.bezierCurveTo(S * 0.3, y + 4, S * 0.6, y - 4, S, y + 2);
    ctx.stroke();
  }
  return toTexture(canvas);
}

/**
 * Neon sign (512x128, transparent background): glowing text with a coloured halo.
 * Used on sign planes mounted to buildings; the texture itself is the glow.
 */
export function neonTexture(text, color = '#ff2e88') {
  const W = 512;
  const H = 128;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  ctx.fillStyle = color;
  ctx.fillText(text, W / 2, H / 2 + 2);
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, W / 2, H / 2 + 2);
  const texture = toTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
