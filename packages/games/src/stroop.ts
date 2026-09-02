import {
  finalizeScore,
  scoreViaRows,
  singleRow,
  speedBonus,
  type GameModule,
  type Judgement,
  type ScoreInput,
  type TrialResultRow,
} from '@neuron/engine';
import type { Rng } from '@neuron/engine';
import { rankedConfigFor } from './ranked';
import { field, type ResponseModel } from './shared';

/** §12.4 Stroop-Test */
export type StroopConfig = {
  colors: number;
  congruentRate: number;
  deadlineMs: number;
  switchRule: boolean;
  trials: number;
};
export type StroopRule = 'ink' | 'word';
export type StroopTrial = { word: number; ink: number; rule: StroopRule };
export type StroopResponse = { choice: number };

export const STROOP_COLOR_COUNT = 5;
export const STROOP_SWITCH_RATE = 0.3;

export function stroopAnswer(trial: StroopTrial): number {
  return trial.rule === 'ink' ? trial.ink : trial.word;
}

export const stroop: GameModule<StroopConfig, StroopTrial, StroopResponse> & {
  responseModel: ResponseModel;
} = {
  id: 'stroop',
  category: 'attention',
  inputKind: 'choice',
  timingSensitive: true,
  responseModel: 'discrete',
  maxLevel: 15,

  trialCount: (c) => c.trials,

  levelToConfig(level) {
    const l = Math.min(Math.max(1, Math.floor(level)), 15);
    return {
      colors: Math.min(5, 3 + Math.floor(l / 4)),
      congruentRate: Math.max(0.2, Math.round((0.6 - 0.03 * l) * 100) / 100),
      deadlineMs: Math.max(900, 2200 - 90 * l),
      switchRule: l >= 8,
      trials: 30,
    };
  },

  rankedConfig: (isoWeek) => rankedConfigFor<StroopConfig>('stroop', isoWeek),

  generateRun(rng, config, trialCount) {
    const trials: StroopTrial[] = [];
    let rule: StroopRule = 'ink';
    for (let i = 0; i < trialCount; i++) {
      if (config.switchRule && i > 0 && rng.chance(STROOP_SWITCH_RATE)) {
        rule = rule === 'ink' ? 'word' : 'ink';
      }
      const word = rng.nextBelow(config.colors);
      let ink = word;
      if (!rng.chance(config.congruentRate)) {
        // inkongruent: andere Farbe als das Wort
        ink = (word + 1 + rng.nextBelow(config.colors - 1)) % config.colors;
      }
      trials.push({ word, ink, rule });
    }
    return trials;
  },

  judge(trial, response): Judgement {
    return { correct: response.choice === stroopAnswer(trial) };
  },

  toResultRows: singleRow,

  scoreRows(config, rows) {
    let total = 0;
    for (const row of rows) {
      const answered = field<number>(row.response, 'choice') !== undefined;
      if (!answered) continue;
      if (row.correct) {
        total += 100 + speedBonus(row.rt_ms ?? config.deadlineMs, config.deadlineMs, 60);
      } else {
        total -= 40;
      }
    }
    return finalizeScore(total);
  },

  score(input: ScoreInput<StroopTrial, StroopResponse>) {
    return scoreViaRows(stroop, input);
  },

  theoreticalMax: (config) => config.trials * 160,
};

export function stroopRows(rows: readonly TrialResultRow[]): TrialResultRow[] {
  return rows.slice();
}

export type { Rng };
