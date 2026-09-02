import { describe, expect, it } from 'vitest';
import { applyStaircase, INITIAL_STAIRCASE, type StaircaseState } from '../src/staircase';

const ok = { accuracy: 0.85, valid: true };
const fail = { accuracy: 0.5, valid: true };

describe('Staircase 3-up-1-down (§7.4)', () => {
  it('steigt erst nach drei Erfolgen in Folge', () => {
    let s: StaircaseState = INITIAL_STAIRCASE;
    s = applyStaircase(s, ok, 10);
    expect(s).toEqual({ level: 1, consecutiveUp: 1, runsPlayed: 1 });
    s = applyStaircase(s, ok, 10);
    expect(s.level).toBe(1);
    s = applyStaircase(s, ok, 10);
    expect(s).toEqual({ level: 2, consecutiveUp: 0, runsPlayed: 3 });
  });

  it('accuracy genau 0.80 zählt als Erfolg', () => {
    const s = applyStaircase(INITIAL_STAIRCASE, { accuracy: 0.8, valid: true }, 10);
    expect(s.consecutiveUp).toBe(1);
  });

  it('sinkt nach einem Misserfolg und setzt den Zähler zurück', () => {
    let s: StaircaseState = { level: 5, consecutiveUp: 2, runsPlayed: 9 };
    s = applyStaircase(s, fail, 10);
    expect(s).toEqual({ level: 4, consecutiveUp: 0, runsPlayed: 10 });
  });

  it('klemmt auf [1, maxLevel]', () => {
    expect(applyStaircase({ level: 1, consecutiveUp: 0, runsPlayed: 0 }, fail, 10).level).toBe(1);
    expect(applyStaircase({ level: 10, consecutiveUp: 2, runsPlayed: 0 }, ok, 10).level).toBe(10);
  });

  it('ungültige Runs verändern Level und Zähler nicht', () => {
    const before: StaircaseState = { level: 3, consecutiveUp: 2, runsPlayed: 4 };
    const after = applyStaircase(before, { accuracy: 1, valid: false }, 10);
    expect(after).toEqual({ level: 3, consecutiveUp: 2, runsPlayed: 5 });
  });

  it('konvergiert bei simulierter Erfolgsquote nicht über maxLevel hinaus', () => {
    let s: StaircaseState = INITIAL_STAIRCASE;
    for (let i = 0; i < 100; i++) s = applyStaircase(s, ok, 6);
    expect(s.level).toBe(6);
  });
});
