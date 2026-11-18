// traffic.js — Solmara ambient traffic. AI cars drive the city road graph, turn at
// intersections, and stop when a car ahead of them is too close. Original work for
// the Solmara open-world crime sandbox (make.fun gta6-01).
import { createCar, CAR_TYPES } from './vehicles.js';

// City grid from the design spec: roads at x,z = -260..260, step 52 m.
const ROAD_MIN = -260;
const ROAD_MAX = 260;
const ROAD_STEP = 52;
const STOP_GAP = 9; // metres of clear road needed ahead before rolling again
const LOOK_AHEAD = 14; // metres ahead scanned for a car in front

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function dist2(ax, az, bx, bz) { const dx = ax - bx; const dz = az - bz; return dx * dx + dz * dz; }

// Build the intersection graph for the 10x10 block grid. Nodes are intersections,
// edges link neighbouring intersections along a road. A node is {x, z, id} and the
// graph keeps an adjacency list of node ids.
function buildGridGraph() {
  const nodes = [];
  const index = new Map();
  for (let x = ROAD_MIN; x <= ROAD_MAX; x += ROAD_STEP) {
    for (let z = ROAD_MIN; z <= ROAD_MAX; z += ROAD_STEP) {
      const id = nodes.length;
      nodes.push({ x, z, id });
      index.set(`${x},${z}`, id);
    }
  }
  const adj = nodes.map(() => []);
  for (const n of nodes) {
    for (const [dx, dz] of [[ROAD_STEP, 0], [-ROAD_STEP, 0], [0, ROAD_STEP], [0, -ROAD_STEP]]) {
      const other = index.get(`${n.x + dx},${n.z + dz}`);
      if (other !== undefined) adj[n.id].push(other);
    }
  }
  return { nodes, adj };
}

// Normalise whatever roadGraph shape city.js hands us into {nodes, adj}.
// Accepted shapes: {nodes:[{x,z}], edges:[[a,b]]} or {nodes, adj}, or a flat
// array of {x, z} nodes (edges inferred from shared road lines). Falls back to
// the spec grid when the city provides nothing usable.
function normaliseGraph(city) {
  const g = city && city.roadGraph;
  if (g && Array.isArray(g.nodes) && g.nodes.length > 0) {
    const nodes = g.nodes.map((n, i) => ({ x: n.x, z: n.z, id: i }));
    let adj;
    if (Array.isArray(g.adj) && g.adj.length === nodes.length) {
      adj = g.adj.map((list) => list.slice());
    } else if (Array.isArray(g.edges) && g.edges.length > 0) {
      adj = nodes.map(() => []);
      for (const [a, b] of g.edges) {
        if (a >= 0 && a < nodes.length && b >= 0 && b < nodes.length) {
          adj[a].push(b);
          adj[b].push(a);
        }
      }
    } else {
      adj = nodes.map(() => []);
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i]; const b = nodes[j];
          if ((a.x === b.x && Math.abs(a.z - b.z) === ROAD_STEP) ||
              (a.z === b.z && Math.abs(a.x - b.x) === ROAD_STEP)) {
            adj[i].push(j);
            adj[j].push(i);
          }
        }
      }
    }
    return { nodes, adj };
  }
  return buildGridGraph();
}

function randomType() {
  const r = Math.random();
  if (r < 0.45) return 'sedan';
  if (r < 0.7) return 'taxi';
  if (r < 0.85) return 'muscle';
  return 'van';
}

function headingToward(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
}

function turnToward(current, target, maxStep) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + clamp(d, -maxStep, maxStep);
}

export function createTraffic(scene, city, count) {
  const graph = normaliseGraph(city);
  const { nodes, adj } = graph;
  const cars = [];
  const blocked = city && typeof city.collideCircle === 'function'
    ? (x, z, r) => city.collideCircle(x, z, r)
    : () => false;

  function randomNode() {
    return nodes[Math.floor(Math.random() * nodes.length)];
  }

  function spawnCar() {
    const start = randomNode();
    const neighbours = adj[start.id].filter((id) => id !== undefined);
    if (neighbours.length === 0) return null;
    const nextId = neighbours[Math.floor(Math.random() * neighbours.length)];
    const next = nodes[nextId];
    const type = randomType();
    // Start a little way along the first edge so cars do not all sit exactly
    // on intersections, and stagger them along the road.
    const along = 4 + Math.random() * 20;
    const total = Math.hypot(next.x - start.x, next.z - start.z) || 1;
    const sx = start.x + ((next.x - start.x) / total) * along;
    const sz = start.z + ((next.z - start.z) / total) * along;
    const car = createCar(type, sx, sz, headingToward(sx, sz, next.x, next.z));
    const cruise = (CAR_TYPES[type].topSpeed * (0.45 + Math.random() * 0.2));
    scene.add(car.mesh);
    const entry = {
      car,
      from: start.id,
      to: nextId,
      cruise, // target speed m/s when the road ahead is clear
      speed: cruise * (0.5 + Math.random() * 0.5),
      stopped: false,
    };
    car.speed = entry.speed;
    return entry;
  }

  const wanted = Math.max(0, count | 0);
  for (let i = 0; i < wanted; i += 1) {
    const entry = spawnCar();
    if (entry) cars.push(entry);
  }

  // Is there another car (traffic, or the player's car passed in as playerCar)
  // directly ahead of `entry` within LOOK_AHEAD metres? Uses the car's forward
  // axis, so cars in the next lane or behind do not block it.
  function carAhead(entry, playerCar) {
    const c = entry.car;
    const fx = Math.sin(c.heading);
    const fz = Math.cos(c.heading);
    let nearest = Infinity;
    const check = (other) => {
      if (!other || other === c) return;
      const dx = other.x - c.x;
      const dz = other.z - c.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > LOOK_AHEAD) return;
      const across = Math.abs(dx * fz - dz * fx);
      if (across > 2.6) return; // different lane
      const gap = along - (other.length || 4.4) / 2 - c.length / 2;
      if (gap < nearest) nearest = gap;
    };
    for (const e of cars) check(e.car);
    if (playerCar) check(playerCar);
    return nearest;
  }

  function pickNext(entry) {
    const options = adj[entry.to].filter((id) => id !== entry.from);
    const pool = options.length > 0 ? options : adj[entry.to];
    if (pool.length === 0) {
      // Dead end (should not happen on the grid): turn around.
      const tmp = entry.from;
      entry.from = entry.to;
      entry.to = tmp;
      return;
    }
    // Prefer going straight (keeps traffic flowing along avenues), otherwise
    // pick a random turn.
    const cur = nodes[entry.from];
    const at = nodes[entry.to];
    const dx = at.x - cur.x;
    const dz = at.z - cur.z;
    const straight = pool.find((id) => nodes[id].x === at.x + dx && nodes[id].z === at.z + dz);
    const nextId = straight !== undefined && Math.random() < 0.7
      ? straight
      : pool[Math.floor(Math.random() * pool.length)];
    entry.from = entry.to;
    entry.to = nextId;
  }

  function update(dt, playerPos, playerCar) {
    for (const entry of cars) {
      const c = entry.car;
      const target = nodes[entry.to];
      const d = Math.hypot(target.x - c.x, target.z - c.z);

      if (d < 3.5) pickNext(entry);

      // Stop for the car ahead; creep forward again once the gap opens.
      const gap = carAhead(entry, playerCar);
      const wantStop = gap < STOP_GAP;
      if (wantStop) {
        entry.speed = Math.max(0, entry.speed - 22 * dt);
      } else {
        entry.speed = Math.min(entry.cruise, entry.speed + 8 * dt);
      }
      c.speed = entry.speed;

      // Steer smoothly toward the target intersection.
      const desired = headingToward(c.x, c.z, nodes[entry.to].x, nodes[entry.to].z);
      const turnRate = 2.4 * dt * (entry.speed > 0.5 ? 1 : 0);
      c.heading = turnToward(c.heading, desired, turnRate);

      const nx = c.x + Math.sin(c.heading) * entry.speed * dt;
      const nz = c.z + Math.cos(c.heading) * entry.speed * dt;
      const r = Math.max(c.width, c.length) * 0.42;
      if (!blocked(nx, nz, r)) {
        c.x = nx;
        c.z = nz;
      } else {
        // Something solid is in the way (should not happen on roads): stop
        // and pick a different turn at the next intersection.
        entry.speed = 0;
        c.speed = 0;
      }

      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      const wheels = c.mesh.userData.wheels || [];
      const spin = (entry.speed * dt) / 0.36;
      for (const w of wheels) w.rotation.x += spin;
    }
    void playerPos; // reserved: callers may pass the player's position for future use
  }

  function nearestCar(x, z, maxDist) {
    let best = null;
    let bestD2 = maxDist * maxDist;
    for (const entry of cars) {
      const d2 = dist2(x, z, entry.car.x, entry.car.z);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = entry.car;
      }
    }
    return best;
  }

  return { cars: cars.map((e) => e.car), update, nearestCar };
}
