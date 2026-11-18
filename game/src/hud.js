// hud.js — Solmara HUD: health bar, wanted stars, cash, speed, clock, mission
// objective, message feed, crosshair, and a canvas minimap (roads, player,
// traffic, police, pedestrians, mission marker). Builds its own DOM under #hud.

import { ROAD_LINES } from './config.js';

const MAP_HALF = 260;
const MAP_SIZE = 180;

function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

export function createHUD() {
  const root = document.getElementById('hud');
  if (!root) throw new Error('HUD root #hud is missing from index.html');

  // Top-left cluster: health, wanted, cash.
  const topLeft = el('div', 'hud-topleft', root);
  const healthWrap = el('div', 'hud-health', topLeft);
  const healthFill = el('div', 'hud-health-fill', healthWrap);
  const wanted = el('div', 'hud-wanted', topLeft);
  const cash = el('div', 'hud-cash', topLeft);

  // Top-center: objective + active mission.
  const topCenter = el('div', 'hud-topcenter', root);
  const objective = el('div', 'hud-objective', topCenter);
  const mission = el('div', 'hud-mission', topCenter);

  // Top-right: clock + minimap.
  const topRight = el('div', 'hud-topright', root);
  const clock = el('div', 'hud-clock', topRight);
  const minimap = document.createElement('canvas');
  minimap.id = 'minimap';
  minimap.width = MAP_SIZE;
  minimap.height = MAP_SIZE;
  topRight.appendChild(minimap);
  const mapCtx = minimap.getContext('2d');

  // Bottom-right: speed (only while driving).
  const speed = el('div', 'hud-speed', root);

  // Bottom-left: message feed.
  const feed = el('div', 'hud-feed', root);

  // Center: crosshair (only while armed) and flash text.
  const crosshair = el('div', 'hud-crosshair', root);
  crosshair.textContent = '+';
  const flashEl = el('div', 'hud-flash', root);

  let flashTimer = 0;

  function toMap(x, z) {
    const s = MAP_SIZE / (MAP_HALF * 2);
    return [(x + MAP_HALF) * s, (z + MAP_HALF) * s];
  }

  function drawMinimap(mm) {
    if (!mm) return;
    const c = mapCtx;
    c.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    c.fillStyle = 'rgba(10, 16, 26, 0.82)';
    c.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Roads.
    c.strokeStyle = 'rgba(200, 205, 215, 0.55)';
    c.lineWidth = 2;
    for (const line of ROAD_LINES) {
      const [px] = toMap(line, 0);
      const [, pz] = toMap(0, line);
      c.beginPath(); c.moveTo(px, 0); c.lineTo(px, MAP_SIZE); c.stroke();
      c.beginPath(); c.moveTo(0, pz); c.lineTo(MAP_SIZE, pz); c.stroke();
    }
    // Mission marker: yellow diamond.
    if (mm.marker) {
      const [mx, my] = toMap(mm.marker.x, mm.marker.z);
      c.fillStyle = '#ffd23e';
      c.beginPath();
      c.moveTo(mx, my - 6); c.lineTo(mx + 6, my); c.lineTo(mx, my + 6); c.lineTo(mx - 6, my);
      c.closePath(); c.fill();
    }
    // Pedestrians: small green dots.
    c.fillStyle = '#7ddc7d';
    for (const p of mm.peds || []) {
      const [x, y] = toMap(p.x, p.z);
      c.fillRect(x - 1, y - 1, 2, 2);
    }
    // Traffic: white dots.
    c.fillStyle = '#ffffff';
    for (const car of mm.cars || []) {
      const [x, y] = toMap(car.x, car.z);
      c.beginPath(); c.arc(x, y, 2.5, 0, Math.PI * 2); c.fill();
    }
    // Police: blue dots with a red ring.
    for (const cop of mm.police || []) {
      const [x, y] = toMap(cop.x, cop.z);
      c.fillStyle = '#3a6fd8';
      c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ff4444';
      c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.stroke();
    }
    // Player: white triangle pointing along heading.
    if (mm.player) {
      const [x, y] = toMap(mm.player.x, mm.player.z);
      const h = mm.player.heading || 0;
      // Heading 0 faces +z (down on the map, since map y grows with z).
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      c.fillStyle = '#ffffff';
      c.strokeStyle = '#111111';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x + fx * 7, y + fz * 7);
      c.lineTo(x - fz * 5 - fx * 4, y + fx * 5 - fz * 4);
      c.lineTo(x + fz * 5 - fx * 4, y - fx * 5 - fz * 4);
      c.closePath(); c.fill(); c.stroke();
    }
    // North marker.
    c.fillStyle = '#ffffff';
    c.font = 'bold 11px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('N', 5, 13);
  }

  function update(state) {
    const s = state || {};
    const playing = s.screen === 'playing' || s.screen === 'paused' ||
      s.screen === 'mission-complete' || s.screen === 'busted' || s.screen === 'wasted';
    root.style.display = playing ? 'block' : 'none';
    if (!playing) return;

    const health = Math.max(0, Math.min(100, s.health ?? 100));
    healthFill.style.width = `${health}%`;
    healthFill.style.background = health > 50 ? '#37c978' : health > 25 ? '#f2c230' : '#e5484d';
    healthWrap.title = `Health ${Math.round(health)}`;

    const stars = Math.max(0, Math.min(5, s.wanted ?? 0));
    wanted.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    wanted.classList.toggle('hot', stars > 0);

    cash.textContent = `$${Math.floor(s.money ?? 0).toLocaleString('en-US')}`;

    clock.textContent = s.clock || '10:00';

    if (s.driving) {
      speed.style.display = 'block';
      speed.textContent = `${Math.round(s.speed ?? 0)} km/h`;
    } else {
      speed.style.display = 'none';
    }

    crosshair.style.display = s.armed ? 'block' : 'none';
    drawMinimap(s.minimap);
  }

  function showMessage(text) {
    if (!text) return;
    const line = el('div', 'hud-feed-line', feed);
    line.textContent = text;
    while (feed.children.length > 4) feed.removeChild(feed.firstChild);
    window.setTimeout(() => {
      if (line.parentNode === feed) feed.removeChild(line);
    }, 7000);
  }

  function setObjective(text) {
    objective.textContent = text || '';
    objective.style.display = text ? 'block' : 'none';
  }

  function setMission(title) {
    mission.textContent = title ? `MISSION: ${title}` : '';
    mission.style.display = title ? 'block' : 'none';
  }

  function flash(text) {
    flashEl.textContent = text || '';
    flashEl.classList.toggle('show', !!text);
    if (flashTimer) window.clearTimeout(flashTimer);
    if (text) {
      flashTimer = window.setTimeout(() => {
        flashEl.classList.remove('show');
        flashEl.textContent = '';
      }, 2200);
    }
  }

  setObjective('');
  setMission('');

  return { update, showMessage, setObjective, setMission, flash };
}
