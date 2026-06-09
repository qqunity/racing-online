// Deterministic pseudo-random number generator shared by client and server.
// Same seed -> same sequence on every machine, which is what makes the race
// fair: every player faces an identical stream of traffic and power-ups.

// mulberry32: tiny, fast, good-enough 32-bit PRNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Small helper wrapper with convenience methods.
export function createRng(seed) {
  const next = mulberry32(seed);
  return {
    next, // float in [0, 1)
    int(min, max) {
      // inclusive min, exclusive max
      return Math.floor(next() * (max - min)) + min;
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    chance(p) {
      return next() < p;
    },
  };
}
