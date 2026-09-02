import {
  applyLightsOutMove,
  lightsOut,
  type LightsOutConfig,
  type LightsOutResponse,
  type LightsOutTrial,
} from '../../src/lights-out';
import type { Simulator } from './types';

/**
 * „Light chasing": die Züge der ersten Zeile werden erschöpfend durchprobiert,
 * der Rest folgt zwingend. Findet für jede lösbare Stellung eine Lösung —
 * nicht notwendigerweise die kürzeste.
 */
export function solveLightsOut(size: number, initial: readonly boolean[]): number[] | null {
  for (let mask = 0; mask < 1 << size; mask++) {
    let state = initial.slice();
    const presses: number[] = [];
    for (let c = 0; c < size; c++) {
      if ((mask >> c) & 1) {
        presses.push(c);
        state = applyLightsOutMove(state, size, c);
      }
    }
    for (let r = 1; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!state[(r - 1) * size + c]) continue;
        const cell = r * size + c;
        presses.push(cell);
        state = applyLightsOutMove(state, size, cell);
      }
    }
    if (state.every((on) => !on)) return presses;
  }
  return null;
}

export const simulateLightsOut: Simulator<LightsOutConfig, LightsOutTrial, LightsOutResponse> = (
  rng,
  trial,
) => {
  const solution = solveLightsOut(trial.size, trial.initial) ?? [];
  const giveUp = solution.length === 0 || rng.chance(0.15);
  let moves: number[];
  if (giveUp) {
    // Abbruch: nur ein Teil der Züge, Stellung bleibt (fast immer) ungelöst.
    moves = rng.shuffled(solution).slice(0, rng.nextBelow(solution.length + 1));
  } else {
    moves = rng.shuffled(solution);
    // gelegentliche Umwege: zweimal dieselbe Zelle hebt sich auf
    const detours = rng.nextBelow(3);
    for (let i = 0; i < detours; i++) {
      const cell = rng.nextBelow(trial.size * trial.size);
      moves = [...moves, cell, cell];
    }
  }
  const elapsedMs = 700 * moves.length + rng.nextRange(500, 4000);
  const trulySolved = !giveUp;
  // 5 % Falschangabe des Clients — der Judge rechnet ohnehin nach.
  const claimed = rng.chance(0.05) ? !trulySolved : trulySolved;
  const response: LightsOutResponse = { moves, solved: claimed, elapsedMs };
  return {
    response,
    rtMs: elapsedMs,
    presentedMs: elapsedMs,
    judgement: lightsOut.judge(trial, response),
  };
};
