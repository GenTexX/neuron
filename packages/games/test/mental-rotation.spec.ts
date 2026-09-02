import { Rng } from '@neuron/engine';
import { describe, expect, it } from 'vitest';
import {
  fallbackShape,
  isAsymmetric,
  mentalRotation,
  mirrorShape,
  normalizeShape,
  rotateShape90,
  type MentalRotationCell,
  type MentalRotationConfig,
} from '../src/mental-rotation';
import { rankedConfigList } from '../src/ranked';

const I_TETROMINO: MentalRotationCell[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
];
const O_TETROMINO: MentalRotationCell[] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];
const T_TETROMINO: MentalRotationCell[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [2, 0],
];
const S_TETROMINO: MentalRotationCell[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [2, 1],
];
const L_TETROMINO: MentalRotationCell[] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [2, 0],
];

const CONFIGS: MentalRotationConfig[] = [
  ...Array.from({ length: mentalRotation.maxLevel }, (_, i) => mentalRotation.levelToConfig(i + 1)),
  ...rankedConfigList<MentalRotationConfig>('mental-rotation'),
];

describe('mental-rotation – Figuren-Algebra (§12.7)', () => {
  it('normalizeShape verschiebt auf min x = min y = 0 und sortiert', () => {
    expect(
      normalizeShape([
        [3, 3],
        [2, 4],
        [2, 3],
      ]),
    ).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(
      normalizeShape([
        [-2, -5],
        [-1, -5],
      ]),
    ).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(normalizeShape([])).toEqual([]);
    // idempotent
    expect(normalizeShape(normalizeShape(L_TETROMINO))).toEqual(normalizeShape(L_TETROMINO));
  });

  it('rotateShape90 dreht um Vielfache von 90° und ist zyklisch', () => {
    expect(
      rotateShape90(
        [
          [0, 0],
          [1, 0],
        ],
        1,
      ),
    ).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(rotateShape90(L_TETROMINO, 0)).toEqual(normalizeShape(L_TETROMINO));
    expect(rotateShape90(L_TETROMINO, 4)).toEqual(normalizeShape(L_TETROMINO));
    expect(rotateShape90(L_TETROMINO, -1)).toEqual(rotateShape90(L_TETROMINO, 3));
    expect(rotateShape90(rotateShape90(L_TETROMINO, 1), 1)).toEqual(rotateShape90(L_TETROMINO, 2));
    // 90°-Drehung verändert die L-Figur
    expect(rotateShape90(L_TETROMINO, 1)).not.toEqual(normalizeShape(L_TETROMINO));
    // Zellzahl bleibt erhalten
    for (let k = 0; k < 4; k++) expect(rotateShape90(L_TETROMINO, k)).toHaveLength(4);
  });

  it('mirrorShape spiegelt an der y-Achse und ist involutiv', () => {
    expect(
      mirrorShape([
        [0, 0],
        [1, 0],
        [1, 1],
      ]),
    ).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(mirrorShape(mirrorShape(L_TETROMINO))).toEqual(normalizeShape(L_TETROMINO));
    // Die L-Figur ist chiral: Spiegelbild ist keine Drehung des Originals
    for (let k = 0; k < 4; k++) {
      expect(mirrorShape(L_TETROMINO)).not.toEqual(rotateShape90(L_TETROMINO, k));
    }
  });

  it('isAsymmetric erkennt alle acht D4-Operationen', () => {
    expect(isAsymmetric(I_TETROMINO)).toBe(false); // Achsensymmetrie
    expect(isAsymmetric(O_TETROMINO)).toBe(false); // volle D4-Symmetrie
    expect(isAsymmetric(T_TETROMINO)).toBe(false); // Achsensymmetrie
    expect(isAsymmetric(S_TETROMINO)).toBe(false); // Punktsymmetrie (180°)
    expect(isAsymmetric(L_TETROMINO)).toBe(true);
    // die Fallback-Figur ist für jede Zellzahl ab 4 asymmetrisch
    for (let cells = 4; cells <= 12; cells++) {
      expect(fallbackShape(cells)).toHaveLength(cells);
      expect(isAsymmetric(fallbackShape(cells))).toBe(true);
    }
  });
});

describe('mental-rotation – Invarianten (§12.7)', () => {
  it('Level-Leiter entspricht der Spec', () => {
    const three = [90, 180, 270];
    const seven = [45, 90, 135, 180, 225, 270, 315];
    expect(mentalRotation.levelToConfig(1)).toEqual({
      cells: 4,
      angles: three,
      mirrorRate: 0.5,
      deadlineMs: 7700,
      trials: 20,
    });
    expect(mentalRotation.levelToConfig(3)).toEqual({
      cells: 5,
      angles: three,
      mirrorRate: 0.5,
      deadlineMs: 7100,
      trials: 20,
    });
    expect(mentalRotation.levelToConfig(5).angles).toEqual(three);
    expect(mentalRotation.levelToConfig(6)).toEqual({
      cells: 6,
      angles: seven,
      mirrorRate: 0.5,
      deadlineMs: 6200,
      trials: 20,
    });
    expect(mentalRotation.levelToConfig(9).cells).toBe(7);
    expect(mentalRotation.levelToConfig(12)).toEqual({
      cells: 8,
      angles: seven,
      mirrorRate: 0.5,
      deadlineMs: 4400,
      trials: 20,
    });
    expect(mentalRotation.levelToConfig(0)).toEqual(mentalRotation.levelToConfig(1));
    expect(mentalRotation.levelToConfig(99)).toEqual(mentalRotation.levelToConfig(12));
    expect(mentalRotation.maxLevel).toBe(12);
    expect(mentalRotation.trialCount(mentalRotation.levelToConfig(1))).toBe(20);
    expect(mentalRotation.responseModel).toBe('discrete');
    expect(mentalRotation.inputKind).toBe('canvas');
  });

  it('über 1000 Seeds und cells 4..8: Figuren sind zusammenhängend, normalisiert und asymmetrisch', () => {
    for (let cells = 4; cells <= 8; cells++) {
      const config: MentalRotationConfig = {
        cells,
        angles: [45, 90, 135, 180, 225, 270, 315],
        mirrorRate: 0.5,
        deadlineMs: 5000,
        trials: 1,
      };
      const distinct = new Set<string>();
      for (let seed = 0; seed < 1000; seed++) {
        const [t] = mentalRotation.generateRun(new Rng(seed), config, 1);
        expect(t.shape).toHaveLength(cells);
        // normalisiert: min x = min y = 0, sortiert, keine Dubletten
        expect(normalizeShape(t.shape)).toEqual(t.shape);
        expect(new Set(t.shape.map(([x, y]) => `${x},${y}`)).size).toBe(cells);
        expect(Math.min(...t.shape.map(([x]) => x))).toBe(0);
        expect(Math.min(...t.shape.map(([, y]) => y))).toBe(0);
        // zusammenhängend
        expect(isConnected(t.shape)).toBe(true);
        // keine der acht D4-Operationen bildet die Figur auf sich selbst ab
        expect(isAsymmetric(t.shape)).toBe(true);
        expect(config.angles).toContain(t.angleDeg);
        expect(typeof t.mirrored).toBe('boolean');
        distinct.add(JSON.stringify(t.shape));
      }
      expect(distinct.size).toBeGreaterThan(1);
    }
  });

  it('mirrorRate und Winkel werden über einen Run realistisch gestreut', () => {
    const config = mentalRotation.levelToConfig(6);
    const trials = mentalRotation.generateRun(new Rng(4242), config, 200);
    const mirrored = trials.filter((t) => t.mirrored).length;
    expect(mirrored).toBeGreaterThan(60);
    expect(mirrored).toBeLessThan(140);
    expect(new Set(trials.map((t) => t.angleDeg)).size).toBe(config.angles.length);
  });

  it('judge: same === true heißt „reine Drehung"', () => {
    const shape = L_TETROMINO;
    expect(mentalRotation.judge({ shape, angleDeg: 90, mirrored: false }, { same: true })).toEqual({
      correct: true,
    });
    expect(mentalRotation.judge({ shape, angleDeg: 90, mirrored: false }, { same: false })).toEqual(
      {
        correct: false,
      },
    );
    expect(mentalRotation.judge({ shape, angleDeg: 90, mirrored: true }, { same: false })).toEqual({
      correct: true,
    });
    expect(mentalRotation.judge({ shape, angleDeg: 90, mirrored: true }, { same: true })).toEqual({
      correct: false,
    });
  });

  it('toResultRows: eine Zeile je Trial mit der rohen Antwort', () => {
    const trial = { shape: L_TETROMINO, angleDeg: 180, mirrored: true };
    expect(
      mentalRotation.toResultRows(trial, 4, {
        response: { same: false },
        rtMs: 1234.4,
        presentedMs: null,
        judgement: { correct: true },
      }),
    ).toEqual([
      { idx: 4, response: { same: false }, rt_ms: 1234, presented_ms: null, correct: true },
    ]);
    expect(
      mentalRotation.toResultRows(trial, 5, {
        response: null,
        rtMs: null,
        presentedMs: null,
        judgement: { correct: false },
      }),
    ).toEqual([{ idx: 5, response: null, rt_ms: null, presented_ms: null, correct: false }]);
  });

  it('scoreRows: korrekt 100 + speedBonus(rt, deadlineMs, 80), falsch −50, ohne Antwort 0', () => {
    const config: MentalRotationConfig = {
      cells: 6,
      angles: [90, 180, 270],
      mirrorRate: 0.5,
      deadlineMs: 5000,
      trials: 20,
    };
    const row = (same: boolean | null, rt: number | null, correct: boolean) => ({
      idx: 0,
      response: same === null ? null : { same },
      rt_ms: rt,
      presented_ms: null,
      correct,
    });
    // 1000 ms → round(80·0.8) = 64 → 164
    expect(mentalRotation.scoreRows(config, [row(true, 1000, true)])).toBe(164);
    // 2500 ms → 40 → 140
    expect(mentalRotation.scoreRows(config, [row(false, 2500, true)])).toBe(140);
    // ab der Deadline kein Bonus
    expect(mentalRotation.scoreRows(config, [row(true, 5000, true)])).toBe(100);
    expect(mentalRotation.scoreRows(config, [row(true, 9000, true)])).toBe(100);
    // korrekt ohne rt → kein Bonus
    expect(mentalRotation.scoreRows(config, [row(true, null, true)])).toBe(100);
    // falsch → −50, aber die Summe wird bei 0 geklemmt
    expect(mentalRotation.scoreRows(config, [row(true, 800, false)])).toBe(0);
    // 164 − 50 = 114
    expect(mentalRotation.scoreRows(config, [row(true, 1000, true), row(false, 800, false)])).toBe(
      114,
    );
    // 100 − 150 → geklemmt auf 0
    expect(
      mentalRotation.scoreRows(config, [
        row(true, null, true),
        row(false, 100, false),
        row(true, 100, false),
        row(false, 100, false),
      ]),
    ).toBe(0);
    // keine Antwort zählt weder positiv noch negativ
    expect(mentalRotation.scoreRows(config, [row(true, 1000, true), row(null, null, false)])).toBe(
      164,
    );
    expect(mentalRotation.scoreRows(config, [])).toBe(0);
  });

  it('theoreticalMax = trials · 180', () => {
    for (const config of CONFIGS) {
      expect(mentalRotation.theoreticalMax(config)).toBe(config.trials * 180);
    }
    expect(mentalRotation.theoreticalMax(mentalRotation.levelToConfig(1))).toBe(3600);
  });

  it('score() entspricht scoreRows über toResultRows und bleibt unter theoreticalMax', () => {
    const config = mentalRotation.levelToConfig(4);
    const trials = mentalRotation.generateRun(new Rng(8), config, config.trials);
    const results = trials.map((t) => {
      const response = { same: !t.mirrored };
      return { response, rtMs: 0, judgement: mentalRotation.judge(t, response) };
    });
    const score = mentalRotation.score({ trials, results, config, durationMs: 1000 });
    expect(score).toBe(config.trials * 180);
    expect(score).toBe(mentalRotation.theoreticalMax(config));
  });
});

/** Prüft den Zusammenhang der Figur über orthogonale Nachbarschaft. */
function isConnected(shape: readonly MentalRotationCell[]): boolean {
  if (shape.length === 0) return true;
  const all = new Set(shape.map(([x, y]) => `${x},${y}`));
  const seen = new Set<string>([`${shape[0][0]},${shape[0][1]}`]);
  const queue: MentalRotationCell[] = [shape[0]];
  while (queue.length > 0) {
    const [x, y] = queue.pop() as MentalRotationCell;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const key = `${nx},${ny}`;
      if (!all.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen.size === all.size;
}
