import {
  finalizeScore,
  scoreViaRows,
  singleRow,
  type GameModule,
  type Judgement,
  type ScoreInput,
} from '@neuron/engine';
import { rankedConfigFor } from './ranked';
import { field, type ResponseModel } from './shared';

/** §12.3 Corsi-Blöcke */
export type CorsiConfig = {
  blocks: number;
  startLength: number;
  flashMs: number;
  gapMs: number;
  reverse: boolean;
  trials: number;
};
export type CorsiPoint = { x: number; y: number };
/** `reverse` wird aus der Config in den Trial übernommen, damit `judge` ohne Config auskommt. */
export type CorsiTrial = { positions: CorsiPoint[]; sequence: number[]; reverse: boolean };
export type CorsiResponse = { taps: number[] };

export const CORSI_BLOCKS = 9;
export const CORSI_GAP_MS = 250;
export const CORSI_TRIALS = 10;
/** Kantenlänge eines Blocks in Normkoordinaten (Anteil der Feldbreite). */
export const CORSI_BLOCK_SIZE = 0.12;

/**
 * Festes, unregelmäßiges Layout der neun Blöcke (klassisches Corsi-Brett) in
 * Normkoordinaten 0..1 (Blockmittelpunkte). Nicht zufällig, sonst wäre die
 * Schwierigkeit nicht vergleichbar (§12.3). Alle Paare haben einen Abstand
 * > 0.12·√2, sodass sich Blöcke mit 12 % Kantenlänge nie überlappen.
 */
export const CORSI_LAYOUT: readonly CorsiPoint[] = Object.freeze([
  { x: 0.12, y: 0.1 },
  { x: 0.55, y: 0.08 },
  { x: 0.88, y: 0.18 },
  { x: 0.3, y: 0.32 },
  { x: 0.66, y: 0.38 },
  { x: 0.1, y: 0.55 },
  { x: 0.42, y: 0.62 },
  { x: 0.85, y: 0.7 },
  { x: 0.25, y: 0.9 },
]);

/** Sequenzlänge des Trials `i` (§12.3). */
export function corsiSequenceLength(config: CorsiConfig, index: number): number {
  return config.startLength + Math.floor(index / 2);
}

/** Die Reihenfolge, in der der Nutzer tippen muss (bei `reverse` rückwärts). */
export function corsiExpectedTaps(trial: CorsiTrial): number[] {
  return trial.reverse ? trial.sequence.slice().reverse() : trial.sequence.slice();
}

export const corsi: GameModule<CorsiConfig, CorsiTrial, CorsiResponse> & {
  responseModel: ResponseModel;
} = {
  id: 'corsi',
  category: 'working-memory',
  inputKind: 'grid',
  timingSensitive: false,
  responseModel: 'discrete',
  maxLevel: 12,

  trialCount: (c) => c.trials,

  levelToConfig(level) {
    const l = Math.min(Math.max(1, Math.floor(level)), 12);
    return {
      blocks: CORSI_BLOCKS,
      startLength: 2 + Math.floor(l / 3),
      flashMs: Math.max(400, 900 - 40 * l),
      gapMs: CORSI_GAP_MS,
      reverse: l >= 7,
      trials: CORSI_TRIALS,
    };
  },

  rankedConfig: (isoWeek) => rankedConfigFor<CorsiConfig>('corsi', isoWeek),

  /** Positionen fest; zufällig ist nur die Sequenz. Kein Block zweimal hintereinander. */
  generateRun(rng, config, trialCount) {
    const blocks = config.blocks;
    if (blocks < 2 || blocks > CORSI_LAYOUT.length) {
      throw new Error(`corsi: blocks must be in [2, ${CORSI_LAYOUT.length}]`);
    }
    const trials: CorsiTrial[] = [];
    for (let i = 0; i < trialCount; i++) {
      const len = corsiSequenceLength(config, i);
      const sequence: number[] = [];
      for (let k = 0; k < len; k++) {
        if (k === 0) sequence.push(rng.nextBelow(blocks));
        else sequence.push((sequence[k - 1] + 1 + rng.nextBelow(blocks - 1)) % blocks);
      }
      const positions = CORSI_LAYOUT.slice(0, blocks).map((p) => ({ x: p.x, y: p.y }));
      trials.push({ positions, sequence, reverse: config.reverse });
    }
    return trials;
  },

  /** Bei `reverse` muss die Sequenz rückwärts getippt werden, sonst vorwärts. */
  judge(trial, response): Judgement {
    const expected = corsiExpectedTaps(trial);
    const taps = response.taps;
    const correct = taps.length === expected.length && taps.every((t, i) => t === expected[i]);
    return { correct, length: expected.length };
  },

  toResultRows: singleRow,

  /** Je korrekter Zeile `10 × len²`, `len` = Anzahl der Taps (§12.3). */
  scoreRows(_config, rows) {
    let total = 0;
    for (const row of rows) {
      if (!row.correct) continue;
      const taps = field<unknown>(row.response, 'taps');
      if (!Array.isArray(taps)) continue;
      total += 10 * taps.length * taps.length;
    }
    return finalizeScore(total);
  },

  score(input: ScoreInput<CorsiTrial, CorsiResponse>) {
    return scoreViaRows(corsi, input);
  },

  theoreticalMax(config) {
    let total = 0;
    for (let i = 0; i < config.trials; i++) {
      const len = corsiSequenceLength(config, i);
      total += 10 * len * len;
    }
    return total;
  },
};
