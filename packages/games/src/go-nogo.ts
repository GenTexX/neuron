import {
  finalizeScore,
  median,
  scoreViaRows,
  speedBonus,
  type GameModule,
  type Judgement,
  type ScoreInput,
  type TrialOutcome,
  type TrialResultRow,
} from '@neuron/engine';
import { rankedConfigFor } from './ranked';
import { field, type ResponseModel } from './shared';

/** §12.5 Go/No-Go */
export type GoNoGoConfig = { length: number; isiMs: number; stimulusMs: number; noGoRate: number };
export type GoNoGoStimulus = 'go' | 'nogo';
export type GoNoGoTrial = { stimuli: GoNoGoStimulus[] };
export type GoNoGoPress = { index: number; rtMs: number };
export type GoNoGoResponse = { presses: GoNoGoPress[] };
/** Draht-Form je Stromposition. */
export type GoNoGoRowResponse = { pressed: boolean };

export const GO_NOGO_RT_TARGET_MS = 500;
export const GO_NOGO_RT_BONUS = 200;

/** Erste Reaktion je Position; Mehrfachdrücke zählen als einer (§12.2 analog). */
export function firstPressByIndex(presses: readonly GoNoGoPress[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of presses) {
    const prev = m.get(p.index);
    if (prev === undefined || p.rtMs < prev) m.set(p.index, p.rtMs);
  }
  return m;
}

export const goNoGo: GameModule<GoNoGoConfig, GoNoGoTrial, GoNoGoResponse> & {
  responseModel: ResponseModel;
} = {
  id: 'go-nogo',
  category: 'attention',
  inputKind: 'binary',
  timingSensitive: true,
  responseModel: 'continuous',
  maxLevel: 12,

  trialCount: (c) => c.length,

  levelToConfig(level) {
    const l = Math.min(Math.max(1, Math.floor(level)), 12);
    return {
      length: 40 + 3 * l,
      isiMs: Math.max(700, 1800 - 70 * l),
      stimulusMs: Math.max(200, 500 - 20 * l),
      noGoRate: 0.25,
    };
  },

  rankedConfig: (isoWeek) => rankedConfigFor<GoNoGoConfig>('go-nogo', isoWeek),

  /** Ein Trial = der ganze Strom; `trialCount` ist die Stromlänge. */
  generateRun(rng, config, trialCount) {
    const stimuli: GoNoGoStimulus[] = [];
    for (let i = 0; i < trialCount; i++) {
      const lastTwoNoGo = i >= 2 && stimuli[i - 1] === 'nogo' && stimuli[i - 2] === 'nogo';
      const nogo = !lastTwoNoGo && rng.chance(config.noGoRate);
      stimuli.push(nogo ? 'nogo' : 'go');
    }
    return [{ stimuli }];
  },

  judge(trial, response): Judgement {
    const pressed = firstPressByIndex(response.presses);
    let hits = 0;
    let misses = 0;
    let commissions = 0;
    let correctRejections = 0;
    trial.stimuli.forEach((s, i) => {
      const p = pressed.has(i);
      if (s === 'go') {
        if (p) hits++;
        else misses++;
      } else if (p) commissions++;
      else correctRejections++;
    });
    return {
      correct: misses === 0 && commissions === 0,
      hits,
      misses,
      commissions,
      correctRejections,
      correctCount: hits + correctRejections,
    };
  },

  toResultRows(trial, _index, outcome: TrialOutcome<GoNoGoResponse>) {
    const pressed = firstPressByIndex(outcome.response?.presses ?? []);
    return trial.stimuli.map((s, i): TrialResultRow => {
      const rt = pressed.get(i);
      const p = rt !== undefined;
      return {
        idx: i,
        response: { pressed: p } satisfies GoNoGoRowResponse,
        rt_ms: p ? Math.round(rt) : null,
        presented_ms: outcome.presentedMs === null ? null : Math.round(outcome.presentedMs),
        correct: s === 'go' ? p : !p,
      };
    });
  },

  scoreRows(_config, rows) {
    let hits = 0;
    let misses = 0;
    let commissions = 0;
    let correctRejections = 0;
    const hitRts: number[] = [];
    for (const row of rows) {
      const pressed = field<boolean>(row.response, 'pressed') === true;
      if (pressed && row.correct) {
        hits++;
        if (row.rt_ms !== null) hitRts.push(row.rt_ms);
      } else if (pressed && !row.correct) commissions++;
      else if (!pressed && row.correct) correctRejections++;
      else misses++;
    }
    const goCount = hits + misses;
    const noGoCount = commissions + correctRejections;
    const hitRate = goCount > 0 ? hits / goCount : 0;
    const commissionRate = noGoCount > 0 ? commissions / noGoCount : 0;
    const base = Math.max(0, Math.round(1000 * (hitRate - 2 * commissionRate)));
    const bonus =
      hitRts.length > 0 ? speedBonus(median(hitRts), GO_NOGO_RT_TARGET_MS, GO_NOGO_RT_BONUS) : 0;
    return finalizeScore(base + bonus);
  },

  score(input: ScoreInput<GoNoGoTrial, GoNoGoResponse>) {
    return scoreViaRows(goNoGo, input);
  },

  theoreticalMax: () => 1200,
};
