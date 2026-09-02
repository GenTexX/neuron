import { utf8Encode } from './utf8';

/**
 * Deterministischer Zufallsgenerator (mulberry32, §5.1).
 *
 * Arbeitet ausschließlich mit 32-Bit-Operationen und ist damit bitidentisch
 * zur Rust-Implementierung in `apps/api/src/domain/rng.rs`.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Gleichverteilt in [0, 2^32). */
  nextU32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Gleichverteilt in [0, n). Rejection Sampling — kein Modulo-Bias. */
  nextBelow(n: number): number {
    if (!Number.isInteger(n) || n <= 0) throw new Error('nextBelow: n must be a positive integer');
    const threshold = 0x100000000 % n; // 2^32 mod n
    let r: number;
    do {
      r = this.nextU32();
    } while (r < threshold);
    return r % n;
  }

  /** Gleichverteilt in [min, max], beide inklusive. */
  nextRange(min: number, max: number): number {
    return min + this.nextBelow(max - min + 1);
  }

  /** Gleichverteilt in [0, 1). */
  nextFloat(): number {
    return this.nextU32() / 0x100000000;
  }

  /** true mit Wahrscheinlichkeit p. */
  chance(p: number): boolean {
    return this.nextFloat() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.nextBelow(items.length)];
  }

  /** Fisher-Yates, absteigend. Gibt eine neue Liste zurück. */
  shuffled<T>(items: readonly T[]): T[] {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.nextBelow(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** n verschiedene Elemente. n <= items.length. */
  sample<T>(items: readonly T[], n: number): T[] {
    return this.shuffled(items).slice(0, n);
  }
}

/**
 * FNV-1a (32 Bit) über die UTF-8-Bytes eines Strings. Wird für den
 * Ranked-Seed `fnv1a32("<game_id>:<YYYY-MM-DD>")` verwendet (§10.3).
 */
export function fnv1a32(input: string): number {
  const bytes = utf8Encode(input);
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
