// save.js — Solmara save game: localStorage persistence.
// Key: "solmara-save-v1". Shape: {money, missionsDone[], packages[],
// best, muted}. Every function is safe when localStorage is missing,
// disabled, or full: load returns defaults, save/clear never throw.

export const SAVE_KEY = "solmara-save-v1";

export function defaultSave() {
  return {
    money: 0,
    missionsDone: [],
    packages: [],
    best: null,
    muted: false,
  };
}

// Merge a raw parsed value onto the defaults so old / partial /
// corrupted saves still load as a usable save object.
function normalize(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  if (typeof raw.money === "number" && Number.isFinite(raw.money)) {
    d.money = Math.max(0, Math.floor(raw.money));
  }
  if (Array.isArray(raw.missionsDone)) {
    d.missionsDone = raw.missionsDone.filter((m) => typeof m === "string");
  }
  if (Array.isArray(raw.packages)) {
    d.packages = raw.packages.filter((p) => typeof p === "number");
  }
  if (typeof raw.best === "number" && Number.isFinite(raw.best)) {
    d.best = raw.best;
  } else if (typeof raw.best === "string") {
    d.best = raw.best;
  }
  if (typeof raw.muted === "boolean") d.muted = raw.muted;
  return d;
}

function storageAvailable() {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch (e) {
    return false;
  }
}

export function loadSave() {
  if (!storageAvailable()) return defaultSave();
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    // Storage blocked (private mode, disabled cookies, etc.): defaults.
    return defaultSave();
  }
  if (raw === null || raw === "") return defaultSave();
  try {
    return normalize(JSON.parse(raw));
  } catch (e) {
    // Corrupted JSON: discard and start fresh rather than crashing.
    return defaultSave();
  }
}

export function saveSave(data) {
  if (!storageAvailable()) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(normalize(data)));
    return true;
  } catch (e) {
    // Quota exceeded or storage blocked: fail silently, game continues.
    return false;
  }
}

export function clearSave() {
  if (!storageAvailable()) return false;
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch (e) {
    return false;
  }
}
