import {
  finalizeScore,
  scoreViaRows,
  type GameModule,
  type Judgement,
  type ScoreInput,
  type TrialOutcome,
  type TrialResultRow,
} from '@neuron/engine';
import { rankedConfigFor } from './ranked';
import { field, type ResponseModel } from './shared';

/** §12.6 Schulte-Tabelle */
export type SchulteMode = 'numbers' | 'alternating' | 'descending';
export type SchulteConfig = { size: number; mode: SchulteMode; rotating: boolean };
/** `grid`: Zellinhalte in Rasterreihenfolge (size² Einträge); `order`: Zielsequenz. */
export type SchulteTrial = { grid: string[]; order: string[] };
export type SchulteTap = { cell: number; rtMs: number; correct: boolean };
export type SchulteResponse = { taps: SchulteTap[] };
/** Draht-Form der einen Zeile. `totalMs` = rt des letzten korrekten Taps (0 ohne). */
export type SchulteRowResponse = {
  totalMs: number;
  wrongTaps: number;
  completed: boolean;
  taps: SchulteTap[];
};

export const SCHULTE_THEORETICAL_MAX = 600;
export const SCHULTE_SCORE_NUMERATOR = 300000;
export const SCHULTE_WRONG_TAP_PENALTY = 20;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Zielsequenz für eine Config (§12.6). `alternating`: 1-A-2-B-…, insgesamt size² Einträge. */
export function schulteTargetSequence(config: Pick<SchulteConfig, 'size' | 'mode'>): string[] {
  const total = config.size * config.size;
  const out: string[] = [];
  if (config.mode === 'alternating') {
    for (let i = 0; i < total; i++) {
      out.push(i % 2 === 0 ? String(i / 2 + 1) : LETTERS[(i - 1) / 2]);
    }
    return out;
  }
  for (let i = 1; i <= total; i++) out.push(String(i));
  return config.mode === 'descending' ? out.reverse() : out;
}

export type SchulteEvaluation = {
  /** Taps mit neu berechneten `correct`-Flags (Client-Angaben werden ignoriert). */
  taps: SchulteTap[];
  correctTaps: number;
  wrongTaps: number;
  completed: boolean;
  totalMs: number;
};

/** Spielt die Taps gegen `grid`/`order` nach; die `correct`-Flags des Clients zählen nicht. */
export function schulteEvaluate(trial: SchulteTrial, response: SchulteResponse): SchulteEvaluation {
  let next = 0;
  let wrongTaps = 0;
  let totalMs = 0;
  const taps: SchulteTap[] = [];
  for (const tap of response.taps) {
    const hit = next < trial.order.length && trial.grid[tap.cell] === trial.order[next];
    if (hit) {
      next++;
      totalMs = Math.max(0, Math.round(tap.rtMs));
    } else {
      wrongTaps++;
    }
    taps.push({ cell: tap.cell, rtMs: Math.round(tap.rtMs), correct: hit });
  }
  return { taps, correctTaps: next, wrongTaps, completed: next === trial.order.length, totalMs };
}

export const schulte: GameModule<SchulteConfig, SchulteTrial, SchulteResponse> & {
  responseModel: ResponseModel;
} = {
  id: 'schulte',
  category: 'attention',
  inputKind: 'grid',
  timingSensitive: true,
  responseModel: 'continuous',
  maxLevel: 14,

  /** Ein Run = ein Trial = eine Zeile. */
  trialCount: () => 1,

  levelToConfig(level) {
    const l = Math.min(Math.max(1, Math.floor(level)), 14);
    return {
      size: 3 + Math.floor(l / 4),
      mode: l >= 5 ? 'alternating' : 'numbers',
      rotating: l >= 10,
    };
  },

  rankedConfig: (isoWeek) => rankedConfigFor<SchulteConfig>('schulte', isoWeek),

  generateRun(rng, config, _trialCount) {
    const order = schulteTargetSequence(config);
    const grid = rng.shuffled(order);
    return [{ grid, order }];
  },

  judge(trial, response): Judgement {
    const e = schulteEvaluate(trial, response);
    return {
      correct: e.completed,
      completed: e.completed,
      correctTaps: e.correctTaps,
      wrongTaps: e.wrongTaps,
      totalMs: e.totalMs,
      correctCount: e.completed ? 1 : 0,
    };
  },

  toResultRows(trial, index, outcome: TrialOutcome<SchulteResponse>) {
    const presented = outcome.presentedMs === null ? null : Math.round(outcome.presentedMs);
    if (!outcome.response) {
      return [{ idx: index, response: null, rt_ms: null, presented_ms: presented, correct: false }];
    }
    const e = schulteEvaluate(trial, outcome.response);
    const row: TrialResultRow = {
      idx: index,
      response: {
        totalMs: e.totalMs,
        wrongTaps: e.wrongTaps,
        completed: e.completed,
        taps: e.taps,
      } satisfies SchulteRowResponse,
      rt_ms: e.totalMs,
      presented_ms: presented,
      correct: e.completed,
    };
    return [row];
  },

  /** `max(0, round(300000 / totalMs) − 20 × wrongTaps)`, geklemmt auf 600; nur wenn `correct` und `totalMs > 0`. */
  scoreRows(_config, rows) {
    let total = 0;
    for (const row of rows) {
      if (!row.correct) continue;
      const totalMs = field<number>(row.response, 'totalMs');
      const wrongTaps = field<number>(row.response, 'wrongTaps') ?? 0;
      if (typeof totalMs !== 'number' || !(totalMs > 0)) continue;
      const raw = Math.max(
        0,
        Math.round(SCHULTE_SCORE_NUMERATOR / totalMs) - SCHULTE_WRONG_TAP_PENALTY * wrongTaps,
      );
      total += Math.min(SCHULTE_THEORETICAL_MAX, raw);
    }
    return finalizeScore(Math.min(SCHULTE_THEORETICAL_MAX, total));
  },

  score(input: ScoreInput<SchulteTrial, SchulteResponse>) {
    return scoreViaRows(schulte, input);
  },

  theoreticalMax: () => SCHULTE_THEORETICAL_MAX,
};
