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
import type { ResponseModel } from './shared';

/** §12.1 Kopfrechenkette */
export type MentalChainOp = 'add' | 'sub' | 'mul';
export type MentalChainConfig = {
  steps: number;
  stepMs: number;
  gapMs: number;
  ops: MentalChainOp[];
  operandMax: number;
  trials: number;
};
export type MentalChainStep = { op: MentalChainOp; value: number };
export type MentalChainTrial = { start: number; steps: MentalChainStep[]; result: number };
export type MentalChainResponse = { value: number };

export const MENTAL_CHAIN_START_MIN = 2;
export const MENTAL_CHAIN_START_MAX = 20;
export const MENTAL_CHAIN_MUL_MIN = 2;
export const MENTAL_CHAIN_MUL_MAX = 4;
export const MENTAL_CHAIN_RESULT_MIN = -999;
export const MENTAL_CHAIN_RESULT_MAX = 9999;
/** Versuche je Schritt, bevor auf add/sub zurückgefallen wird (§12.1). */
export const MENTAL_CHAIN_STEP_ATTEMPTS = 20;
export const MENTAL_CHAIN_RT_TARGET_MS = 8000;
export const MENTAL_CHAIN_RT_BONUS = 50;
/** Dauer der Startphase (§12.1, Phase `start`). */
export const MENTAL_CHAIN_START_MS = 1200;

export function applyStep(value: number, step: MentalChainStep): number {
  switch (step.op) {
    case 'add':
      return value + step.value;
    case 'sub':
      return value - step.value;
    case 'mul':
      return value * step.value;
  }
}

export function inResultRange(x: number): boolean {
  return x >= MENTAL_CHAIN_RESULT_MIN && x <= MENTAL_CHAIN_RESULT_MAX;
}

/**
 * Erzeugt einen Schritt, wenn nach `MENTAL_CHAIN_STEP_ATTEMPTS` Ziehungen kein
 * gültiger gefunden wurde (oder wenn die Op-Liste nach der Regel „keine zwei
 * `mul` in Folge“ leer ist). Fällt auf `add`/`sub` zurück und wählt die
 * Richtung so, dass das Ergebnis garantiert im Bereich bleibt – terminiert
 * damit immer und zieht genau einen Zufallswert.
 */
export function fallbackStep(rng: Rng, current: number, operandMax: number): MentalChainStep {
  const max = Math.max(1, Math.floor(operandMax));
  const headroomUp = MENTAL_CHAIN_RESULT_MAX - current;
  const headroomDown = current - MENTAL_CHAIN_RESULT_MIN;
  // Richtung mit mehr Spielraum; darin ist ein Operand aus [1, max] immer sicher,
  // weil der Bereich [-999, 9999] breiter als 2·max ist.
  if (headroomUp >= headroomDown) {
    return { op: 'add', value: rng.nextRange(1, Math.min(max, headroomUp)) };
  }
  return { op: 'sub', value: rng.nextRange(1, Math.min(max, headroomDown)) };
}

/** Erzeugt einen einzelnen Trial (§12.1 Generierungsregeln). */
export function generateChainTrial(rng: Rng, config: MentalChainConfig): MentalChainTrial {
  const start = rng.nextRange(MENTAL_CHAIN_START_MIN, MENTAL_CHAIN_START_MAX);
  const steps: MentalChainStep[] = [];
  let current = start;
  let prevOp: MentalChainOp | null = null;
  for (let i = 0; i < config.steps; i++) {
    // keine zwei `mul` in Folge
    // Explizit annotiert: sonst wird die Typinferenz über prevOp zirkulär (TS7022).
    const allowed: readonly MentalChainOp[] =
      prevOp === 'mul' ? config.ops.filter((op) => op !== 'mul') : config.ops;
    let step: MentalChainStep | null = null;
    if (allowed.length > 0) {
      for (let attempt = 0; attempt < MENTAL_CHAIN_STEP_ATTEMPTS; attempt++) {
        const op = rng.pick(allowed);
        const value =
          op === 'mul'
            ? rng.nextRange(MENTAL_CHAIN_MUL_MIN, MENTAL_CHAIN_MUL_MAX)
            : rng.nextRange(1, Math.max(1, Math.floor(config.operandMax)));
        const candidate: MentalChainStep = { op, value };
        if (inResultRange(applyStep(current, candidate))) {
          step = candidate;
          break;
        }
      }
    }
    if (step === null) step = fallbackStep(rng, current, config.operandMax);
    current = applyStep(current, step);
    steps.push(step);
    prevOp = step.op;
  }
  return { start, steps, result: current };
}

export const mentalChain: GameModule<MentalChainConfig, MentalChainTrial, MentalChainResponse> & {
  responseModel: ResponseModel;
} = {
  id: 'mental-chain',
  category: 'arithmetic',
  inputKind: 'numeric',
  timingSensitive: true,
  responseModel: 'discrete',
  maxLevel: 14,

  trialCount: (c) => c.trials,

  levelToConfig(level) {
    const l = Math.min(Math.max(1, Math.floor(level)), 14);
    const ops: MentalChainOp[] = l >= 4 ? ['add', 'sub', 'mul'] : ['add', 'sub'];
    return {
      steps: 2 + Math.floor(l / 2),
      stepMs: Math.max(500, 1600 - 100 * l),
      // Die Spec nennt für die Leiter keinen gapMs-Wert; 300 ms ist der Wert der Ranked-Configs.
      gapMs: 300,
      ops,
      operandMax: 9 + 3 * l,
      trials: 8,
    };
  },

  rankedConfig: (isoWeek) => rankedConfigFor<MentalChainConfig>('mental-chain', isoWeek),

  generateRun(rng, config, trialCount) {
    const trials: MentalChainTrial[] = [];
    for (let i = 0; i < trialCount; i++) trials.push(generateChainTrial(rng, config));
    return trials;
  },

  judge(trial, response): Judgement {
    return { correct: response.value === trial.result };
  },

  toResultRows: singleRow,

  /** Je korrekter Trial `100 + speedBonus(rt, 8000, 50)`; falsch oder unbeantwortet 0. */
  scoreRows(_config, rows) {
    let total = 0;
    for (const row of rows) {
      if (!row.correct) continue;
      // rt_ms null bei korrekter Antwort ⇒ kein Bonus
      const rt = row.rt_ms ?? MENTAL_CHAIN_RT_TARGET_MS;
      total += 100 + speedBonus(rt, MENTAL_CHAIN_RT_TARGET_MS, MENTAL_CHAIN_RT_BONUS);
    }
    return finalizeScore(total);
  },

  score(input: ScoreInput<MentalChainTrial, MentalChainResponse>) {
    return scoreViaRows(mentalChain, input);
  },

  theoreticalMax: (config) => config.trials * 150,
};
