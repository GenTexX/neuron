import {
  numberSequence,
  type NumberSequenceConfig,
  type NumberSequenceResponse,
  type NumberSequenceTrial,
} from '../../src/number-sequence';
import type { Simulator } from './types';

export const simulateNumberSequence: Simulator<
  NumberSequenceConfig,
  NumberSequenceTrial,
  NumberSequenceResponse
> = (rng, trial, config) => {
  const maxRt = config.deadlineMs ?? 30000;
  // 10 % keine Antwort, 70 % korrekt, sonst falsch
  const roll = rng.nextFloat();
  if (roll < 0.1) {
    return { response: null, rtMs: null, presentedMs: maxRt, judgement: { correct: false } };
  }
  let value = trial.answer;
  if (roll >= 0.8) {
    // typischer Fehler: um eine Differenz daneben
    const last = trial.shown[trial.shown.length - 1];
    const delta = Math.max(1, Math.abs(trial.answer - last));
    value = rng.chance(0.5) ? last : trial.answer + (rng.chance(0.5) ? delta : -delta);
    if (value === trial.answer) value += 1;
  }
  const response = { value };
  const rtMs = rng.nextRange(1500, Math.max(1501, maxRt - 1));
  return {
    response,
    rtMs,
    presentedMs: rtMs,
    judgement: numberSequence.judge(trial, response),
  };
};
