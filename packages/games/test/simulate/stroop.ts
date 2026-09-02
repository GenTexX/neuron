import {
  stroop,
  stroopAnswer,
  type StroopConfig,
  type StroopResponse,
  type StroopTrial,
} from '../../src/stroop';
import type { Simulator } from './types';

export const simulateStroop: Simulator<StroopConfig, StroopTrial, StroopResponse> = (
  rng,
  trial,
  config,
) => {
  // 10 % keine Antwort, 70 % korrekt, sonst falsch
  const roll = rng.nextFloat();
  if (roll < 0.1) {
    return {
      response: null,
      rtMs: null,
      presentedMs: config.deadlineMs,
      judgement: { correct: false },
    };
  }
  const answer = stroopAnswer(trial);
  const choice =
    roll < 0.8 ? answer : (answer + 1 + rng.nextBelow(config.colors - 1)) % config.colors;
  const response = { choice };
  const rtMs = rng.nextRange(250, config.deadlineMs - 1);
  return { response, rtMs, presentedMs: rtMs, judgement: stroop.judge(trial, response) };
};
