import { Rng } from '@neuron/engine';
import { describe, expect, it } from 'vitest';
import { schulte, schulteEvaluate, schulteTargetSequence } from '../src/schulte';

describe('schulte – Invarianten (§12.6)', () => {
  it('Level-Leiter entspricht der Spec', () => {
    expect(schulte.levelToConfig(1)).toEqual({ size: 3, mode: 'numbers', rotating: false });
    expect(schulte.levelToConfig(3)).toEqual({ size: 3, mode: 'numbers', rotating: false });
    expect(schulte.levelToConfig(4)).toEqual({ size: 4, mode: 'numbers', rotating: false });
    expect(schulte.levelToConfig(5)).toEqual({ size: 4, mode: 'alternating', rotating: false });
    expect(schulte.levelToConfig(8)).toEqual({ size: 5, mode: 'alternating', rotating: false });
    expect(schulte.levelToConfig(9).rotating).toBe(false);
    expect(schulte.levelToConfig(10)).toEqual({ size: 5, mode: 'alternating', rotating: true });
    expect(schulte.levelToConfig(14)).toEqual({ size: 6, mode: 'alternating', rotating: true });
    expect(schulte.levelToConfig(0)).toEqual(schulte.levelToConfig(1));
    expect(schulte.levelToConfig(40)).toEqual(schulte.levelToConfig(14));
    expect(schulte.trialCount(schulte.levelToConfig(1))).toBe(1);
  });

  it('schulteTargetSequence: numbers, descending, alternating', () => {
    expect(schulteTargetSequence({ size: 3, mode: 'numbers' })).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ]);
    expect(schulteTargetSequence({ size: 3, mode: 'descending' })).toEqual([
      '9',
      '8',
      '7',
      '6',
      '5',
      '4',
      '3',
      '2',
      '1',
    ]);
    expect(schulteTargetSequence({ size: 3, mode: 'alternating' })).toEqual([
      '1',
      'A',
      '2',
      'B',
      '3',
      'C',
      '4',
      'D',
      '5',
    ]);
    const alt4 = schulteTargetSequence({ size: 4, mode: 'alternating' });
    expect(alt4).toHaveLength(16);
    expect(alt4.filter((s) => /^\d+$/.test(s))).toHaveLength(8);
    expect(alt4.filter((s) => /^[A-Z]$/.test(s))).toHaveLength(8);
    expect(alt4[15]).toBe('H');
  });

  it('über 1000 Seeds: genau ein Trial, grid ist Permutation von order, order = Zielsequenz, size² Einträge', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const config = schulte.levelToConfig(1 + (seed % schulte.maxLevel));
      const trials = schulte.generateRun(new Rng(seed), config, 1);
      expect(trials).toHaveLength(1);
      const [t] = trials;
      const n = config.size * config.size;
      expect(t.grid).toHaveLength(n);
      expect(t.order).toHaveLength(n);
      expect(t.order).toEqual(schulteTargetSequence(config));
      expect(new Set(t.grid).size).toBe(n);
      expect(t.grid.slice().sort()).toEqual(t.order.slice().sort());
      if (config.mode === 'alternating') {
        expect(t.order.filter((s) => /^\d+$/.test(s))).toHaveLength(Math.ceil(n / 2));
        expect(t.order.filter((s) => /^[A-Z]$/.test(s))).toHaveLength(Math.floor(n / 2));
      }
    }
  });

  it('judge: rechnet correct-Flags aus grid/order neu; vollständig nur bei allen Zielen in Reihenfolge', () => {
    const trial = { grid: ['3', '1', '4', '2'], order: ['1', '2', '3', '4'] };
    const taps = [
      { cell: 1, rtMs: 500, correct: true },
      { cell: 0, rtMs: 800, correct: true }, // "3" zu früh → falsch, egal was der Client sagt
      { cell: 3, rtMs: 1100, correct: false }, // "2" → richtig, Client-Flag ignoriert
      { cell: 0, rtMs: 1500, correct: true },
      { cell: 2, rtMs: 1900.4, correct: true },
    ];
    const e = schulteEvaluate(trial, { taps });
    expect(e.taps.map((t) => t.correct)).toEqual([true, false, true, true, true]);
    expect(e).toMatchObject({ correctTaps: 4, wrongTaps: 1, completed: true, totalMs: 1900 });
    expect(schulte.judge(trial, { taps })).toEqual({
      correct: true,
      completed: true,
      correctTaps: 4,
      wrongTaps: 1,
      totalMs: 1900,
      correctCount: 1,
    });
    // unvollständig
    const partial = schulte.judge(trial, { taps: taps.slice(0, 3) });
    expect(partial.correct).toBe(false);
    expect(partial).toMatchObject({ correctTaps: 2, wrongTaps: 1, totalMs: 1100 });
    // keine Taps
    expect(schulte.judge(trial, { taps: [] })).toMatchObject({
      correct: false,
      totalMs: 0,
      wrongTaps: 0,
    });
    // Taps nach Abschluss zählen als Fehltipps
    const extra = schulte.judge(trial, { taps: [...taps, { cell: 1, rtMs: 2500, correct: true }] });
    expect(extra).toMatchObject({ correct: true, wrongTaps: 2, totalMs: 1900 });
  });

  it('toResultRows: eine Zeile mit totalMs/wrongTaps/completed/taps; rt_ms = totalMs', () => {
    const trial = { grid: ['2', '1'], order: ['1', '2'] };
    const rows = schulte.toResultRows(trial, 0, {
      response: {
        taps: [
          { cell: 0, rtMs: 300, correct: false },
          { cell: 1, rtMs: 600, correct: true },
          { cell: 0, rtMs: 950, correct: true },
        ],
      },
      rtMs: 950,
      presentedMs: 950,
      judgement: { correct: true },
    });
    expect(rows).toEqual([
      {
        idx: 0,
        response: {
          totalMs: 950,
          wrongTaps: 1,
          completed: true,
          taps: [
            { cell: 0, rtMs: 300, correct: false },
            { cell: 1, rtMs: 600, correct: true },
            { cell: 0, rtMs: 950, correct: true },
          ],
        },
        rt_ms: 950,
        presented_ms: 950,
        correct: true,
      },
    ]);
    const none = schulte.toResultRows(trial, 0, {
      response: null,
      rtMs: null,
      presentedMs: null,
      judgement: { correct: false },
    });
    expect(none).toEqual([
      { idx: 0, response: null, rt_ms: null, presented_ms: null, correct: false },
    ]);
  });

  it('scoreRows: max(0, round(300000/totalMs) − 20·wrongTaps), geklemmt auf 600, 0 ohne Abschluss', () => {
    const config = schulte.levelToConfig(1);
    const row = (totalMs: number, wrongTaps: number, completed: boolean) => ({
      idx: 0,
      response: { totalMs, wrongTaps, completed, taps: [] },
      rt_ms: totalMs,
      presented_ms: null,
      correct: completed,
    });
    // 12000 ms, keine Fehler → 25
    expect(schulte.scoreRows(config, [row(12000, 0, true)])).toBe(25);
    // 8000 ms, 1 Fehltipp → round(37.5)=38 − 20 = 18
    expect(schulte.scoreRows(config, [row(8000, 1, true)])).toBe(18);
    // 10000 ms, 2 Fehltipps → 30 − 40 → 0
    expect(schulte.scoreRows(config, [row(10000, 2, true)])).toBe(0);
    // 400 ms → 750, geklemmt auf 600
    expect(schulte.scoreRows(config, [row(400, 0, true)])).toBe(600);
    // 7000 ms → round(42.857) = 43
    expect(schulte.scoreRows(config, [row(7000, 0, true)])).toBe(43);
    // nicht abgeschlossen → 0
    expect(schulte.scoreRows(config, [row(5000, 0, false)])).toBe(0);
    // totalMs 0 → 0
    expect(schulte.scoreRows(config, [row(0, 0, true)])).toBe(0);
    // keine Antwort → 0
    expect(
      schulte.scoreRows(config, [
        { idx: 0, response: null, rt_ms: null, presented_ms: null, correct: false },
      ]),
    ).toBe(0);
    expect(schulte.scoreRows(config, [])).toBe(0);
  });

  it('theoreticalMax = 600', () => {
    expect(schulte.theoreticalMax(schulte.levelToConfig(1))).toBe(600);
    expect(schulte.theoreticalMax(schulte.levelToConfig(14))).toBe(600);
  });

  it('score() entspricht scoreRows über toResultRows', () => {
    const config = schulte.levelToConfig(6);
    const trials = schulte.generateRun(new Rng(3), config, 1);
    const [t] = trials;
    const taps = t.order.map((v, k) => ({
      cell: t.grid.indexOf(v),
      rtMs: 1000 * (k + 1),
      correct: true,
    }));
    const response = { taps };
    const total = 1000 * t.order.length;
    const score = schulte.score({
      trials,
      results: [{ response, rtMs: total, judgement: schulte.judge(t, response) }],
      config,
      durationMs: total,
    });
    expect(score).toBe(Math.round(300000 / total));
  });
});
