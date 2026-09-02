import { Rng } from '@neuron/engine';
import { describe, expect, it } from 'vitest';
import {
  applyStep,
  inResultRange,
  mentalChain,
  MENTAL_CHAIN_MUL_MAX,
  MENTAL_CHAIN_MUL_MIN,
  MENTAL_CHAIN_RESULT_MAX,
  MENTAL_CHAIN_RESULT_MIN,
  MENTAL_CHAIN_START_MAX,
  MENTAL_CHAIN_START_MIN,
} from '../src/mental-chain';
import { rankedConfigList } from '../src/ranked';

describe('mental-chain – Invarianten (§12.1)', () => {
  it('Level-Leiter entspricht der Spec', () => {
    expect(mentalChain.levelToConfig(1)).toEqual({
      steps: 2,
      stepMs: 1500,
      gapMs: 300,
      ops: ['add', 'sub'],
      operandMax: 12,
      trials: 8,
    });
    expect(mentalChain.levelToConfig(3).ops).toEqual(['add', 'sub']);
    expect(mentalChain.levelToConfig(4).ops).toEqual(['add', 'sub', 'mul']);
    expect(mentalChain.levelToConfig(14)).toEqual({
      steps: 9,
      stepMs: 500,
      gapMs: 300,
      ops: ['add', 'sub', 'mul'],
      operandMax: 51,
      trials: 8,
    });
    // Klemmung
    expect(mentalChain.levelToConfig(99)).toEqual(mentalChain.levelToConfig(14));
    expect(mentalChain.levelToConfig(0)).toEqual(mentalChain.levelToConfig(1));
  });

  it('über 1000 Seeds: alle Generierungsregeln halten', () => {
    const configs = [
      ...Array.from({ length: mentalChain.maxLevel }, (_, i) => mentalChain.levelToConfig(i + 1)),
      ...rankedConfigList<ReturnType<typeof mentalChain.levelToConfig>>('mental-chain'),
    ];
    for (let seed = 0; seed < 1000; seed++) {
      const config = configs[seed % configs.length];
      const trials = mentalChain.generateRun(new Rng(seed), config, config.trials);
      expect(trials).toHaveLength(config.trials);
      for (const t of trials) {
        expect(t.start).toBeGreaterThanOrEqual(MENTAL_CHAIN_START_MIN);
        expect(t.start).toBeLessThanOrEqual(MENTAL_CHAIN_START_MAX);
        expect(t.steps).toHaveLength(config.steps);
        let value = t.start;
        let prevMul = false;
        for (const step of t.steps) {
          expect(config.ops).toContain(step.op);
          if (step.op === 'mul') {
            expect(prevMul).toBe(false); // keine zwei mul in Folge
            expect(step.value).toBeGreaterThanOrEqual(MENTAL_CHAIN_MUL_MIN);
            expect(step.value).toBeLessThanOrEqual(MENTAL_CHAIN_MUL_MAX);
          } else {
            expect(step.value).toBeGreaterThanOrEqual(1);
            expect(step.value).toBeLessThanOrEqual(config.operandMax);
          }
          value = applyStep(value, step);
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(MENTAL_CHAIN_RESULT_MIN);
          expect(value).toBeLessThanOrEqual(MENTAL_CHAIN_RESULT_MAX);
          prevMul = step.op === 'mul';
        }
        expect(t.result).toBe(value);
      }
    }
  });

  it('inResultRange', () => {
    expect(inResultRange(0)).toBe(true);
    expect(inResultRange(-999)).toBe(true);
    expect(inResultRange(-1000)).toBe(false);
    expect(inResultRange(9999)).toBe(true);
    expect(inResultRange(10000)).toBe(false);
  });

  it('judge vergleicht das Endergebnis', () => {
    const trial = { start: 5, steps: [{ op: 'add' as const, value: 7 }], result: 12 };
    expect(mentalChain.judge(trial, { value: 12 }).correct).toBe(true);
    expect(mentalChain.judge(trial, { value: 11 }).correct).toBe(false);
  });

  it('scoreRows: 100 + speedBonus(rt, 8000, 50), falsch 0', () => {
    const config = mentalChain.levelToConfig(1);
    const rows = [
      { idx: 0, response: { value: 1 }, rt_ms: 0, presented_ms: null, correct: true },
      { idx: 1, response: { value: 1 }, rt_ms: 4000, presented_ms: null, correct: true },
      { idx: 2, response: { value: 1 }, rt_ms: 9000, presented_ms: null, correct: true },
      { idx: 3, response: { value: 2 }, rt_ms: 1000, presented_ms: null, correct: false },
      { idx: 4, response: null, rt_ms: null, presented_ms: null, correct: false },
    ];
    expect(mentalChain.scoreRows(config, rows)).toBe(150 + 125 + 100);
    // korrekt ohne rt_ms ⇒ kein Bonus
    expect(
      mentalChain.scoreRows(config, [
        { idx: 0, response: { value: 1 }, rt_ms: null, presented_ms: null, correct: true },
      ]),
    ).toBe(100);
    expect(mentalChain.theoreticalMax(config)).toBe(8 * 150);
  });
});
