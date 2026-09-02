import { Rng } from '@neuron/engine';
import { describe, expect, it } from 'vitest';
import {
  digitSum,
  fit,
  numberSequence,
  NUMBER_SEQUENCE_MAX_ABS,
  NUMBER_SEQUENCE_RT_TARGET_MS,
  type NumberSequenceConfig,
} from '../src/number-sequence';
import { rankedConfigList } from '../src/ranked';

describe('number-sequence – Invarianten (§12.8)', () => {
  it('Level-Leiter wächst wie in der Spec', () => {
    expect(numberSequence.levelToConfig(1).ruleKinds).toEqual(['arith']);
    expect(numberSequence.levelToConfig(2).ruleKinds).toEqual(['arith']);
    expect(numberSequence.levelToConfig(3).ruleKinds).toEqual(['arith', 'geom']);
    expect(numberSequence.levelToConfig(5).ruleKinds).toEqual(['arith', 'geom', 'alternating']);
    expect(numberSequence.levelToConfig(7).ruleKinds).toContain('poly2');
    expect(numberSequence.levelToConfig(9).ruleKinds).toContain('fib');
    expect(numberSequence.levelToConfig(11).ruleKinds).toContain('interleaved');
    expect(numberSequence.levelToConfig(13).ruleKinds).toContain('digitsum');
    const top = numberSequence.levelToConfig(14);
    expect(top).toEqual({ ruleKinds: top.ruleKinds, shown: 5, deadlineMs: null, trials: 10 });
    expect(top.ruleKinds).toHaveLength(7);
    expect(numberSequence.levelToConfig(99)).toEqual(top);
    expect(numberSequence.levelToConfig(0)).toEqual(numberSequence.levelToConfig(1));
  });

  it('digitSum', () => {
    expect(digitSum(0)).toBe(0);
    expect(digitSum(7)).toBe(7);
    expect(digitSum(123)).toBe(6);
    expect(digitSum(-45)).toBe(9);
  });

  it('über 1000 Seeds: Folgen sind eindeutig, ganzzahlig und beschränkt', () => {
    const configs: NumberSequenceConfig[] = [
      ...Array.from({ length: numberSequence.maxLevel }, (_, i) =>
        numberSequence.levelToConfig(i + 1),
      ),
      ...rankedConfigList<NumberSequenceConfig>('number-sequence'),
    ];
    for (let seed = 0; seed < 1000; seed++) {
      const config = configs[seed % configs.length];
      const trials = numberSequence.generateRun(new Rng(seed), config, config.trials);
      expect(trials).toHaveLength(config.trials);
      for (const t of trials) {
        expect(t.shown).toHaveLength(config.shown);
        expect(config.ruleKinds).toContain(t.ruleKind);
        for (const x of [...t.shown, t.answer]) {
          expect(Number.isInteger(x)).toBe(true);
          expect(Math.abs(x)).toBeLessThanOrEqual(NUMBER_SEQUENCE_MAX_ABS);
        }
        // Eindeutigkeit: keine andere Regel der Menge sagt etwas anderes voraus
        for (const kind of config.ruleKinds) {
          const predicted = fit(kind, t.shown);
          if (predicted !== null) {
            expect(predicted).toBe(t.answer);
          }
        }
        // Die eigene Regel muss passen
        expect(fit(t.ruleKind, t.shown)).toBe(t.answer);
      }
    }
  });

  it('fit erkennt die Regelfamilien und lehnt Fehlpassungen ab', () => {
    expect(fit('arith', [1, 3, 5, 7, 9])).toBe(11);
    expect(fit('arith', [1, 3, 6, 7, 9])).toBeNull();
    expect(fit('geom', [2, 4, 8, 16, 32])).toBe(64);
    expect(fit('geom', [2, 4, 8, 16, 33])).toBeNull();
    expect(fit('fib', [1, 1, 2, 3, 5])).toBe(8);
    expect(fit('poly2', [1, 4, 9, 16, 25])).toBe(36);
    expect(fit('digitsum', [12, 15, 21, 24, 30])).toBe(33);
  });

  it('judge vergleicht das nächste Glied', () => {
    const trial = { shown: [1, 3, 5, 7, 9], answer: 11, ruleKind: 'arith' as const };
    expect(numberSequence.judge(trial, { value: 11 }).correct).toBe(true);
    expect(numberSequence.judge(trial, { value: 10 }).correct).toBe(false);
  });

  it('scoreRows: 100 + speedBonus(rt, 20000, 50)', () => {
    const config = numberSequence.levelToConfig(1);
    const rows = [
      { idx: 0, response: { value: 1 }, rt_ms: 0, presented_ms: null, correct: true },
      { idx: 1, response: { value: 1 }, rt_ms: 10_000, presented_ms: null, correct: true },
      {
        idx: 2,
        response: { value: 1 },
        rt_ms: NUMBER_SEQUENCE_RT_TARGET_MS,
        presented_ms: null,
        correct: true,
      },
      { idx: 3, response: { value: 0 }, rt_ms: 5000, presented_ms: null, correct: false },
    ];
    expect(numberSequence.scoreRows(config, rows)).toBe(150 + 125 + 100);
    expect(numberSequence.theoreticalMax(config)).toBe(10 * 150);
  });
});
