import { Rng } from '@neuron/engine';
import { describe, expect, it } from 'vitest';
import { nBack, nBackFactor } from '../src/n-back';

describe('n-back – Invarianten (§12.2)', () => {
  it('Level-Leiter entspricht der Spec', () => {
    expect(nBack.levelToConfig(1)).toEqual({
      n: 1,
      length: 22,
      isiMs: 2900,
      alphabet: 8,
      targetRate: 0.3,
    });
    expect(nBack.levelToConfig(4).n).toBe(1);
    expect(nBack.levelToConfig(5)).toEqual({
      n: 2,
      length: 30,
      isiMs: 2500,
      alphabet: 8,
      targetRate: 0.3,
    });
    expect(nBack.levelToConfig(8).n).toBe(2);
    expect(nBack.levelToConfig(9).n).toBe(3);
    expect(nBack.levelToConfig(12)).toEqual({
      n: 3,
      length: 44,
      isiMs: 1800,
      alphabet: 8,
      targetRate: 0.3,
    });
    // isiMs klemmt bei 1400
    expect(nBack.levelToConfig(12).isiMs).toBeGreaterThanOrEqual(1400);
    // Klemmung
    expect(nBack.levelToConfig(0)).toEqual(nBack.levelToConfig(1));
    expect(nBack.levelToConfig(99)).toEqual(nBack.levelToConfig(12));
    expect(nBack.trialCount(nBack.levelToConfig(3))).toBe(26);
  });

  it('über 1000 Seeds: genau ein Trial, Symbole im Alphabet, Zielzahl exakt, isTarget ⇔ symbols[i] === symbols[i−n], Positionen < n nie Ziel', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const config = nBack.levelToConfig(1 + (seed % nBack.maxLevel));
      const trials = nBack.generateRun(new Rng(seed), config, config.length);
      expect(trials).toHaveLength(1);
      const [t] = trials;
      expect(t.symbols).toHaveLength(config.length);
      expect(t.isTarget).toHaveLength(config.length);
      let targets = 0;
      for (let i = 0; i < config.length; i++) {
        expect(Number.isInteger(t.symbols[i])).toBe(true);
        expect(t.symbols[i]).toBeGreaterThanOrEqual(0);
        expect(t.symbols[i]).toBeLessThan(config.alphabet);
        if (i < config.n) {
          expect(t.isTarget[i]).toBe(false);
        } else {
          expect(t.isTarget[i]).toBe(t.symbols[i] === t.symbols[i - config.n]);
        }
        if (t.isTarget[i]) targets++;
      }
      expect(targets).toBe(Math.round(config.length * config.targetRate));
    }
  });

  it('judge: Treffer, Auslassungen, Falschalarme, korrekte Ablehnungen; Mehrfachdruck zählt einmal', () => {
    const trial = {
      symbols: [3, 1, 3, 3, 5, 3],
      isTarget: [false, false, true, false, false, false],
    };
    // n = 2: Index 2 (3 == 3) Ziel; Index 4 (5 != 3) nicht; Index 5 (3 != 5) nicht
    const j = nBack.judge(trial, {
      presses: [
        { index: 2, rtMs: 400 },
        { index: 2, rtMs: 900 },
        { index: 4, rtMs: 300 },
      ],
    });
    expect(j).toEqual({
      correct: false,
      hits: 1,
      misses: 0,
      falseAlarms: 1,
      correctRejections: 4,
      correctCount: 5,
    });
    const perfect = nBack.judge(trial, { presses: [{ index: 2, rtMs: 500 }] });
    expect(perfect.correct).toBe(true);
    expect(perfect.correctCount).toBe(6);
    const none = nBack.judge(trial, { presses: [] });
    expect(none.correct).toBe(false);
    expect(none.misses).toBe(1);
  });

  it('toResultRows: eine Zeile pro Position, rt des ersten Drucks, correct = (isTarget === pressed)', () => {
    const trial = { symbols: [0, 1, 0, 2], isTarget: [false, false, true, false] };
    const rows = nBack.toResultRows(trial, 0, {
      response: {
        presses: [
          { index: 2, rtMs: 350.4 },
          { index: 2, rtMs: 700 },
          { index: 3, rtMs: 420 },
        ],
      },
      rtMs: null,
      presentedMs: 8000,
      judgement: { correct: false },
    });
    expect(rows.map((r) => r.idx)).toEqual([0, 1, 2, 3]);
    expect(rows.map((r) => r.response)).toEqual([
      { pressed: false },
      { pressed: false },
      { pressed: true },
      { pressed: true },
    ]);
    expect(rows.map((r) => r.rt_ms)).toEqual([null, null, 350, 420]);
    expect(rows.map((r) => r.correct)).toEqual([true, true, true, false]);
    expect(rows.every((r) => r.presented_ms === 8000)).toBe(true);
    // keine Antwort: alles ungedrückt
    const empty = nBack.toResultRows(trial, 0, {
      response: null,
      rtMs: null,
      presentedMs: null,
      judgement: { correct: false },
    });
    expect(empty.map((r) => r.correct)).toEqual([true, true, false, true]);
  });

  it('scoreRows: discriminationIndex × 1000 × (1 + 0.25·(n−1)), handgerechnet', () => {
    const row = (idx: number, pressed: boolean, correct: boolean) => ({
      idx,
      response: { pressed },
      rt_ms: pressed ? 400 : null,
      presented_ms: null,
      correct,
    });
    // 3 Ziele: 2 Treffer, 1 Auslassung; 7 Nicht-Ziele: 1 Falschalarm, 6 korrekte Ablehnungen
    const rows = [
      row(0, true, true),
      row(1, true, true),
      row(2, false, false),
      row(3, true, false),
      row(4, false, true),
      row(5, false, true),
      row(6, false, true),
      row(7, false, true),
      row(8, false, true),
      row(9, false, true),
    ];
    // d = 2/3 − 1/7 = 0.52381; × 1000 × 1.25 = 654.76 → 655
    expect(nBack.scoreRows({ ...nBack.levelToConfig(5), n: 2 }, rows)).toBe(655);
    // n = 1: × 1.0 → 524
    expect(nBack.scoreRows({ ...nBack.levelToConfig(1), n: 1 }, rows)).toBe(524);
    // n = 3: × 1.5 → 786
    expect(nBack.scoreRows({ ...nBack.levelToConfig(9), n: 3 }, rows)).toBe(786);
    // perfekt → theoreticalMax
    const perfect = rows.map((r) => ({ ...r, correct: true, response: { pressed: r.idx < 3 } }));
    expect(nBack.scoreRows(nBack.levelToConfig(5), perfect)).toBe(1250);
    // Falschalarmrate ≥ Trefferrate → 0
    const bad = rows.map((r) => ({ ...r, response: { pressed: true }, correct: r.idx < 3 }));
    expect(nBack.scoreRows(nBack.levelToConfig(5), bad)).toBe(0);
    // keine Zeilen → 0
    expect(nBack.scoreRows(nBack.levelToConfig(5), [])).toBe(0);
  });

  it('theoreticalMax = round(1000 × (1 + 0.25·(n−1)))', () => {
    expect(nBackFactor(1)).toBe(1);
    expect(nBack.theoreticalMax(nBack.levelToConfig(1))).toBe(1000);
    expect(nBack.theoreticalMax(nBack.levelToConfig(5))).toBe(1250);
    expect(nBack.theoreticalMax(nBack.levelToConfig(12))).toBe(1500);
  });

  it('score() entspricht scoreRows über toResultRows', () => {
    const config = nBack.levelToConfig(6);
    const trials = nBack.generateRun(new Rng(11), config, config.length);
    const presses = trials[0].isTarget.flatMap((t, index) => (t ? [{ index, rtMs: 500 }] : []));
    const response = { presses };
    const score = nBack.score({
      trials,
      results: [{ response, rtMs: null, judgement: nBack.judge(trials[0], response) }],
      config,
      durationMs: 0,
    });
    expect(score).toBe(nBack.theoreticalMax(config));
  });
});
