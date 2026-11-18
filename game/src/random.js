// Seeded randomness (mulberry32): the same seed gives the same city, which is what makes
// the screenshot scenes repeatable. Every helper takes the rng function as its first argument
// so callers can thread one deterministic stream through world generation.

/** mulberry32 PRNG. Returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Alias kept for the kit starter's naming. */
export const createRandom = mulberry32;

/** Float in [min, max). */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** Integer in [min, max] inclusive. */
export function rangeInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of a non-empty array, uniformly. */
export function pick(rng, array) {
  return array[Math.floor(rng() * array.length)];
}

/** One of the given values, uniformly (variadic form of pick). */
export function choice(rng, ...values) {
  return values[Math.floor(rng() * values.length)];
}

/** True with probability p (0..1). */
export function chance(rng, p) {
  return rng() < p;
}

/** In-place Fisher-Yates shuffle; returns the same array. */
export function shuffle(rng, array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}
