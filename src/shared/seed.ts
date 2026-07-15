/**
 * seed.ts — Shared seeded RNG system.
 *
 * getDailySeed() returns a string like "CATTACK-2026-06-19" that is
 * identical for every player on the same calendar day (UTC).
 *
 * createRng(seed) returns a function that produces deterministic
 * pseudo-random numbers in [0, 1) using a lightweight mulberry32 PRNG
 * so we avoid shipping the full seedrandom bundle on the server.
 */

export function getDailySeed(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `CATTACK-${y}-${m}-${d}`;
}

/** Simple string → uint32 hash (djb2). */
function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) ^ seed.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h;
}

/** Mulberry32 — tiny, fast, good-quality 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * createRng(seed) → () => number in [0, 1)
 * Pass the daily seed string; identical seeds produce identical sequences.
 */
export function createRng(seed: string): () => number {
  return mulberry32(hashSeed(seed));
}
