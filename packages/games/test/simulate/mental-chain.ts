import {
  MENTAL_CHAIN_START_MS,
  mentalChain,
  type MentalChainConfig,
  type MentalChainResponse,
  type MentalChainTrial,
} from '../../src/mental-chain';
import type { Simulator } from './types';

export const simulateMentalChain: Simulator<
  MentalChainConfig,
  MentalChainTrial,
  MentalChainResponse
> = (rng, trial, config) => {
  // Präsentationsdauer der Kette bis zur Eingabephase (§12.1 Phasen)
  const chainMs = MENTAL_CHAIN_START_MS + config.steps * (config.stepMs + config.gapMs);
  // 10 % keine Antwort, 65 % korrekt, sonst falsch
  const roll = rng.nextFloat();
  if (roll < 0.1) {
    return { response: null, rtMs: null, presentedMs: chainMs, judgement: { correct: false } };
  }
  let value = trial.result;
  if (roll >= 0.75) {
    // typischer Fehler: Rechenschritt verpasst oder Vorzeichen/Zehner vertauscht
    const delta = rng.nextRange(1, Math.max(2, config.operandMax));
    value = rng.chance(0.5) ? value + delta : value - delta;
  }
  const response = { value };
  const rtMs = rng.nextRange(800, 12000);
  return {
    response,
    rtMs,
    presentedMs: chainMs + rtMs,
    judgement: mentalChain.judge(trial, response),
  };
};
