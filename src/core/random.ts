/**
 * Deterministic randomness. Everything procedural in Elsewhere derives from a
 * drive seed through these helpers so that a drive can be reproduced exactly.
 */

/** Small, fast 32-bit PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Order-dependent 32-bit hash of integer inputs (non-integers are floored). */
export function hashInts(...values: number[]): number {
  let h = 0x811c9dc5 ^ values.length;
  for (let i = 0; i < values.length; i++) {
    const v = Math.floor(values[i]) | 0;
    h = Math.imul(h ^ v, 0x01000193);
    h = fmix32(h + i * 0x9e3779b9);
  }
  return fmix32(h);
}

/** Hash of integer inputs mapped to [0, 1). */
export function hash01(...values: number[]): number {
  return hashInts(...values) / 4294967296;
}

export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  }
  return fmix32(h);
}

/** A non-deterministic seed for "new road" requests. */
export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % 1_000_000_000;
  }
  return Math.floor(Math.random() * 1_000_000_000);
}

/** Convenience wrapper around a seeded PRNG stream. */
export class Rng {
  private readonly nextFn: () => number;

  constructor(seed: number) {
    this.nextFn = mulberry32(seed);
  }

  next(): number {
    return this.nextFn();
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.nextFn();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.nextFn() < p;
  }

  sign(): 1 | -1 {
    return this.nextFn() < 0.5 ? -1 : 1;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.nextFn() * items.length) % items.length];
  }
}
