import { describe, expect, it } from 'vitest';
import { discriminationIndex, finalizeScore, median, speedBonus } from '../src/scoring';

describe('Scoring-Bausteine (§7.3)', () => {
  it('speedBonus fällt linear und ist 0 ab targetMs', () => {
    expect(speedBonus(0, 1000)).toBe(50);
    expect(speedBonus(500, 1000)).toBe(25);
    expect(speedBonus(1000, 1000)).toBe(0);
    expect(speedBonus(2000, 1000)).toBe(0);
    expect(speedBonus(250, 1000, 200)).toBe(150);
  });

  it('discriminationIndex ist Trefferrate minus Falschalarmrate, geklemmt bei 0', () => {
    expect(discriminationIndex(10, 10, 0, 20)).toBe(1);
    expect(discriminationIndex(5, 10, 5, 10)).toBe(0);
    expect(discriminationIndex(0, 10, 10, 10)).toBe(0);
    expect(discriminationIndex(8, 10, 2, 20)).toBeCloseTo(0.7);
    expect(discriminationIndex(0, 0, 0, 0)).toBe(0);
  });

  it('median', () => {
    expect(median([])).toBe(0);
    expect(median([3])).toBe(3);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('finalizeScore rundet und klemmt bei 0', () => {
    expect(finalizeScore(-5)).toBe(0);
    expect(finalizeScore(12.5)).toBe(13);
    expect(finalizeScore(12.4)).toBe(12);
  });
});
