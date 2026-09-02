import {
  finalizeScore,
  scoreViaRows,
  singleRow,
  speedBonus,
  type GameModule,
  type Judgement,
  type Rng,
  type ScoreInput,
} from '@neuron/engine';
import { rankedConfigFor } from './ranked';
import { field, type ResponseModel } from './shared';

/** §12.7 Mentale Rotation */
export type MentalRotationCell = [number, number];
export type MentalRotationShape = MentalRotationCell[];
export type MentalRotationConfig = {
  cells: number;
  angles: number[];
  mirrorRate: number;
  deadlineMs: number;
  trials: number;
};
export type MentalRotationTrial = {
  shape: MentalRotationCell[];
  angleDeg: number;
  mirrored: boolean;
};
/** `same = true` heißt „reine Drehung, nicht gespiegelt". */
export type MentalRotationResponse = { same: boolean };

export const MENTAL_ROTATION_CORRECT_POINTS = 100;
export const MENTAL_ROTATION_WRONG_PENALTY = 50;
export const MENTAL_ROTATION_SPEED_BONUS = 80;
export const MENTAL_ROTATION_MAX_PER_TRIAL = 180;
/** Ziehungen einer asymmetrischen Figur, bevor auf die L-Figur zurückgefallen wird. */
export const MENTAL_ROTATION_SHAPE_ATTEMPTS = 100;
/** Obergrenze der Schritte eines Random-Walks je Versuch. */
export const MENTAL_ROTATION_WALK_STEPS = 512;

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

function cellKey(cell: MentalRotationCell): string {
  return `${cell[0]},${cell[1]}`;
}

/** Kanonische Form: min x = min y = 0, Zellen nach (x, y) aufsteigend sortiert. */
export function normalizeShape(shape: readonly MentalRotationCell[]): MentalRotationShape {
  if (shape.length === 0) return [];
  let minX = shape[0][0];
  let minY = shape[0][1];
  for (const [x, y] of shape) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  }
  return shape
    .map(([x, y]): MentalRotationCell => [x - minX, y - minY])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Spiegelung an der y-Achse, normalisiert. */
export function mirrorShape(shape: readonly MentalRotationCell[]): MentalRotationShape {
  return normalizeShape(shape.map(([x, y]): MentalRotationCell => [-x, y]));
}

/** Drehung um `quarterTurns` × 90° (mathematisch positiv), normalisiert. */
export function rotateShape90(
  shape: readonly MentalRotationCell[],
  quarterTurns: number,
): MentalRotationShape {
  const k = ((Math.trunc(quarterTurns) % 4) + 4) % 4;
  let out = shape.map(([x, y]): MentalRotationCell => [x, y]);
  for (let i = 0; i < k; i++) out = out.map(([x, y]): MentalRotationCell => [-y, x]);
  return normalizeShape(out);
}

function shapeKey(shape: readonly MentalRotationCell[]): string {
  return normalizeShape(shape).map(cellKey).join(';');
}

/**
 * Prüft alle acht Operationen der Dihedralgruppe D4 (§12.7). Stimmt eine
 * nicht-identische Operation mit der Figur überein, ist die Aufgabe unlösbar.
 */
export function isAsymmetric(shape: readonly MentalRotationCell[]): boolean {
  const base = shapeKey(shape);
  for (let k = 0; k < 4; k++) {
    for (const mirrored of [false, true]) {
      if (k === 0 && !mirrored) continue;
      const transformed = mirrored ? mirrorShape(rotateShape90(shape, k)) : rotateShape90(shape, k);
      if (shapeKey(transformed) === base) return false;
    }
  }
  return true;
}

/** Deterministische, für `cells >= 4` garantiert asymmetrische L-Figur. */
export function fallbackShape(cells: number): MentalRotationShape {
  const n = Math.max(1, Math.floor(cells));
  const out: MentalRotationShape = [];
  if (n < 4) {
    for (let x = 0; x < n; x++) out.push([x, 0]);
    return normalizeShape(out);
  }
  for (let x = 0; x < n - 1; x++) out.push([x, 0]);
  out.push([0, 1]);
  return normalizeShape(out);
}

/** Polyomino aus `cells` verbundenen Quadraten per Random-Walk auf dem Gitter. */
function randomWalkShape(rng: Rng, cells: number): MentalRotationShape {
  const n = Math.max(1, Math.floor(cells));
  const seen = new Set<string>(['0,0']);
  const out: MentalRotationShape = [[0, 0]];
  let x = 0;
  let y = 0;
  for (let step = 0; step < MENTAL_ROTATION_WALK_STEPS && out.length < n; step++) {
    const d = rng.nextBelow(4);
    x += DX[d];
    y += DY[d];
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([x, y]);
  }
  // Deterministischer Abschluss, falls der Walk zu lange gebraucht hat.
  while (out.length < n) {
    let added = false;
    for (const [cx, cy] of out) {
      for (let d = 0; d < 4 && !added; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        const key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([nx, ny]);
        added = true;
      }
      if (added) break;
    }
    if (!added) break;
  }
  return normalizeShape(out);
}

/** Zieht so lange, bis die Figur keine der acht D4-Symmetrien besitzt. */
export function generateShape(rng: Rng, cells: number): MentalRotationShape {
  for (let attempt = 0; attempt < MENTAL_ROTATION_SHAPE_ATTEMPTS; attempt++) {
    const shape = randomWalkShape(rng, cells);
    if (isAsymmetric(shape)) return shape;
  }
  return fallbackShape(cells);
}

export const mentalRotation: GameModule<
  MentalRotationConfig,
  MentalRotationTrial,
  MentalRotationResponse
> & { responseModel: ResponseModel } = {
  id: 'mental-rotation',
  category: 'spatial',
  inputKind: 'canvas',
  timingSensitive: true,
  responseModel: 'discrete',
  maxLevel: 12,

  trialCount: (c) => c.trials,

  levelToConfig(level) {
    const l = Math.min(Math.max(1, Math.floor(level)), 12);
    return {
      cells: 4 + Math.floor(l / 3),
      angles: l >= 6 ? [45, 90, 135, 180, 225, 270, 315] : [90, 180, 270],
      mirrorRate: 0.5,
      deadlineMs: Math.max(3000, 8000 - 300 * l),
      trials: 20,
    };
  },

  rankedConfig: (isoWeek) => rankedConfigFor<MentalRotationConfig>('mental-rotation', isoWeek),

  generateRun(rng, config, trialCount) {
    const trials: MentalRotationTrial[] = [];
    for (let i = 0; i < trialCount; i++) {
      const shape = generateShape(rng, config.cells);
      const angleDeg = rng.pick(config.angles);
      const mirrored = rng.chance(config.mirrorRate);
      trials.push({ shape, angleDeg, mirrored });
    }
    return trials;
  },

  judge(trial, response): Judgement {
    return { correct: response.same !== trial.mirrored };
  },

  toResultRows: singleRow,

  /**
   * Korrekt `100 + speedBonus(rt, deadlineMs, 80)`, falsch (aber beantwortet)
   * `−50`, unbeantwortet 0. Die Summe wird bei 0 geklemmt.
   */
  scoreRows(config, rows) {
    let total = 0;
    for (const row of rows) {
      const same = field<boolean>(row.response, 'same');
      if (typeof same !== 'boolean') continue;
      if (row.correct) {
        const bonus =
          row.rt_ms === null
            ? 0
            : speedBonus(Math.max(0, row.rt_ms), config.deadlineMs, MENTAL_ROTATION_SPEED_BONUS);
        total += MENTAL_ROTATION_CORRECT_POINTS + bonus;
      } else {
        total -= MENTAL_ROTATION_WRONG_PENALTY;
      }
    }
    return finalizeScore(Math.max(0, total));
  },

  score(input: ScoreInput<MentalRotationTrial, MentalRotationResponse>) {
    return scoreViaRows(mentalRotation, input);
  },

  theoreticalMax: (config) => config.trials * MENTAL_ROTATION_MAX_PER_TRIAL,
};
