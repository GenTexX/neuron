import { describe, expect, it } from 'vitest';
import { Rng, fnv1a32 } from '../src/rng';
import golden from './golden/rng.json';
import fnvGolden from './golden/fnv1a32.json';

describe('Rng (mulberry32) – Golden-File (§5.2)', () => {
  for (const [seed, expected] of Object.entries(golden as Record<string, number[]>)) {
    it(`seed ${seed} liefert die ersten 32 nextU32-Werte`, () => {
      const rng = new Rng(Number(seed));
      const got = Array.from({ length: 32 }, () => rng.nextU32());
      expect(got).toEqual(expected);
    });
  }

  it('nextBelow bleibt in [0, n) und ist deterministisch', () => {
    const a = new Rng(7);
    const b = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const n = 1 + (i % 17);
      const x = a.nextBelow(n);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(n);
      expect(b.nextBelow(n)).toBe(x);
    }
  });

  it('nextBelow wirft bei ungültigem n', () => {
    const rng = new Rng(1);
    expect(() => rng.nextBelow(0)).toThrow();
    expect(() => rng.nextBelow(1.5)).toThrow();
  });

  it('nextRange ist inklusiv an beiden Enden', () => {
    const rng = new Rng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.nextRange(3, 5));
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('shuffled ist eine Permutation und verändert das Original nicht', () => {
    const rng = new Rng(5);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const s = rng.shuffled(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s.slice().sort((x, y) => x - y)).toEqual(items);
  });

  it('sample liefert n verschiedene Elemente', () => {
    const rng = new Rng(11);
    const s = rng.sample([1, 2, 3, 4, 5, 6], 4);
    expect(s).toHaveLength(4);
    expect(new Set(s).size).toBe(4);
  });

  it('nextFloat liegt in [0,1)', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 1000; i++) {
      const f = rng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});

describe('fnv1a32 – Golden-File (§10.3)', () => {
  for (const { input, hash } of fnvGolden as { input: string; hash: number }[]) {
    it(`fnv1a32(${JSON.stringify(input)})`, () => {
      expect(fnv1a32(input)).toBe(hash);
    });
  }
});
