// Solmara — the city. Deterministic from the passed rng: same seed, same city.
// 10x10 blocks (40 m) on a 52 m pitch, 12 m roads at x,z = -260..260, coast + beach +
// open water on the south edge (z+), low-poly hills ringing the other three sides.
// Buildings are canvas-textured boxes; colliders are their AABBs (plus props).

import * as THREE from '../vendor/three.module.js';
import { CITY, ROAD_LINES } from './config.js';
import { range, rangeInt, pick, chance } from './random.js';
import {
  asphaltTexture, sidewalkTexture, facadeTexture,
  grassTexture, sandTexture, waterTexture, neonTexture,
} from './textures.js';

const NEON_SIGNS = [
  { text: 'SOLMARA', color: '#ff2e88' },
  { text: 'HOTEL', color: '#22e6ff' },
  { text: 'CASINO', color: '#ffd23e' },
  { text: 'PIER 9', color: '#22e6ff' },
  { text: 'BAR', color: '#ff2e88' },
  { text: 'TACOS', color: '#ffd23e' },
];

function plane(width, depth, material, x, z, y = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

function circleHitsAABB(x, z, r, box) {
  const cx = Math.max(box.x - box.hx, Math.min(x, box.x + box.hx));
  const cz = Math.max(box.z - box.hz, Math.min(z, box.z + box.hz));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

export function createCity(scene, rng) {
  const colliders = [];
  const buildings = [];

  // ---- ground: grass base, sand beach, open water to the south ----
  const grassMat = new THREE.MeshLambertMaterial({ map: grassTexture() });
  grassMat.map.repeat.set(24, 24);
  scene.add(plane(680, 640, grassMat, 0, -14, 0));

  const sandMat = new THREE.MeshLambertMaterial({ map: sandTexture() });
  sandMat.map.repeat.set(24, 1);
  scene.add(plane(680, CITY.waterStart - CITY.beachStart, sandMat, 0,
    (CITY.beachStart + CITY.waterStart) / 2, 0.01));

  const waterMat = new THREE.MeshLambertMaterial({ map: waterTexture() });
  waterMat.map.repeat.set(24, 10);
  scene.add(plane(680, 280, waterMat, 0, CITY.waterStart + 140, 0.005));

  // ---- roads: asphalt strips along every road line, both axes ----
  const asphalt = asphaltTexture();
  const roadMatX = new THREE.MeshLambertMaterial({ map: asphalt.clone() });
  roadMatX.map.repeat.set(1, 20);
  roadMatX.map.needsUpdate = true;
  const roadMatZ = new THREE.MeshLambertMaterial({ map: asphalt.clone() });
  roadMatZ.map.repeat.set(20, 1);
  roadMatZ.map.needsUpdate = true;
  for (const line of ROAD_LINES) {
    scene.add(plane(CITY.road, CITY.size, roadMatX, line, 0, 0.02));
    scene.add(plane(CITY.size, CITY.road, roadMatZ, 0, line, 0.03));
  }

  // ---- sidewalks + buildings, one block at a time ----
  const sidewalk = sidewalkTexture();
  const blockCenters = [];
  for (let i = 0; i < CITY.blocks; i += 1) {
    blockCenters.push(-CITY.half + CITY.pitch / 2 + i * CITY.pitch);
  }

  // Distance of a block centre from the city centre, 0..1 — downtown builds taller.
  const centrality = (bx, bz) => 1 - Math.max(Math.abs(bx), Math.abs(bz)) / CITY.half;

  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      const walk = new THREE.MeshLambertMaterial({ map: sidewalk.clone() });
      walk.map.repeat.set(3, 3);
      walk.map.needsUpdate = true;
      scene.add(plane(CITY.block + 4, CITY.block + 4, walk, bx, bz, 0.05));

      const count = rangeInt(rng, 1, 4);
      const tall = centrality(bx, bz);
      const slots = [];
      if (count === 1) {
        slots.push({ ox: 0, oz: 0, w: range(rng, 22, 32), d: range(rng, 20, 30) });
      } else if (count === 2) {
        const vertical = chance(rng, 0.5);
        for (const s of [-1, 1]) {
          slots.push(vertical
            ? { ox: 0, oz: s * 9, w: range(rng, 20, 30), d: range(rng, 12, 16) }
            : { ox: s * 9, oz: 0, w: range(rng, 12, 16), d: range(rng, 20, 30) });
        }
      } else {
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            if (slots.length >= count) break;
            slots.push({ ox: sx * 9, oz: sz * 9, w: range(rng, 12, 16), d: range(rng, 12, 16) });
          }
        }
      }

      for (const slot of slots) {
        const w = Math.min(slot.w, CITY.block - 4);
        const d = Math.min(slot.d, CITY.block - 4);
        const h = Math.round(range(rng, 8, 14) + tall * range(rng, 0, 46));
        const x = bx + slot.ox;
        const z = bz + slot.oz;
        const variant = rangeInt(rng, 0, 4);
        const lit = chance(rng, 0.55);
        const tex = facadeTexture(variant, lit).clone();
        tex.repeat.set(Math.max(1, Math.round(w / 13)), Math.max(1, Math.round(h / 13)));
        tex.needsUpdate = true;
        const material = new THREE.MeshLambertMaterial({ map: tex });
        if (lit) {
          material.emissiveMap = tex;
          material.emissive = new THREE.Color(0xffc06a);
          material.emissiveIntensity = 0.55;
        }
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, h / 2, z);
        scene.add(mesh);
        // dark roof cap
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.2, 0.4, d + 0.2),
          new THREE.MeshLambertMaterial({ color: 0x2a2c30 }),
        );
        roof.position.set(x, h + 0.2, z);
        scene.add(roof);
        // occasional rooftop AC unit
        if (chance(rng, 0.4)) {
          const ac = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 1.2, 2.4),
            new THREE.MeshLambertMaterial({ color: 0x6a6e75 }),
          );
          ac.position.set(x + range(rng, -w / 4, w / 4), h + 1, z + range(rng, -d / 4, d / 4));
          scene.add(ac);
        }
        colliders.push({ x, z, hx: w / 2, hz: d / 2 });
        buildings.push({ x, z, w, d, h, mesh, variant, lit });
      }
    }
  }

  // ---- neon signs on a few of the tallest buildings ----
  const tallBuildings = [...buildings].sort((a, b) => b.h - a.h).slice(0, NEON_SIGNS.length);
  tallBuildings.forEach((b, i) => {
    const sign = NEON_SIGNS[i % NEON_SIGNS.length];
    const tex = neonTexture(sign.text, sign.color);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), mat);
    // face south (toward the beach / main drag) at the top of the facade
    signMesh.position.set(b.x, b.h - 3.5, b.z + b.d / 2 + 0.15);
    scene.add(signMesh);
  });

  // ---- streetlights at every second intersection ----
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
  const lampMat = new THREE.MeshLambertMaterial({
    color: 0xfff2c8, emissive: 0xffdf8a, emissiveIntensity: 0.9,
  });
  for (let ix = 0; ix < ROAD_LINES.length; ix += 2) {
    for (let iz = 0; iz < ROAD_LINES.length; iz += 2) {
      if (chance(rng, 0.25)) continue;
      const x = ROAD_LINES[ix] + 7;
      const z = ROAD_LINES[iz] + 7;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
      pole.position.set(x, 3.5, z);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
      lamp.position.set(x, 7.1, z);
      scene.add(lamp);
      colliders.push({ x, z, hx: 0.2, hz: 0.2 });
    }
  }

  // ---- palm trees along the beach ----
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f7a33 });
  for (let i = 0; i < 12; i += 1) {
    const x = -280 + i * 52 + range(rng, -8, 8);
    const z = CITY.beachStart + range(rng, 4, 18);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 5, 6), trunkMat);
    trunk.position.set(x, 2.5, z);
    trunk.rotation.z = range(rng, -0.12, 0.12);
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.2, 7), frondMat);
    crown.position.set(x, 6.4, z);
    scene.add(crown);
    colliders.push({ x, z, hx: 0.5, hz: 0.5 });
  }

  // ---- low-poly hills ringing north, west and east ----
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x3d5a3a, flatShading: true });
  const hillMatFar = new THREE.MeshLambertMaterial({ color: 0x4a5a6e, flatShading: true });
  const hillSpots = [];
  for (let i = 0; i < 8; i += 1) hillSpots.push({ x: -340 + i * 95, z: -350 });
  for (let i = 0; i < 6; i += 1) hillSpots.push({ x: -360, z: -300 + i * 100 });
  for (let i = 0; i < 6; i += 1) hillSpots.push({ x: 360, z: -300 + i * 100 });
  for (const spot of hillSpots) {
    const radius = range(rng, 45, 85);
    const height = range(rng, 35, 95);
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 7),
      chance(rng, 0.5) ? hillMat : hillMatFar,
    );
    hill.position.set(spot.x + range(rng, -20, 20), height / 2 - 2, spot.z + range(rng, -20, 20));
    hill.rotation.y = range(rng, 0, Math.PI);
    scene.add(hill);
  }

  // ---- road graph: nodes at every intersection, edges along roads ----
  const nodes = [];
  const nodeIndex = new Map();
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      nodeIndex.set(`${x},${z}`, nodes.length);
      nodes.push({ x, z });
    }
  }
  const edges = [];
  const adjacency = nodes.map(() => []);
  const link = (a, b) => {
    edges.push([a, b]);
    adjacency[a].push(b);
    adjacency[b].push(a);
  };
  const n = ROAD_LINES.length;
  for (let ix = 0; ix < n; ix += 1) {
    for (let iz = 0; iz < n; iz += 1) {
      const id = ix * n + iz;
      if (ix + 1 < n) link(id, (ix + 1) * n + iz);
      if (iz + 1 < n) link(id, ix * n + (iz + 1));
    }
  }
  const roadGraph = { nodes, edges, adjacency, nodeIndex };

  // ---- spawn points: intersections and mid-road points, heading along the road ----
  const spawnPoints = [];
  const headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  for (let i = 0; i < 24; i += 1) {
    const line = pick(rng, ROAD_LINES);
    const along = pick(rng, ROAD_LINES);
    const onXRoad = chance(rng, 0.5);
    spawnPoints.push({
      x: onXRoad ? line : along,
      z: onXRoad ? along : line,
      heading: onXRoad ? pick(rng, [0, Math.PI]) : pick(rng, [Math.PI / 2, -Math.PI / 2]),
    });
  }
  // a few guaranteed beach-side / downtown spawns
  spawnPoints.push({ x: 0, z: 26, heading: 0 });
  spawnPoints.push({ x: -26, z: 0, heading: Math.PI / 2 });
  spawnPoints.push({ x: 0, z: 234, heading: Math.PI });

  function nearestLine(value) {
    let best = ROAD_LINES[0];
    for (const line of ROAD_LINES) {
      if (Math.abs(line - value) < Math.abs(best - value)) best = line;
    }
    return best;
  }

  function isOnRoad(x, z) {
    if (Math.abs(x) > CITY.half + CITY.road || Math.abs(z) > CITY.half + CITY.road) return false;
    const m = CITY.road / 2 + 0.5;
    return Math.abs(x - nearestLine(x)) <= m || Math.abs(z - nearestLine(z)) <= m;
  }

  function nearestRoadPoint(x, z) {
    const nx = nearestLine(x);
    const nz = nearestLine(z);
    // snap to whichever centre-line is closer
    if (Math.abs(x - nx) <= Math.abs(z - nz)) return { x: nx, z };
    return { x, z: nz };
  }

  function collideCircle(x, z, r) {
    // outside the playable bowl: hills to the north/west/east, water to the south
    if (Math.abs(x) > CITY.bounds || z < -CITY.bounds || z > CITY.waterStart - 2) return true;
    for (const box of colliders) {
      if (circleHitsAABB(x, z, r, box)) return true;
    }
    return false;
  }

  return { colliders, roadGraph, spawnPoints, isOnRoad, nearestRoadPoint, collideCircle, buildings };
}
