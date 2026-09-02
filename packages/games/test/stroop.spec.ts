import { Rng } from '@neuron/engine';
import { describe, expect, it } from 'vitest';
import { stroop, stroopAnswer } from '../src/stroop';

describe('stroop – Invarianten (§12.4)', () => {
  it('Level-Leiter entspricht der Spec', () => {
    expect(stroop.levelToConfig(1)).toEqual({
      colors: 3,
      congruentRate: 0.57,
      deadlineMs: 2110,
      switchRule: false,
      trials: 30,
    });
    expect(stroop.levelToConfig(8).switchRule).toBe(true);
    expect(stroop.levelToConfig(15)).toEqual({
      colors: 5,
      congruentRate: 0.2,
      deadlineMs: 900,
      switchRule: true,
      trials: 30,
    });
  });

  it('über 1000 Seeds: Farben im Bereich, inkongruent ⇒ ink ≠ word, Regel nur bei switchRule', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const config = stroop.levelToConfig(1 + (seed % stroop.maxLevel));
      const trials = stroop.generateRun(new Rng(seed), config, config.trials);
      let congruent = 0;
      for (const t of trials) {
        expect(t.word).toBeGreaterThanOrEqual(0);
        expect(t.word).toBeLessThan(config.colors);
        expect(t.ink).toBeGreaterThanOrEqual(0);
        expect(t.ink).toBeLessThan(config.colors);
        if (t.word === t.ink) congruent++;
        if (!config.switchRule) expect(t.rule).toBe('ink');
      }
      expect(congruent).toBeGreaterThan(0);
    }
  });

  it('judge: Regel bestimmt die richtige Antwort', () => {
    const t = { word: 1, ink: 3, rule: 'ink' as const };
    expect(stroopAnswer(t)).toBe(3);
    expect(stroop.judge(t, { choice: 3 }).correct).toBe(true);
    expect(stroop.judge({ ...t, rule: 'word' }, { choice: 1 }).correct).toBe(true);
    expect(stroop.judge(t, { choice: 1 }).correct).toBe(false);
  });

  it('scoreRows: korrekt 100+Bonus, falsch −40, keine Antwort 0, geklemmt bei 0', () => {
    const config = stroop.levelToConfig(1);
    const rows = [
      { idx: 0, response: { choice: 1 }, rt_ms: 0, presented_ms: 10, correct: true },
      { idx: 1, response: { choice: 1 }, rt_ms: 1055, presented_ms: 1055, correct: true },
      { idx: 2, response: { choice: 0 }, rt_ms: 500, presented_ms: 500, correct: false },
      { idx: 3, response: null, rt_ms: null, presented_ms: 2110, correct: false },
    ];
    expect(stroop.scoreRows(config, rows)).toBe(160 + 130 - 40);
    expect(stroop.scoreRows(config, [rows[2], rows[2]])).toBe(0);
    expect(stroop.theoreticalMax(config)).toBe(4800);
  });
});
