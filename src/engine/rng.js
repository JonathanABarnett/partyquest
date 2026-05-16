// Seeded RNG (mulberry32) — deterministic, fast, sufficient for game sim.
// Every game routes every random decision through this so any seed replays exactly.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    seed,
    next,
    int: (max) => Math.floor(next() * max),
    range: (min, max) => min + Math.floor(next() * (max - min + 1)),
    d6: () => 1 + Math.floor(next() * 6),
    roll2d6: () => 1 + Math.floor(next() * 6) + 1 + Math.floor(next() * 6),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

// Hash-mix two seeds for sub-streams (so AI policy decisions can split off
// from world randomness without correlating).
export function mixSeed(a, b) {
  let x = (a ^ (b * 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
