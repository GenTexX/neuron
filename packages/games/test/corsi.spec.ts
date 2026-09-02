import { Rng } from '@neuron/engine';
import { describe, expect, it } from 'vitest';
import {
  CORSI_BLOCK_SIZE,
  CORSI_LAYOUT,
  corsi,
  corsiExpectedTaps,
  corsiSequenceLength,
} from '../src/corsi';

describe('corsi – Invarianten (§12.3)', () => {
  it('Level-Leiter entspricht der Spec', () => {
    expect(corsi.levelToConfig(1)).toEqual({
      blocks: 9,
      startLength: 2,
      flashMs: 860,
      gapMs: 250,
      reverse: false,
      trials: 10,
    });
    expect(corsi.levelToConfig(3).startLength).toBe(3);
    expect(corsi.levelToConfig(6).reverse).toBe(false);
    expect(corsi.levelToConfig(7)).toEqual({
      blocks: 9,
      startLength: 4,
      flashMs: 620,
      gapMs: 250,
      reverse: true,
      trials: 10,
    });
    expect(corsi.levelToConfig(12)).toEqual({
      blocks: 9,
      startLength: 6,
      flashMs: 420,
      gapMs: 250,
      reverse: true,
      trials: 10,
    });
    expect(corsi.levelToConfig(0)).toEqual(corsi.levelToConfig(1));
    expect(corsi.levelToConfig(50)).toEqual(corsi.levelToConfig(12));
    expect(corsi.trialCount(corsi.levelToConfig(1))).toBe(10);
  });

  it('CORSI_LAYOUT: 9 Blöcke in 0..1, keine Überlappung bei 12 % Kantenlänge', () => {
    expect(CORSI_LAYOUT).toHaveLength(9);
    const half = CORSI_BLOCK_SIZE / 2;
    for (const p of CORSI_LAYOUT) {
      expect(p.x).toBeGreaterThanOrEqual(half);
      expect(p.x).toBeLessThanOrEqual(1 - half);
      expect(p.y).toBeGreaterThanOrEqual(half);
      expect(p.y).toBeLessThanOrEqual(1 - half);
    }
    // Achsenparallele Quadrate überlappen nicht, wenn max(|dx|,|dy|) >= Kantenlänge;
    // wir fordern stärker: euklidischer Abstand > Kantenlänge·√2 (auch bei Drehung).
    const minDist = CORSI_BLOCK_SIZE * Math.SQRT2;
    for (let i = 0; i < CORSI_LAYOUT.length; i++) {
      for (let j = i + 1; j < CORSI_LAYOUT.length; j++) {
        const dx = CORSI_LAYOUT[i].x - CORSI_LAYOUT[j].x;
        const dy = CORSI_LAYOUT[i].y - CORSI_LAYOUT[j].y;
        expect(Math.hypot(dx, dy)).toBeGreaterThan(minDist);
      }
    }
  });

  it('über 1000 Seeds: feste Positionen, Sequenzlänge startLength + floor(i/2), Blöcke im Bereich, nie zweimal hintereinander', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const config = corsi.levelToConfig(1 + (seed % corsi.maxLevel));
      const trials = corsi.generateRun(new Rng(seed), config, config.trials);
      expect(trials).toHaveLength(config.trials);
      trials.forEach((t, i) => {
        expect(t.positions).toEqual(CORSI_LAYOUT.map((p) => ({ x: p.x, y: p.y })));
        expect(t.reverse).toBe(config.reverse);
        expect(t.sequence).toHaveLength(corsiSequenceLength(config, i));
        expect(t.sequence).toHaveLength(config.startLength + Math.floor(i / 2));
        t.sequence.forEach((b, k) => {
          expect(Number.isInteger(b)).toBe(true);
          expect(b).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThan(config.blocks);
          if (k > 0) expect(b).not.toBe(t.sequence[k - 1]);
        });
      });
    }
  });

  it('judge: vorwärts bzw. rückwärts, falsche Länge oder falscher Block ⇒ falsch', () => {
    const fwd = { positions: [], sequence: [4, 1, 7], reverse: false };
    expect(corsiExpectedTaps(fwd)).toEqual([4, 1, 7]);
    expect(corsi.judge(fwd, { taps: [4, 1, 7] })).toEqual({ correct: true, length: 3 });
    expect(corsi.judge(fwd, { taps: [7, 1, 4] }).correct).toBe(false);
    expect(corsi.judge(fwd, { taps: [4, 1] }).correct).toBe(false);
    expect(corsi.judge(fwd, { taps: [4, 1, 7, 2] }).correct).toBe(false);
    expect(corsi.judge(fwd, { taps: [] }).correct).toBe(false);
    const rev = { ...fwd, reverse: true };
    expect(corsiExpectedTaps(rev)).toEqual([7, 1, 4]);
    expect(corsi.judge(rev, { taps: [7, 1, 4] }).correct).toBe(true);
    expect(corsi.judge(rev, { taps: [4, 1, 7] }).correct).toBe(false);
  });

  it('toResultRows: eine Zeile, Response ist die Tap-Liste', () => {
    const trial = { positions: [], sequence: [1, 2], reverse: false };
    const rows = corsi.toResultRows(trial, 3, {
      response: { taps: [1, 2] },
      rtMs: 1234.6,
      presentedMs: 2200,
      judgement: { correct: true },
    });
    expect(rows).toEqual([
      { idx: 3, response: { taps: [1, 2] }, rt_ms: 1235, presented_ms: 2200, correct: true },
    ]);
  });

  it('scoreRows: 10 × len² je korrekter Zeile, sonst 0 (handgerechnet)', () => {
    const config = corsi.levelToConfig(1);
    const rows = [
      { idx: 0, response: { taps: [1, 2] }, rt_ms: 900, presented_ms: null, correct: true },
      { idx: 1, response: { taps: [3, 4, 5] }, rt_ms: 1200, presented_ms: null, correct: true },
      { idx: 2, response: { taps: [3, 4, 6] }, rt_ms: 1200, presented_ms: null, correct: false },
      { idx: 3, response: null, rt_ms: null, presented_ms: null, correct: false },
      { idx: 4, response: { taps: [0, 1, 2, 3] }, rt_ms: 2000, presented_ms: null, correct: true },
    ];
    expect(corsi.scoreRows(config, rows)).toBe(40 + 90 + 160);
    expect(corsi.scoreRows(config, [rows[2], rows[3]])).toBe(0);
    expect(corsi.scoreRows(config, [])).toBe(0);
  });

  it('theoreticalMax = Σ 10 × (startLength + floor(i/2))²', () => {
    // Level 1: Längen 2,2,3,3,4,4,5,5,6,6 → 10 × (4+4+9+9+16+16+25+25+36+36) = 1800
    expect(corsi.theoreticalMax(corsi.levelToConfig(1))).toBe(1800);
    // Level 12: Längen 6,6,7,7,8,8,9,9,10,10 → 10 × (36+36+49+49+64+64+81+81+100+100) = 6600
    expect(corsi.theoreticalMax(corsi.levelToConfig(12))).toBe(6600);
    expect(corsi.theoreticalMax({ ...corsi.levelToConfig(1), trials: 1 })).toBe(40);
  });

  it('score(): perfekter Run erreicht theoreticalMax; nicht bearbeitete Trials zählen 0', () => {
    const config = corsi.levelToConfig(8);
    const trials = corsi.generateRun(new Rng(21), config, config.trials);
    const results = trials.map((t) => {
      const response = { taps: corsiExpectedTaps(t) };
      return { response, rtMs: 3000, judgement: corsi.judge(t, response) };
    });
    expect(corsi.score({ trials, results, config, durationMs: 0 })).toBe(
      corsi.theoreticalMax(config),
    );
    // Abbruch nach Trial 1: Rest nicht bearbeitet
    const aborted = results.map((r, i) =>
      i < 2 ? r : { response: null, rtMs: null, judgement: { correct: false } },
    );
    const len0 = corsiSequenceLength(config, 0);
    const len1 = corsiSequenceLength(config, 1);
    expect(corsi.score({ trials, results: aborted, config, durationMs: 0 })).toBe(
      10 * len0 * len0 + 10 * len1 * len1,
    );
  });
});
