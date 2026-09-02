import {
  corsi,
  corsiExpectedTaps,
  type CorsiConfig,
  type CorsiResponse,
  type CorsiTrial,
} from '../../src/corsi';
import type { Simulator } from './types';

export const simulateCorsi: Simulator<CorsiConfig, CorsiTrial, CorsiResponse> = (
  rng,
  trial,
  config,
) => {
  const expected = corsiExpectedTaps(trial);
  const presentedMs = expected.length * (config.flashMs + config.gapMs);
  // 10 % keine Antwort (z. B. nach Abbruch), 70 % korrekt, sonst falsch
  const roll = rng.nextFloat();
  if (roll < 0.1) {
    return { response: null, rtMs: null, presentedMs, judgement: { correct: false } };
  }
  let taps = expected.slice();
  if (roll >= 0.8) {
    if (rng.chance(0.5) && taps.length > 1) {
      // ein Tap vergessen
      taps.splice(rng.nextBelow(taps.length), 1);
    } else {
      // ein Block vertauscht
      const k = rng.nextBelow(taps.length);
      taps = taps.slice();
      taps[k] = (taps[k] + 1 + rng.nextBelow(config.blocks - 1)) % config.blocks;
    }
  }
  const response = { taps };
  const rtMs = rng.nextRange(400 * expected.length, 900 * expected.length);
  return { response, rtMs, presentedMs, judgement: corsi.judge(trial, response) };
};
