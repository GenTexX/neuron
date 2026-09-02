import {
  schulte,
  type SchulteConfig,
  type SchulteResponse,
  type SchulteTap,
  type SchulteTrial,
} from '../../src/schulte';
import type { Simulator } from './types';

export const simulateSchulte: Simulator<SchulteConfig, SchulteTrial, SchulteResponse> = (
  rng,
  trial,
  config,
) => {
  const cellOf = new Map<string, number>();
  trial.grid.forEach((v, i) => cellOf.set(v, i));
  const total = trial.order.length;
  // 10 % Abbruch vor dem Ende, sonst vollständig
  const stopAt = rng.chance(0.1) ? rng.nextBelow(total) : total;
  const perCellMs = 500 + 150 * config.size;
  const taps: SchulteTap[] = [];
  let t = 0;
  for (let k = 0; k < stopAt; k++) {
    // gelegentlicher Fehltipp auf eine falsche Zelle
    if (rng.chance(0.12)) {
      t += rng.nextRange(150, 600);
      const target = cellOf.get(trial.order[k]) ?? 0;
      const wrong = (target + 1 + rng.nextBelow(trial.grid.length - 1)) % trial.grid.length;
      taps.push({ cell: wrong, rtMs: t, correct: false });
    }
    t += rng.nextRange(200, perCellMs);
    taps.push({ cell: cellOf.get(trial.order[k]) ?? 0, rtMs: t, correct: true });
  }
  const response = { taps };
  const judgement = schulte.judge(trial, response);
  return {
    response,
    rtMs: t > 0 ? t : null,
    presentedMs: t,
    judgement,
  };
};
