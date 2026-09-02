import { Rng } from '@neuron/engine';
import { describe, expect, it } from 'vitest';
import {
  applyLightsOutMove,
  applyLightsOutMoves,
  lightsOut,
  lightsOutEvaluate,
  type LightsOutTrial,
} from '../src/lights-out';
import { solveLightsOut } from './simulate/lights-out';

/** Alle Lösungen einer Stellung: „light chasing" über jede Belegung der ersten Zeile. */
function allSolutions(size: number, initial: readonly boolean[]): number[][] {
  const out: number[][] = [];
  for (let mask = 0; mask < 1 << size; mask++) {
    let state = initial.slice();
    const presses: number[] = [];
    for (let c = 0; c < size; c++) {
      if ((mask >> c) & 1) {
        presses.push(c);
        state = applyLightsOutMove(state, size, c);
      }
    }
    for (let r = 1; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!state[(r - 1) * size + c]) continue;
        const cell = r * size + c;
        presses.push(cell);
        state = applyLightsOutMove(state, size, cell);
      }
    }
    if (state.every((on) => !on)) out.push(presses);
  }
  return out;
}

/** 3×3, gelöst, dann Mitte gedrückt: Kreuz an. */
const CROSS: LightsOutTrial = {
  size: 3,
  initial: [false, true, false, true, true, true, false, true, false],
  optimalMoves: 1,
};

describe('lights-out – Invarianten (§12.10)', () => {
  it('Level-Leiter entspricht der Spec', () => {
    expect(lightsOut.levelToConfig(1)).toEqual({ size: 3, scrambleMoves: 3, moveLimit: null });
    expect(lightsOut.levelToConfig(4)).toEqual({ size: 3, scrambleMoves: 6, moveLimit: null });
    expect(lightsOut.levelToConfig(5)).toEqual({ size: 4, scrambleMoves: 7, moveLimit: null });
    expect(lightsOut.levelToConfig(9)).toEqual({ size: 4, scrambleMoves: 11, moveLimit: null });
    expect(lightsOut.levelToConfig(10)).toEqual({ size: 5, scrambleMoves: 12, moveLimit: null });
    expect(lightsOut.levelToConfig(14)).toEqual({ size: 5, scrambleMoves: 16, moveLimit: null });
    expect(lightsOut.levelToConfig(15)).toEqual({ size: 6, scrambleMoves: 17, moveLimit: null });
    // Klemmung auf [1, maxLevel]
    expect(lightsOut.levelToConfig(0)).toEqual(lightsOut.levelToConfig(1));
    expect(lightsOut.levelToConfig(-9)).toEqual(lightsOut.levelToConfig(1));
    expect(lightsOut.levelToConfig(99)).toEqual(lightsOut.levelToConfig(15));
    expect(lightsOut.maxLevel).toBe(15);
    expect(lightsOut.trialCount(lightsOut.levelToConfig(1))).toBe(1);
    expect(lightsOut.timingSensitive).toBe(false);
    expect(lightsOut.responseModel).toBe('continuous');
  });

  it('applyLightsOutMove schaltet Zelle plus orthogonale Nachbarn um', () => {
    const off = new Array<boolean>(9).fill(false);
    // Mitte
    expect(applyLightsOutMove(off, 3, 4)).toEqual(CROSS.initial);
    // Ecke oben links: nur 0, 1, 3
    expect(applyLightsOutMove(off, 3, 0)).toEqual([
      true,
      true,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    // Kante rechts unten: 8, 7, 5
    expect(applyLightsOutMove(off, 3, 8)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      true,
      true,
    ]);
    // involutiv
    expect(applyLightsOutMoves(off, 3, [4, 4])).toEqual(off);
    // kommutativ
    expect(applyLightsOutMoves(off, 3, [1, 5, 8])).toEqual(applyLightsOutMoves(off, 3, [8, 1, 5]));
    // ungültige Indizes bleiben wirkungslos
    expect(applyLightsOutMove(off, 3, 9)).toEqual(off);
    expect(applyLightsOutMove(off, 3, -1)).toEqual(off);
    expect(applyLightsOutMove(off, 3, 1.5)).toEqual(off);
    // Eingabe wird nicht mutiert
    expect(off.every((x) => !x)).toBe(true);
  });

  it('über 1000 Seeds: genau ein Trial, lösbar, nie bereits gelöst, optimalMoves erreichbar', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const config = lightsOut.levelToConfig(1 + (seed % lightsOut.maxLevel));
      const trials = lightsOut.generateRun(new Rng(seed), config, 1);
      expect(trials).toHaveLength(1);
      const [t] = trials;
      const cellCount = config.size * config.size;
      expect(t.size).toBe(config.size);
      expect(t.initial).toHaveLength(cellCount);
      // nie bereits gelöst
      expect(t.initial.some((on) => on)).toBe(true);
      expect(t.optimalMoves).toBeGreaterThanOrEqual(1);
      expect(t.optimalMoves).toBeLessThanOrEqual(Math.min(config.scrambleMoves, cellCount));
      // Parität: aus dem Scramble-Multiset kann nur ein gleich-paritätisches Odd-Set entstehen
      expect(t.optimalMoves % 2).toBe(config.scrambleMoves % 2);
      // Lösbarkeit ist garantiert, weil aus dem gelösten Zustand gescrambelt wurde
      const solution = solveLightsOut(config.size, t.initial);
      expect(solution).not.toBeNull();
      expect(applyLightsOutMoves(t.initial, config.size, solution ?? []).every((on) => !on)).toBe(
        true,
      );
      // optimalMoves ist tatsächlich mit einem Zugsatz dieser Größe erreichbar
      const sizes = allSolutions(config.size, t.initial).map((s) => s.length);
      expect(sizes).toContain(t.optimalMoves);
    }
  });

  it('judge rechnet den Endzustand nach und ignoriert die solved-Angabe des Clients', () => {
    expect(lightsOut.judge(CROSS, { moves: [4], solved: false, elapsedMs: 900 })).toEqual({
      correct: true,
      solved: true,
      moveCount: 1,
      optimalMoves: 1,
      extraMoves: 0,
      correctCount: 1,
    });
    // dreimal dieselbe Zelle = einmal
    expect(lightsOut.judge(CROSS, { moves: [4, 4, 4], solved: false, elapsedMs: 0 })).toMatchObject(
      {
        correct: true,
        moveCount: 3,
        extraMoves: 2,
      },
    );
    // zweimal dieselbe Zelle = gar nicht
    expect(lightsOut.judge(CROSS, { moves: [4, 4], solved: true, elapsedMs: 0 })).toMatchObject({
      correct: false,
      solved: false,
      moveCount: 2,
    });
    // falscher Zug
    expect(lightsOut.judge(CROSS, { moves: [0], solved: true, elapsedMs: 0 })).toMatchObject({
      correct: false,
      moveCount: 1,
    });
    // ungültige Indizes zählen nicht mit
    expect(
      lightsOut.judge(CROSS, { moves: [4, 99, -1, 2.5], solved: true, elapsedMs: 0 }),
    ).toMatchObject({ correct: true, moveCount: 1 });
    expect(lightsOutEvaluate(CROSS, { moves: [], solved: true, elapsedMs: 0 })).toMatchObject({
      solved: false,
      moveCount: 0,
    });
  });

  it('toResultRows: eine Zeile mit skalarem moveCount/solved/elapsedMs/optimalMoves', () => {
    const rows = lightsOut.toResultRows(CROSS, 0, {
      response: { moves: [4, 4, 4], solved: false, elapsedMs: 1234.6 },
      rtMs: 1234.6,
      presentedMs: 1300.2,
      judgement: { correct: true },
    });
    expect(rows).toEqual([
      {
        idx: 0,
        response: { moveCount: 3, solved: true, elapsedMs: 1235, optimalMoves: 1 },
        rt_ms: 1235,
        presented_ms: 1300,
        correct: true,
      },
    ]);
    // ungelöst
    expect(
      lightsOut.toResultRows(CROSS, 0, {
        response: { moves: [0], solved: true, elapsedMs: 500 },
        rtMs: 500,
        presentedMs: null,
        judgement: { correct: false },
      }),
    ).toEqual([
      {
        idx: 0,
        response: { moveCount: 1, solved: false, elapsedMs: 500, optimalMoves: 1 },
        rt_ms: 500,
        presented_ms: null,
        correct: false,
      },
    ]);
    // keine Antwort
    expect(
      lightsOut.toResultRows(CROSS, 0, {
        response: null,
        rtMs: null,
        presentedMs: null,
        judgement: { correct: false },
      }),
    ).toEqual([{ idx: 0, response: null, rt_ms: null, presented_ms: null, correct: false }]);
  });

  it('scoreRows: max(50, 600 − 25·Mehrzüge − floor(elapsedMs/2000)), sonst 0', () => {
    const config = lightsOut.levelToConfig(10);
    const row = (moveCount: number, solved: boolean, elapsedMs: number, optimalMoves: number) => ({
      idx: 0,
      response: { moveCount, solved, elapsedMs, optimalMoves },
      rt_ms: elapsedMs,
      presented_ms: null,
      correct: solved,
    });
    // optimal und ohne Zeitverbrauch → 600
    expect(lightsOut.scoreRows(config, [row(8, true, 0, 8)])).toBe(600);
    // 2 Mehrzüge, 30 s → 600 − 50 − 15 = 535
    expect(lightsOut.scoreRows(config, [row(10, true, 30000, 8)])).toBe(535);
    // 3999 ms → floor(3999/2000) = 1 → 599
    expect(lightsOut.scoreRows(config, [row(8, true, 3999, 8)])).toBe(599);
    // 4000 ms → 2 → 598
    expect(lightsOut.scoreRows(config, [row(8, true, 4000, 8)])).toBe(598);
    // 1 Mehrzug, 12 s → 600 − 25 − 6 = 569
    expect(lightsOut.scoreRows(config, [row(9, true, 12000, 8)])).toBe(569);
    // extrem viele Mehrzüge → Untergrenze 50
    expect(lightsOut.scoreRows(config, [row(30, true, 0, 6)])).toBe(50);
    // extrem lange Bearbeitung → Untergrenze 50
    expect(lightsOut.scoreRows(config, [row(6, true, 1200000, 6)])).toBe(50);
    // weniger Züge als optimalMoves ⇒ keine Gutschrift, aber auch keine Strafe
    expect(lightsOut.scoreRows(config, [row(5, true, 0, 8)])).toBe(600);
    // ungelöst → 0
    expect(lightsOut.scoreRows(config, [row(8, false, 1000, 8)])).toBe(0);
    // Zeile behauptet solved, ist aber nicht als correct markiert → 0
    expect(
      lightsOut.scoreRows(config, [
        {
          idx: 0,
          response: { moveCount: 8, solved: true, elapsedMs: 0, optimalMoves: 8 },
          rt_ms: 0,
          presented_ms: null,
          correct: false,
        },
      ]),
    ).toBe(0);
    // keine Antwort → 0
    expect(
      lightsOut.scoreRows(config, [
        { idx: 0, response: null, rt_ms: null, presented_ms: null, correct: false },
      ]),
    ).toBe(0);
    expect(lightsOut.scoreRows(config, [])).toBe(0);
  });

  it('theoreticalMax = 600 für jede Config', () => {
    for (let l = 1; l <= lightsOut.maxLevel; l++) {
      expect(lightsOut.theoreticalMax(lightsOut.levelToConfig(l))).toBe(600);
    }
    expect(lightsOut.theoreticalMax(lightsOut.rankedConfig(7))).toBe(600);
  });

  it('score() entspricht scoreRows über toResultRows', () => {
    const config = lightsOut.levelToConfig(6);
    const trials = lightsOut.generateRun(new Rng(21), config, 1);
    const [t] = trials;
    const moves = solveLightsOut(config.size, t.initial) ?? [];
    const response = { moves, solved: true, elapsedMs: 20000 };
    const score = lightsOut.score({
      trials,
      results: [{ response, rtMs: 20000, judgement: lightsOut.judge(t, response) }],
      config,
      durationMs: 20000,
    });
    const extra = Math.max(0, moves.length - t.optimalMoves);
    expect(score).toBe(Math.max(50, 600 - 25 * extra - 10));
  });
});
