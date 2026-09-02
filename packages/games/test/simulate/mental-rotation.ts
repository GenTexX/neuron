import {
  mentalRotation,
  type MentalRotationConfig,
  type MentalRotationResponse,
  type MentalRotationTrial,
} from '../../src/mental-rotation';
import type { Simulator } from './types';

export const simulateMentalRotation: Simulator<
  MentalRotationConfig,
  MentalRotationTrial,
  MentalRotationResponse
> = (rng, trial, config) => {
  const roll = rng.nextFloat();
  const rtMs = rng.nextRange(700, config.deadlineMs + 1500);
  // 10 % keine Antwort (Deadline verstrichen)
  if (roll < 0.1) {
    return { response: null, rtMs: null, presentedMs: null, judgement: { correct: false } };
  }
  // 75 % der Antworten sind richtig
  const answersCorrectly = roll < 0.85;
  const response: MentalRotationResponse = {
    same: answersCorrectly ? !trial.mirrored : trial.mirrored,
  };
  return { response, rtMs, presentedMs: null, judgement: mentalRotation.judge(trial, response) };
};
