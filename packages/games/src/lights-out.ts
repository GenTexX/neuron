import {
  finalizeScore,
  scoreViaRows,
  type GameModule,
  type Judgement,
  type Rng,
  type ScoreInput,
  type TrialOutcome,
  type TrialResultRow,
} from '@neuron/engine';
import { rankedConfigFor } from './ranked';
import { field, type ResponseModel } from './shared';

/** §12.10 Lights Out */
export type LightsOutConfig = { size: number; scrambleMoves: number; moveLimit: number | null };
/** `initial` in Rasterreihenfolge (size² Einträge), `true` = Licht an. */
export type LightsOutTrial = { size: number; initial: boolean[]; optimalMoves: number };
export type LightsOutResponse = { moves: number[]; solved: boolean; elapsedMs: number };
/**
 * Draht-Form der einen Zeile. Bewusst rein skalar: der Rust-Scorer kennt den
 * Trial nicht, deshalb reist `optimalMoves` in der Zeile mit (§9.3).
 */
export type LightsOutRowResponse = {
  moveCount: number;
  solved: boolean;
  elapsedMs: number;
  optimalMoves: number;
};

export const LIGHTS_OUT_THEORETICAL_MAX = 600;
export const LIGHTS_OUT_MIN_SCORE = 50;
export const LIGHTS_OUT_MOVE_PENALTY = 25;
export const LIGHTS_OUT_TIME_DIVISOR = 2000;
/** Ziehungen für ein nicht bereits gelöstes Scramble, bevor ein Einzelzug erzwungen wird. */
export const LIGHTS_OUT_SCRAMBLE_ATTEMPTS = 8;

/**
 * Ein Zug schaltet die Zelle und ihre vier orthogonalen Nachbarn um. Züge sind
 * involutiv und kommutativ — daraus folgt `optimalMoves` (§12.10).
 * Zellindizes außerhalb des Rasters bleiben wirkungslos.
 */
export function applyLightsOutMove(state: boolean[], size: number, cell: number): boolean[] {
  const out = state.slice();
  if (!Number.isInteger(cell) || cell < 0 || cell >= size * size) return out;
  const row = Math.floor(cell / size);
  const col = cell % size;
  const toggle = (r: number, c: number): void => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    out[r * size + c] = !out[r * size + c];
  };
  toggle(row, col);
  toggle(row - 1, col);
  toggle(row + 1, col);
  toggle(row, col - 1);
  toggle(row, col + 1);
  return out;
}

/** Wendet eine Zugfolge an; ungültige Indizes werden übersprungen. */
export function applyLightsOutMoves(
  state: readonly boolean[],
  size: number,
  moves: readonly number[],
): boolean[] {
  let out = state.slice();
  for (const cell of moves) out = applyLightsOutMove(out, size, cell);
  return out;
}

export type LightsOutEvaluation = {
  /** Zustand nach Anwendung aller gültigen Züge. */
  state: boolean[];
  solved: boolean;
  /** Anzahl der tatsächlich angewandten (gültigen) Züge. */
  moveCount: number;
};

/**
 * Spielt die Züge gegen `initial` nach. Die `solved`-Angabe des Clients wird
 * bewusst ignoriert und neu berechnet.
 */
export function lightsOutEvaluate(
  trial: LightsOutTrial,
  response: LightsOutResponse,
): LightsOutEvaluation {
  const size = trial.size;
  const cellCount = size * size;
  let state = trial.initial.slice();
  let moveCount = 0;
  for (const cell of response.moves) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= cellCount) continue;
    state = applyLightsOutMove(state, size, cell);
    moveCount++;
  }
  return { state, solved: state.every((on) => !on), moveCount };
}

/** Zieht `scrambleMoves` Zellen und liefert die Zellen mit ungerader Häufigkeit. */
function drawScramble(rng: Rng, cellCount: number, scrambleMoves: number): number[] {
  const counts = new Array<number>(cellCount).fill(0);
  for (let i = 0; i < scrambleMoves; i++) counts[rng.nextBelow(cellCount)]++;
  const odd: number[] = [];
  for (let c = 0; c < cellCount; c++) if (counts[c] % 2 === 1) odd.push(c);
  return odd;
}

export const lightsOut: GameModule<LightsOutConfig, LightsOutTrial, LightsOutResponse> & {
  responseModel: ResponseModel;
} = {
  id: 'lights-out',
  category: 'logic',
  inputKind: 'grid',
  // §12.10: das Spiel ohne Zeitdruck — schaltet §6.2 Punkte 1–2 ab.
  timingSensitive: false,
  responseModel: 'continuous',
  maxLevel: 15,

  /** Ein Run = ein Trial = eine Zeile. */
  trialCount: () => 1,

  levelToConfig(level) {
    const l = Math.min(Math.max(1, Math.floor(level)), 15);
    return {
      // Formel aus §12.10 wörtlich; für l = 15 ergibt sich 6×6.
      size: 3 + Math.floor(l / 5),
      scrambleMoves: 2 + l,
      moveLimit: null,
    };
  },

  rankedConfig: (isoWeek) => rankedConfigFor<LightsOutConfig>('lights-out', isoWeek),

  /**
   * Ausgangsstellung = `scrambleMoves` zufällige Züge aus dem gelösten Zustand.
   * Damit ist Lösbarkeit garantiert (§12.10). `optimalMoves` = Zellen mit
   * ungerader Häufigkeit im Scramble-Multiset. Ergibt das 0 (bereits gelöst),
   * wird begrenzt neu gezogen; danach wird ein Einzelzug erzwungen.
   */
  generateRun(rng, config, _trialCount) {
    const size = Math.max(1, Math.floor(config.size));
    const cellCount = size * size;
    const scrambleMoves = Math.max(0, Math.floor(config.scrambleMoves));
    let odd: number[] = [];
    for (let attempt = 0; attempt < LIGHTS_OUT_SCRAMBLE_ATTEMPTS; attempt++) {
      odd = drawScramble(rng, cellCount, scrambleMoves);
      if (odd.length > 0) break;
    }
    if (odd.length === 0) odd = [rng.nextBelow(cellCount)];
    const initial = applyLightsOutMoves(new Array<boolean>(cellCount).fill(false), size, odd);
    return [{ size, initial, optimalMoves: odd.length }];
  },

  judge(trial, response): Judgement {
    const e = lightsOutEvaluate(trial, response);
    return {
      correct: e.solved,
      solved: e.solved,
      moveCount: e.moveCount,
      optimalMoves: trial.optimalMoves,
      extraMoves: Math.max(0, e.moveCount - trial.optimalMoves),
      correctCount: e.solved ? 1 : 0,
    };
  },

  toResultRows(trial, index, outcome: TrialOutcome<LightsOutResponse>) {
    const presented = outcome.presentedMs === null ? null : Math.round(outcome.presentedMs);
    if (!outcome.response) {
      return [{ idx: index, response: null, rt_ms: null, presented_ms: presented, correct: false }];
    }
    const e = lightsOutEvaluate(trial, outcome.response);
    const elapsedMs = Math.max(0, Math.round(outcome.response.elapsedMs));
    const row: TrialResultRow = {
      idx: index,
      response: {
        moveCount: e.moveCount,
        solved: e.solved,
        elapsedMs,
        optimalMoves: trial.optimalMoves,
      } satisfies LightsOutRowResponse,
      rt_ms: elapsedMs,
      presented_ms: presented,
      correct: e.solved,
    };
    return [row];
  },

  /**
   * `solved ? max(50, 600 − 25·(moveCount − optimalMoves) − floor(elapsedMs/2000)) : 0`,
   * geklemmt auf 600. Rechnet ausschließlich aus der Zeile (§9.3).
   */
  scoreRows(_config, rows) {
    let total = 0;
    for (const row of rows) {
      if (!row.correct) continue;
      const solved = field<boolean>(row.response, 'solved');
      if (solved !== true) continue;
      const moveCount = field<number>(row.response, 'moveCount') ?? 0;
      const optimalMoves = field<number>(row.response, 'optimalMoves') ?? 0;
      const elapsedMs = field<number>(row.response, 'elapsedMs') ?? 0;
      const extra = Math.max(0, moveCount - optimalMoves);
      const timePenalty = Math.floor(Math.max(0, elapsedMs) / LIGHTS_OUT_TIME_DIVISOR);
      const raw = LIGHTS_OUT_THEORETICAL_MAX - LIGHTS_OUT_MOVE_PENALTY * extra - timePenalty;
      total += Math.max(LIGHTS_OUT_MIN_SCORE, raw);
    }
    return finalizeScore(Math.min(LIGHTS_OUT_THEORETICAL_MAX, total));
  },

  score(input: ScoreInput<LightsOutTrial, LightsOutResponse>) {
    return scoreViaRows(lightsOut, input);
  },

  theoreticalMax: () => LIGHTS_OUT_THEORETICAL_MAX,
};
