// Keyboard + mouse input for Solmara. Held keys live in `keys`; one-shot presses are
// edge-triggered through pressed(code) and cleared by update(), so a press between two
// frames is never lost and never counted twice. Mouse drag deltas accumulate in
// mouseDX/mouseDY (orbit camera) and are consumed by update(); clicks are queued and
// taken once with consumeClick().

const TRACKED = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space',
  'KeyE', 'KeyF', 'KeyQ', 'KeyM', 'KeyR', 'KeyP', 'Escape',
]);

// Keys whose browser default (scroll, etc.) must not fire while playing.
const PREVENT_DEFAULT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

export function createInput(canvas) {
  const keys = new Set();
  const pressedSet = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let clickQueued = false;
  let mouseHeld = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onKeyDown(event) {
    if (!TRACKED.has(event.code)) return;
    if (PREVENT_DEFAULT.has(event.code)) event.preventDefault();
    if (!event.repeat) pressedSet.add(event.code);
    keys.add(event.code);
  }

  function onKeyUp(event) {
    if (!TRACKED.has(event.code)) return;
    keys.delete(event.code);
  }

  function onBlur() {
    keys.clear();
    dragging = false;
    mouseHeld = false;
  }

  function onPointerDown(event) {
    dragging = true;
    mouseHeld = true;
    lastX = event.clientX;
    lastY = event.clientY;
    clickQueued = true;
    if (canvas.setPointerCapture && event.pointerId !== undefined) {
      try { canvas.setPointerCapture(event.pointerId); } catch { /* already released */ }
    }
  }

  function onPointerMove(event) {
    if (!dragging) return;
    mouseDX += event.clientX - lastX;
    mouseDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function onPointerUp() {
    dragging = false;
    mouseHeld = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  // Clicking outside the canvas (menus, HUD buttons) must not orbit the camera.
  window.addEventListener('pointerup', onPointerUp);

  return {
    /** Currently held tracked keys, by KeyboardEvent.code. */
    keys,
    /** Accumulated horizontal drag pixels since the last update(). */
    get mouseDX() { return mouseDX; },
    /** Accumulated vertical drag pixels since the last update(). */
    get mouseDY() { return mouseDY; },
    /** True while the left mouse button is held down. */
    get mouseHeld() { return mouseHeld; },

    /** True if `code` was pressed since the last update(). Edge-triggered. */
    pressed(code) {
      return pressedSet.has(code);
    },

    /** True once per click since the last call; each click is reported exactly once. */
    consumeClick() {
      const clicked = clickQueued;
      clickQueued = false;
      return clicked;
    },

    /** Clear edge-triggered presses and drag deltas. Call once per frame, after reading. */
    update() {
      pressedSet.clear();
      mouseDX = 0;
      mouseDY = 0;
    },
  };
}
