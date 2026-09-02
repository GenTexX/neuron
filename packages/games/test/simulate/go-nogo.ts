import {
  goNoGo,
  type GoNoGoConfig,
  type GoNoGoPress,
  type GoNoGoResponse,
  type GoNoGoTrial,
} from '../../src/go-nogo';
import type { Simulator } from './types';

export const simulateGoNoGo: Simulator<GoNoGoConfig, GoNoGoTrial, GoNoGoResponse> = (
  rng,
  trial,
  config,
) => {
  const presses: GoNoGoPress[] = [];
  trial.stimuli.forEach((s, index) => {
    const p = s === 'go' ? rng.chance(0.9) : rng.chance(0.2);
    if (p) presses.push({ index, rtMs: rng.nextRange(180, 900) });
    // gelegentlicher Doppeldruck
    if (p && rng.chance(0.05)) presses.push({ index, rtMs: rng.nextRange(180, 900) });
  });
  const response = { presses };
  return {
    response,
    rtMs: null,
    presentedMs: trial.stimuli.length * (config.isiMs + config.stimulusMs),
    judgement: goNoGo.judge(trial, response),
  };
};
