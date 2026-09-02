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

/** §12.8 Zahlenfolgen */
export type NumberSequenceRuleKind =
  'arith' | 'geom' | 'poly2' | 'alternating' | 'fib' | 'interleaved' | 'digitsum';
export type NumberSequenceConfig = {
  ruleKinds: NumberSequenceRuleKind[];
  shown: number;
  deadlineMs: number | null;
  trials: number;
};
export type NumberSequenceTrial = {
  shown: number[];
  answer: number;
  ruleKind: NumberSequenceRuleKind;
};
export type NumberSequenceResponse = { value: number };

export const NUMBER_SEQUENCE_RULE_KINDS: readonly NumberSequenceRuleKind[] = [
  'arith',
  'geom',
  'poly2',
  'alternating',
  'fib',
  'interleaved',
  'digitsum',
];
export const NUMBER_SEQUENCE_RT_TARGET_MS = 20000;
export const NUMBER_SEQUENCE_RT_BONUS = 50;
/** Betragsgrenze für alle Glieder (Anzeige und Eingabe bleiben handlich). */
export const NUMBER_SEQUENCE_MAX_ABS = 100000;
/** Kleinste Anzahl gezeigter Glieder, für die die Fitter Aussagekraft haben. */
export const NUMBER_SEQUENCE_MIN_SHOWN = 3;
/** Ziehungen je Trial, bevor der Generator auf `arith` zurückfällt. */
export const NUMBER_SEQUENCE_TRIAL_ATTEMPTS = 200;
/** Ziehungen im arith-Fallback, bevor die feste Notfall-Folge genutzt wird. */
export const NUMBER_SEQUENCE_FALLBACK_ATTEMPTS = 20;

export function digitSum(x: number): number {
  let n = Math.abs(Math.trunc(x));
  let s = 0;
  while (n > 0) {
    s += n % 10;
    n = Math.floor(n / 10);
  }
  return s;
}

/* ------------------------------------------------------------------------ */
/* Fitter: „erklärt die Regelfamilie die gezeigten Glieder?“                 */
/* ------------------------------------------------------------------------ */

function diffs(xs: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < xs.length; i++) out.push(xs[i] - xs[i - 1]);
  return out;
}

function allEqual(xs: readonly number[]): boolean {
  return xs.every((x) => x === xs[0]);
}

/** Konstantes Verhältnis a(1)/a(0) (rational erlaubt), alle Glieder ≠ 0. */
function constantRatio(xs: readonly number[]): { num: number; den: number } | null {
  if (xs.length < 2 || xs.some((x) => x === 0)) return null;
  const num = xs[1];
  const den = xs[0];
  for (let i = 1; i < xs.length - 1; i++) {
    // xs[i+1] / xs[i] == num / den  ⇔  xs[i+1]·den == xs[i]·num
    if (xs[i + 1] * den !== xs[i] * num) return null;
  }
  return { num, den };
}

/**
 * Transformationen, die alle Paare (x → y) einer Gruppe erklären: „+d“ oder „×q“
 * (q rational, x ≠ 0). Liefert die Vorhersagen dieser Transformationen für `last`.
 */
function stepTransforms(pairs: readonly (readonly [number, number])[]): ((x: number) => number)[] {
  if (pairs.length === 0) return [];
  const out: ((x: number) => number)[] = [];
  const d = pairs[0][1] - pairs[0][0];
  if (pairs.every(([x, y]) => y - x === d)) out.push((x) => x + d);
  const [x0, y0] = pairs[0];
  if (x0 !== 0 && pairs.every(([x, y]) => x !== 0 && y * x0 === x * y0)) {
    // Nur eine zweite Vorhersage, wenn sie sich von „+d“ unterscheiden kann.
    out.push((x) => (x * y0) / x0);
  }
  return out;
}

function fitArith(shown: readonly number[]): number[] {
  const d = diffs(shown);
  return allEqual(d) ? [shown[shown.length - 1] + d[0]] : [];
}

function fitGeom(shown: readonly number[]): number[] {
  const r = constantRatio(shown);
  if (r === null) return [];
  return [(shown[shown.length - 1] * r.num) / r.den];
}

function fitPoly2(shown: readonly number[]): number[] {
  const d1 = diffs(shown);
  const d2 = diffs(d1);
  if (d2.length === 0 || !allEqual(d2)) return [];
  return [shown[shown.length - 1] + d1[d1.length - 1] + d2[0]];
}

function fitAlternating(shown: readonly number[]): number[] {
  const groups: [number, number][][] = [[], []];
  for (let i = 0; i + 1 < shown.length; i++) groups[i % 2].push([shown[i], shown[i + 1]]);
  const transforms = groups.map(stepTransforms);
  // Beide Gruppen müssen erklärbar sein (eine leere Gruppe erklärt nichts).
  if (groups.some((g) => g.length === 0) || transforms.some((t) => t.length === 0)) return [];
  const nextGroup = (shown.length - 1) % 2;
  const last = shown[shown.length - 1];
  return transforms[nextGroup].map((t) => t(last));
}

function fitFib(shown: readonly number[]): number[] {
  for (let i = 2; i < shown.length; i++) {
    if (shown[i] !== shown[i - 1] + shown[i - 2]) return [];
  }
  return [shown[shown.length - 1] + shown[shown.length - 2]];
}

function fitInterleaved(shown: readonly number[]): number[] {
  const even = shown.filter((_, i) => i % 2 === 0);
  const odd = shown.filter((_, i) => i % 2 === 1);
  if (even.length < 2 || odd.length < 2) return [];
  const de = diffs(even);
  const dO = diffs(odd);
  if (!allEqual(de) || !allEqual(dO)) return [];
  const nextIsEven = shown.length % 2 === 0;
  return nextIsEven ? [even[even.length - 1] + de[0]] : [odd[odd.length - 1] + dO[0]];
}

function fitDigitSum(shown: readonly number[]): number[] {
  for (let i = 1; i < shown.length; i++) {
    if (shown[i] !== shown[i - 1] + digitSum(shown[i - 1])) return [];
  }
  const last = shown[shown.length - 1];
  return [last + digitSum(last)];
}

/**
 * Alle Vorhersagen für das nächste Glied, die eine Regelfamilie – über ihren
 * gesamten Parameterraum, also auch Entartungen wie `arith` mit d = 0 – für
 * die gezeigten Glieder liefert. Leer, wenn die Familie die Glieder nicht
 * erklärt. Mehr als ein Element bedeutet familieninterne Mehrdeutigkeit.
 */
export function fitRule(kind: NumberSequenceRuleKind, shown: readonly number[]): number[] {
  if (shown.length < NUMBER_SEQUENCE_MIN_SHOWN) return [];
  let out: number[];
  switch (kind) {
    case 'arith':
      out = fitArith(shown);
      break;
    case 'geom':
      out = fitGeom(shown);
      break;
    case 'poly2':
      out = fitPoly2(shown);
      break;
    case 'alternating':
      out = fitAlternating(shown);
      break;
    case 'fib':
      out = fitFib(shown);
      break;
    case 'interleaved':
      out = fitInterleaved(shown);
      break;
    case 'digitsum':
      out = fitDigitSum(shown);
      break;
  }
  return out.filter((v, i) => out.indexOf(v) === i);
}

/**
 * Eindeutige Vorhersage einer Regelfamilie oder `null`, wenn die Familie die
 * Glieder nicht erklärt oder mehrere Fortsetzungen zulässt.
 */
export function fit(kind: NumberSequenceRuleKind, shown: readonly number[]): number | null {
  const p = fitRule(kind, shown);
  return p.length === 1 ? p[0] : null;
}

/**
 * Eindeutigkeit (§12.8): keine Regel aus `ruleKinds` darf die gezeigten Glieder
 * erklären und ein anderes nächstes Glied als `answer` liefern. Das schließt
 * andere Parametrisierungen derselben Familie ein.
 */
export function isUnambiguous(
  shown: readonly number[],
  answer: number,
  ruleKinds: readonly NumberSequenceRuleKind[],
): boolean {
  for (const kind of ruleKinds) {
    for (const p of fitRule(kind, shown)) if (p !== answer) return false;
  }
  return true;
}

/* ------------------------------------------------------------------------ */
/* Generatoren                                                               */
/* ------------------------------------------------------------------------ */

/** Ganzzahl in [min, max] ohne 0. */
function nonZero(rng: Rng, min: number, max: number): number {
  const v = rng.nextRange(min, max - 1);
  return v >= 0 ? v + 1 : v;
}

function genArith(rng: Rng, n: number): number[] {
  const a0 = rng.nextRange(-20, 60);
  const d = nonZero(rng, -15, 25);
  return Array.from({ length: n }, (_, i) => a0 + i * d);
}

function genGeom(rng: Rng, n: number): number[] {
  const q = rng.pick([2, 3]);
  const a0 = rng.nextRange(1, q === 2 ? 15 : 9);
  const out = [a0];
  for (let i = 1; i < n; i++) out.push(out[i - 1] * q);
  return out;
}

function genPoly2(rng: Rng, n: number): number[] {
  const a0 = rng.nextRange(-10, 30);
  let d = rng.nextRange(-6, 12);
  const d2 = nonZero(rng, -5, 8);
  const out = [a0];
  for (let i = 1; i < n; i++) {
    out.push(out[i - 1] + d);
    d += d2;
  }
  return out;
}

type AltOp = { op: 'add'; k: number } | { op: 'mul'; k: number };

function applyAlt(x: number, t: AltOp): number {
  return t.op === 'add' ? x + t.k : x * t.k;
}

function genAlternating(rng: Rng, n: number): number[] {
  // Varianten: (+a, +b) mit a ≠ b, (+a, ×q), (×q, +a), (×2, ×3) / (×3, ×2)
  const variant = rng.nextBelow(4);
  let a: AltOp;
  let b: AltOp;
  let a0: number;
  if (variant === 0) {
    const k1 = nonZero(rng, -12, 15);
    let k2 = nonZero(rng, -12, 15);
    if (k2 === k1) k2 = k1 > 0 ? k1 + 1 : k1 - 1;
    a = { op: 'add', k: k1 };
    b = { op: 'add', k: k2 };
    a0 = rng.nextRange(-10, 50);
  } else if (variant === 1) {
    a = { op: 'add', k: nonZero(rng, -9, 12) };
    b = { op: 'mul', k: rng.pick([2, 3]) };
    a0 = rng.nextRange(1, 9);
  } else if (variant === 2) {
    a = { op: 'mul', k: rng.pick([2, 3]) };
    b = { op: 'add', k: nonZero(rng, -9, 12) };
    a0 = rng.nextRange(1, 9);
  } else {
    const q = rng.pick([2, 3]);
    a = { op: 'mul', k: q };
    b = { op: 'mul', k: q === 2 ? 3 : 2 };
    a0 = rng.nextRange(1, 5);
  }
  const out = [a0];
  for (let i = 1; i < n; i++) out.push(applyAlt(out[i - 1], (i - 1) % 2 === 0 ? a : b));
  return out;
}

function genFib(rng: Rng, n: number): number[] {
  const out = [rng.nextRange(1, 12), rng.nextRange(1, 12)];
  for (let i = 2; i < n; i++) out.push(out[i - 1] + out[i - 2]);
  return out;
}

function genInterleaved(rng: Rng, n: number): number[] {
  const b0 = rng.nextRange(1, 40);
  const c0 = rng.nextRange(1, 40);
  const d1 = nonZero(rng, -9, 12);
  let d2 = nonZero(rng, -9, 12);
  if (d2 === d1) d2 = d1 > 0 ? d1 + 1 : d1 - 1;
  return Array.from({ length: n }, (_, i) =>
    i % 2 === 0 ? b0 + (i / 2) * d1 : c0 + ((i - 1) / 2) * d2,
  );
}

function genDigitSum(rng: Rng, n: number): number[] {
  const out = [rng.nextRange(1, 99)];
  for (let i = 1; i < n; i++) out.push(out[i - 1] + digitSum(out[i - 1]));
  return out;
}

/** Erzeugt `n` Glieder einer Regelfamilie (die letzten ist die Antwort). */
export function generateSequence(rng: Rng, kind: NumberSequenceRuleKind, n: number): number[] {
  switch (kind) {
    case 'arith':
      return genArith(rng, n);
    case 'geom':
      return genGeom(rng, n);
    case 'poly2':
      return genPoly2(rng, n);
    case 'alternating':
      return genAlternating(rng, n);
    case 'fib':
      return genFib(rng, n);
    case 'interleaved':
      return genInterleaved(rng, n);
    case 'digitsum':
      return genDigitSum(rng, n);
  }
}

function withinBounds(seq: readonly number[]): boolean {
  return seq.every((x) => Number.isInteger(x) && Math.abs(x) <= NUMBER_SEQUENCE_MAX_ABS);
}

/**
 * Notfall-Folge, die gegen alle Familien nachweislich eindeutig ist:
 * 2, 4, 6, …, 2·shown → nächstes Glied 2·(shown+1).
 */
export function emergencySequence(shown: number): NumberSequenceTrial {
  return {
    shown: Array.from({ length: shown }, (_, i) => 2 * (i + 1)),
    answer: 2 * (shown + 1),
    ruleKind: 'arith',
  };
}

/**
 * Erzeugt einen eindeutigen Trial (§12.8). Zieht bis zu
 * `NUMBER_SEQUENCE_TRIAL_ATTEMPTS`-mal eine Regel aus `config.ruleKinds`, dann
 * bis zu `NUMBER_SEQUENCE_FALLBACK_ATTEMPTS`-mal `arith`, zuletzt die feste
 * Notfall-Folge. Terminiert damit garantiert und ist rein Rng-getrieben.
 */
export function generateSequenceTrial(rng: Rng, config: NumberSequenceConfig): NumberSequenceTrial {
  const shown = Math.floor(config.shown);
  if (shown < NUMBER_SEQUENCE_MIN_SHOWN) {
    throw new Error(`number-sequence: shown must be >= ${NUMBER_SEQUENCE_MIN_SHOWN}`);
  }
  const kinds = config.ruleKinds.length > 0 ? config.ruleKinds : (['arith'] as const);
  const tryKind = (kind: NumberSequenceRuleKind): NumberSequenceTrial | null => {
    const seq = generateSequence(rng, kind, shown + 1);
    if (!withinBounds(seq)) return null;
    const visible = seq.slice(0, shown);
    const answer = seq[shown];
    // Die eigene Familie muss die Glieder erklären (Selbstkonsistenz der Fitter) …
    if (!fitRule(kind, visible).includes(answer)) return null;
    // … und keine Regel der Menge darf abweichen.
    return isUnambiguous(visible, answer, kinds)
      ? { shown: visible, answer, ruleKind: kind }
      : null;
  };
  for (let attempt = 0; attempt < NUMBER_SEQUENCE_TRIAL_ATTEMPTS; attempt++) {
    const t = tryKind(rng.pick(kinds));
    if (t !== null) return t;
  }
  for (let attempt = 0; attempt < NUMBER_SEQUENCE_FALLBACK_ATTEMPTS; attempt++) {
    const t = tryKind('arith');
    if (t !== null) return t;
  }
  return emergencySequence(shown);
}

const LEVEL_KINDS: readonly NumberSequenceRuleKind[] = [
  'arith', // L1
  'geom', // L3
  'alternating', // L5
  'poly2', // L7
  'fib', // L9
  'interleaved', // L11
  'digitsum', // L13
];

export const numberSequence: GameModule<
  NumberSequenceConfig,
  NumberSequenceTrial,
  NumberSequenceResponse
> & {
  responseModel: ResponseModel;
} = {
  id: 'number-sequence',
  category: 'logic',
  inputKind: 'numeric',
  timingSensitive: false,
  responseModel: 'discrete',
  maxLevel: 14,

  trialCount: (c) => c.trials,

  levelToConfig(level) {
    const l = Math.min(Math.max(1, Math.floor(level)), 14);
    // L1: arith, ab L3 +geom, L5 +alternating, L7 +poly2, L9 +fib, L11 +interleaved, L13 +digitsum
    const count = Math.min(LEVEL_KINDS.length, 1 + Math.floor((l - 1) / 2));
    return {
      ruleKinds: LEVEL_KINDS.slice(0, count),
      shown: 5,
      // Training ohne Zeitlimit (§12 Einleitung: „ein Spiel ohne Zeitdruck“).
      deadlineMs: null,
      trials: 10,
    };
  },

  rankedConfig: (isoWeek) => rankedConfigFor<NumberSequenceConfig>('number-sequence', isoWeek),

  generateRun(rng, config, trialCount) {
    const trials: NumberSequenceTrial[] = [];
    for (let i = 0; i < trialCount; i++) trials.push(generateSequenceTrial(rng, config));
    return trials;
  },

  judge(trial, response): Judgement {
    return { correct: response.value === trial.answer };
  },

  toResultRows: singleRow,

  /** Korrekt `100 + speedBonus(rt, 20000, 50)`; falsch oder unbeantwortet 0. */
  scoreRows(_config, rows) {
    let total = 0;
    for (const row of rows) {
      if (!row.correct) continue;
      // rt_ms null bei korrekter Antwort ⇒ kein Bonus
      const rt = row.rt_ms ?? NUMBER_SEQUENCE_RT_TARGET_MS;
      total += 100 + speedBonus(rt, NUMBER_SEQUENCE_RT_TARGET_MS, NUMBER_SEQUENCE_RT_BONUS);
    }
    return finalizeScore(total);
  },

  score(input: ScoreInput<NumberSequenceTrial, NumberSequenceResponse>) {
    return scoreViaRows(numberSequence, input);
  },

  theoreticalMax: (config) => config.trials * 150,
};
