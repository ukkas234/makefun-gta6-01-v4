// shots.js — Staged screenshot scenes for ?shot=start|drive|chase|night.
// Each scene sets the world up deterministically from the seeded game object
// main.js built: player and car positions, wanted level, time of day, and which
// screen is showing. main.js paints the staged frame twice and then sets
// window.__shotReady, so the capture always sees the finished frame.
import { STEP } from './config.js';

// Step traffic + police forward so staged cars and cop cars sit mid-action
// instead of frozen at their spawn points.
function settle(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    game.traffic.update(STEP, { x: game.player.x, z: game.player.z }, game.player.car || null);
    game.police.update(STEP, game.player, game.traffic.cars);
  }
}

export function stageShot(name, game) {
  const shot = name || 'start';
  const player = game.player;
  const police = game.police;

  // A clean slate for every shot: no wanted level, no mission, no marker.
  police.reset();
  game.clearMarker();
  game.setObjective('');
  if (game.hud) game.hud.setMission('');

  if (shot === 'drive') {
    // Daytime driving through downtown: Danny in a red muscle car on the
    // main east-west avenue, heading south, camera behind the car.
    game.setClock(13.5);
    game.putPlayerInCar('muscle', 0, 0, 0);
    settle(game, 1.5);
    game.setScreen('playing');
    game.setObjective('Free roam — Solmara is yours');
    return;
  }

  if (shot === 'chase') {
    // Police chase at dusk: 3 stars, two cop cars closing in behind Danny's
    // sedan on the avenue, sun low.
    game.setClock(18.4);
    game.putPlayerInCar('sedan', 0, 52, 0);
    police.addWanted(3);
    // Let the pursuit close in so the cop cars are visible behind the player.
    settle(game, 4);
    game.setScreen('playing');
    game.setObjective('Lose the cops — 3 stars');
    game.showMessage('The cops are on you — lose them!');
    return;
  }

  if (shot === 'night') {
    // Night neon: Danny on foot downtown under the signs, mission complete.
    game.setClock(22.0);
    player.onFoot = true;
    player.car = null;
    player.setPosition(0, 52);
    player.cameraYaw = 0;
    game.setScreen('playing');
    game.showMissionComplete('First Wheels', 200);
    return;
  }

  // Default: 'start' — the title screen over a quiet daytime city.
  game.setClock(11.0);
  player.onFoot = true;
  player.car = null;
  player.setPosition(0, 26);
  player.cameraYaw = 0;
  game.setScreen('title');
}
