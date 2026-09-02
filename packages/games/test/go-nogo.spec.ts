import { Rng } from '@neuron/engine';
import { describe, expect, it } from 'vitest';
import { goNoGo } from '../src/go-nogo';

describe('go-nogo – Invarianten (§12.5)', () => {
  it('über 1000 Seeds: nie mehr als zwei No-Go in Folge, Länge stimmt, beide Reizarten vorhanden', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const config = goNoGo.levelToConfig(1 + (seed % goNoGo.maxLevel));
      const [trial] = goNoGo.generateRun(new Rng(seed), config, config.length);
      expect(trial.stimuli).toHaveLength(config.length);
      let run = 0;
      for (const s of trial.stimuli) {
        run = s === 'nogo' ? run + 1 : 0;
        expect(run).toBeLessThanOrEqual(2);
      }
      expect(trial.stimuli).toContain('go');
      expect(trial.stimuli).toContain('nogo');
    }
  });

  it('Level-Leiter', () => {
    expect(goNoGo.levelToConfig(1)).toEqual({
      length: 43,
      isiMs: 1730,
      stimulusMs: 480,
      noGoRate: 0.25,
    });
    expect(goNoGo.levelToConfig(12)).toEqual({
      length: 76,
      isiMs: 960,
      stimulusMs: 260,
      noGoRate: 0.25,
    });
  });

  it('toResultRows: eine Zeile pro Position, Mehrfachdruck zählt einmal', () => {
    const trial = { stimuli: ['go', 'nogo', 'go', 'nogo'] as const };
    const rows = goNoGo.toResultRows({ stimuli: [...trial.stimuli] }, 0, {
      response: {
        presses: [
          { index: 0, rtMs: 300 },
          { index: 0, rtMs: 350 },
          { index: 1, rtMs: 400 },
        ],
      },
      rtMs: null,
      presentedMs: 5000,
      judgement: { correct: false },
    });
    expect(rows.map((r) => r.correct)).toEqual([true, false, false, true]);
    expect(rows[0].rt_ms).toBe(300);
    expect(rows.map((r) => r.idx)).toEqual([0, 1, 2, 3]);
  });

  it('scoreRows: Kommissionsfehler doppelt gewichtet, Bonus nur mit Treffern', () => {
    const config = goNoGo.levelToConfig(1);
    const go = (rt: number | null, pressed: boolean, idx: number) => ({
      idx,
      response: { pressed },
      rt_ms: rt,
      presented_ms: null,
      correct: pressed,
    });
    const nogo = (pressed: boolean, idx: number) => ({
      idx,
      response: { pressed },
      rt_ms: pressed ? 300 : null,
      presented_ms: null,
      correct: !pressed,
    });
    // 4 go alle getroffen (rt 250), 4 nogo alle korrekt → 1000 + speedBonus(250,500,200)=100
    const perfect = [
      go(250, true, 0),
      go(250, true, 1),
      go(250, true, 2),
      go(250, true, 3),
      nogo(false, 4),
      nogo(false, 5),
      nogo(false, 6),
      nogo(false, 7),
    ];
    expect(goNoGo.scoreRows(config, perfect)).toBe(1100);
    // 2 von 4 nogo gedrückt → hitRate 1 − 2×0.5 = 0 → 0 + Bonus 100
    const half = [
      ...perfect.slice(0, 4),
      nogo(true, 4),
      nogo(true, 5),
      nogo(false, 6),
      nogo(false, 7),
    ];
    expect(goNoGo.scoreRows(config, half)).toBe(100);
    // keine Treffer → kein Bonus
    const none = [go(null, false, 0), go(null, false, 1), nogo(false, 2)];
    expect(goNoGo.scoreRows(config, none)).toBe(0);
    expect(goNoGo.theoreticalMax(config)).toBe(1200);
  });
});
