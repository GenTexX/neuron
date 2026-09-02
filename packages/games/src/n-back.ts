import {
  discriminationIndex,
  finalizeScore,
  scoreViaRows,
  type GameModule,
  type Judgement,
  type ScoreInput,
  type TrialOutcome,
  type TrialResultRow,
} from '@neuron/engine';
import { firstPressByIndex } from './go-nogo';
import { rankedConfigFor } from './ranked';
import { field, type ResponseModel } from './shared';

/** §12.2 N-Back */
export type NBackConfig = {
  n: number;
  length: number;
  isiMs: number;
  alphabet: number;
  targetRate: number;
};
/** EIN Trial = der ganze Strom. */
export type NBackTrial = { symbols: number[]; isTarget: boolean[] };
export type NBackPress = { index: number; rtMs: number };
export type NBackResponse = { presses: NBackPress[] };
/** Draht-Form je Stromposition. */
export type NBackRowResponse = { pressed: boolean };

export const N_BACK_ALPHABET = 8;
export const N_BACK_TARGET_RATE = 0.3;

/** Score-Faktor `1 + 0.25·(n−1)` (§12.2). */
export function nBackFactor(n: number): number {
  return 1 + 0.25 * (n - 1);
}

export const nBack: GameModule<NBackConfig, NBackTrial, NBackResponse> & {
  responseModel: ResponseModel;
} = {
  id: 'n-back',
  category: 'working-memory',
  inputKind: 'binary',
  timingSensitive: true,
  responseModel: 'continuous',
  maxLevel: 12,

  /** Eine `trial_result`-Zeile pro Stromposition (§12.2). */
  trialCount: (c) => c.length,

  levelToConfig(level) {
    const l = Math.min(Math.max(1, Math.floor(level)), 12);
    return {
      n: 1 + Math.floor((l - 1) / 4),
      length: 20 + 2 * l,
      isiMs: Math.max(1400, 3000 - 100 * l),
      alphabet: N_BACK_ALPHABET,
      targetRate: N_BACK_TARGET_RATE,
    };
  },

  rankedConfig: (isoWeek) => rankedConfigFor<NBackConfig>('n-back', isoWeek),

  /**
   * Ziele zuerst: `round(length × targetRate)` Positionen ab Index `n` per
   * `sample`. Dann Positionen aufsteigend füllen – Ziele kopieren das Symbol
   * von `i−n`, alle anderen wählen bewusst ein anderes Symbol, damit keine
   * unbeabsichtigten Treffer entstehen.
   */
  generateRun(rng, config, trialCount) {
    const { n, alphabet } = config;
    const candidates: number[] = [];
    for (let i = n; i < trialCount; i++) candidates.push(i);
    const targetCount = Math.min(candidates.length, Math.round(trialCount * config.targetRate));
    const targetSet = new Set(rng.sample(candidates, targetCount));

    const symbols: number[] = [];
    const isTarget: boolean[] = [];
    for (let i = 0; i < trialCount; i++) {
      const target = targetSet.has(i);
      if (i < n) {
        symbols.push(rng.nextBelow(alphabet));
      } else if (target) {
        symbols.push(symbols[i - n]);
      } else {
        symbols.push((symbols[i - n] + 1 + rng.nextBelow(alphabet - 1)) % alphabet);
      }
      isTarget.push(target);
    }
    return [{ symbols, isTarget }];
  },

  judge(trial, response): Judgement {
    const pressed = firstPressByIndex(response.presses);
    let hits = 0;
    let misses = 0;
    let falseAlarms = 0;
    let correctRejections = 0;
    trial.isTarget.forEach((target, i) => {
      const p = pressed.has(i);
      if (target) {
        if (p) hits++;
        else misses++;
      } else if (p) falseAlarms++;
      else correctRejections++;
    });
    return {
      correct: misses === 0 && falseAlarms === 0,
      hits,
      misses,
      falseAlarms,
      correctRejections,
      correctCount: hits + correctRejections,
    };
  },

  toResultRows(trial, _index, outcome: TrialOutcome<NBackResponse>) {
    const pressed = firstPressByIndex(outcome.response?.presses ?? []);
    return trial.isTarget.map((target, i): TrialResultRow => {
      const rt = pressed.get(i);
      const p = rt !== undefined;
      return {
        idx: i,
        response: { pressed: p } satisfies NBackRowResponse,
        rt_ms: p ? Math.round(rt) : null,
        presented_ms: outcome.presentedMs === null ? null : Math.round(outcome.presentedMs),
        correct: target === p,
      };
    });
  },

  /**
   * hit = pressed ∧ correct, falseAlarm = pressed ∧ ¬correct,
   * miss = ¬pressed ∧ ¬correct, correctRejection = ¬pressed ∧ correct.
   */
  scoreRows(config, rows) {
    let hits = 0;
    let misses = 0;
    let falseAlarms = 0;
    let correctRejections = 0;
    for (const row of rows) {
      const pressed = field<boolean>(row.response, 'pressed') === true;
      if (pressed && row.correct) hits++;
      else if (pressed && !row.correct) falseAlarms++;
      else if (!pressed && !row.correct) misses++;
      else correctRejections++;
    }
    const d = discriminationIndex(
      hits,
      hits + misses,
      falseAlarms,
      falseAlarms + correctRejections,
    );
    return finalizeScore(1000 * d * nBackFactor(config.n));
  },

  score(input: ScoreInput<NBackTrial, NBackResponse>) {
    return scoreViaRows(nBack, input);
  },

  theoreticalMax: (config) => Math.round(1000 * nBackFactor(config.n)),
};
