import {
  nBack,
  type NBackConfig,
  type NBackPress,
  type NBackResponse,
  type NBackTrial,
} from '../../src/n-back';
import type { Simulator } from './types';

export const simulateNBack: Simulator<NBackConfig, NBackTrial, NBackResponse> = (
  rng,
  trial,
  config,
) => {
  const presses: NBackPress[] = [];
  const maxRt = Math.max(300, config.isiMs - 1);
  trial.isTarget.forEach((target, index) => {
    // Treffer mit 85 %, Falschalarm mit 8 %
    const p = target ? rng.chance(0.85) : rng.chance(0.08);
    if (p) presses.push({ index, rtMs: rng.nextRange(250, maxRt) });
    // gelegentlicher Doppeldruck auf denselben Reiz
    if (p && rng.chance(0.05)) presses.push({ index, rtMs: rng.nextRange(250, maxRt) });
  });
  const response = { presses };
  return {
    response,
    rtMs: null,
    presentedMs: trial.symbols.length * config.isiMs,
    judgement: nBack.judge(trial, response),
  };
};
