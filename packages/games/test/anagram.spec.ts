import { Rng } from '@neuron/engine';
import { describe, expect, it } from 'vitest';
import {
  ANAGRAM_WORDS,
  anagram,
  anagramCandidates,
  anagramSolutions,
  letterDisplacement,
  sortLetters,
  type AnagramConfig,
} from '../src/anagram';
import { rankedConfigList } from '../src/ranked';

const CONFIGS: AnagramConfig[] = [
  ...Array.from({ length: anagram.maxLevel }, (_, i) => anagram.levelToConfig(i + 1)),
  ...rankedConfigList<AnagramConfig>('anagram'),
];

describe('anagram – Wortliste (§12.9)', () => {
  it('enthält mindestens 1500 Wörter, nur a–z, Länge 4–9, eindeutig und sortiert', () => {
    expect(ANAGRAM_WORDS.length).toBeGreaterThanOrEqual(1500);
    for (const w of ANAGRAM_WORDS) {
      expect(w).toMatch(/^[a-z]{4,9}$/);
    }
    expect(new Set(ANAGRAM_WORDS).size).toBe(ANAGRAM_WORDS.length);
    expect(ANAGRAM_WORDS.slice().sort()).toEqual([...ANAGRAM_WORDS]);
  });

  it('jede Level- und Ranked-Config hat mindestens 50 Wörter im Längenfenster', () => {
    for (const config of CONFIGS) {
      expect(anagramCandidates(config.minLen, config.maxLen).length).toBeGreaterThanOrEqual(50);
    }
  });

  it('sortLetters und der Lösungsindex sind vollständig und konsistent', () => {
    expect(sortLetters('lampe')).toBe('aelmp');
    expect(sortLetters('palme')).toBe('aelmp');
    // Der Index liefert alle Wörter der Anagramm-Klasse — stichprobenartig gegen die Liste geprüft.
    for (const word of ['lampe', 'abend', 'atem', ANAGRAM_WORDS[0], ANAGRAM_WORDS[1500]]) {
      const expected = ANAGRAM_WORDS.filter((w) => sortLetters(w) === sortLetters(word));
      expect(anagramSolutions(word)).toEqual(expected);
      expect(expected).toContain(word);
    }
    // Mehrdeutige Klassen existieren und werden vollständig geführt.
    expect(anagramSolutions('lampe').length).toBeGreaterThan(1);
    expect(anagramSolutions('lampe')).toContain('ampel');
  });

  it('letterDisplacement zählt Positionsunterschiede', () => {
    expect(letterDisplacement('lampe', 'lampe')).toBe(0);
    expect(letterDisplacement('lapme', 'lampe')).toBe(2);
    expect(letterDisplacement('empal', 'lampe')).toBe(5);
    expect(letterDisplacement('lamp', 'lampe')).toBe(1);
  });
});

describe('anagram – Invarianten (§12.9)', () => {
  it('Level-Leiter entspricht der Spec', () => {
    expect(anagram.levelToConfig(1)).toEqual({
      minLen: 4,
      maxLen: 6,
      deadlineMs: 38500,
      trials: 10,
    });
    expect(anagram.levelToConfig(3)).toEqual({
      minLen: 4,
      maxLen: 6,
      deadlineMs: 35500,
      trials: 10,
    });
    expect(anagram.levelToConfig(4)).toEqual({
      minLen: 5,
      maxLen: 7,
      deadlineMs: 34000,
      trials: 10,
    });
    expect(anagram.levelToConfig(8)).toEqual({
      minLen: 6,
      maxLen: 8,
      deadlineMs: 28000,
      trials: 10,
    });
    expect(anagram.levelToConfig(12)).toEqual({
      minLen: 7,
      maxLen: 9,
      deadlineMs: 22000,
      trials: 10,
    });
    expect(anagram.levelToConfig(0)).toEqual(anagram.levelToConfig(1));
    expect(anagram.levelToConfig(99)).toEqual(anagram.levelToConfig(12));
    expect(anagram.maxLevel).toBe(12);
    expect(anagram.trialCount(anagram.levelToConfig(1))).toBe(10);
    expect(anagram.timingSensitive).toBe(false);
    expect(anagram.responseModel).toBe('discrete');
  });

  it('über 1000 Seeds: Längenfenster, Mindestverschiebung 2, scrambled ist keine Lösung', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const config = anagram.levelToConfig(1 + (seed % anagram.maxLevel));
      const trials = anagram.generateRun(new Rng(seed), config, config.trials);
      expect(trials).toHaveLength(config.trials);
      for (const t of trials) {
        expect(t.scrambled.length).toBeGreaterThanOrEqual(config.minLen);
        expect(t.scrambled.length).toBeLessThanOrEqual(config.maxLen);
        expect(t.scrambled).toMatch(/^[a-z]+$/);
        expect(t.solutions.length).toBeGreaterThan(0);
        // Verwürfelung darf selbst keine gültige Antwort sein
        expect(t.solutions).not.toContain(t.scrambled);
        for (const s of t.solutions) {
          // alle Lösungen sind echte Wörter derselben Anagramm-Klasse
          expect(ANAGRAM_WORDS).toContain(s);
          expect(sortLetters(s)).toBe(sortLetters(t.scrambled));
        }
        // mindestens zwei Buchstaben stehen anders als im Ausgangswort
        expect(t.solutions.some((s) => letterDisplacement(t.scrambled, s) >= 2)).toBe(true);
      }
    }
  });

  it('Lösungsindex eines Trials ist vollständig (Stichprobe gegen die volle Liste)', () => {
    for (let seed = 0; seed < 40; seed++) {
      const config = anagram.levelToConfig(1 + (seed % anagram.maxLevel));
      for (const t of anagram.generateRun(new Rng(seed), config, config.trials)) {
        const key = sortLetters(t.scrambled);
        expect(t.solutions).toEqual(ANAGRAM_WORDS.filter((w) => sortLetters(w) === key));
      }
    }
  });

  it('judge akzeptiert jede Lösung, getrimmt und case-insensitiv', () => {
    const trial = { scrambled: 'pelma', solutions: ['ampel', 'lampe', 'palme'] };
    expect(anagram.judge(trial, { text: 'lampe' })).toEqual({ correct: true });
    expect(anagram.judge(trial, { text: '  PALME ' })).toEqual({ correct: true });
    expect(anagram.judge(trial, { text: 'Ampel' })).toEqual({ correct: true });
    expect(anagram.judge(trial, { text: 'pelma' })).toEqual({ correct: false });
    expect(anagram.judge(trial, { text: '' })).toEqual({ correct: false });
    expect(anagram.judge(trial, { text: 'la mpe' })).toEqual({ correct: false });
  });

  it('toResultRows: eine Zeile je Trial mit der rohen Antwort', () => {
    const trial = { scrambled: 'pelma', solutions: ['lampe'] };
    expect(
      anagram.toResultRows(trial, 2, {
        response: { text: ' Lampe ' },
        rtMs: 4321.7,
        presentedMs: null,
        judgement: { correct: true },
      }),
    ).toEqual([
      { idx: 2, response: { text: ' Lampe ' }, rt_ms: 4322, presented_ms: null, correct: true },
    ]);
    expect(
      anagram.toResultRows(trial, 3, {
        response: null,
        rtMs: null,
        presentedMs: null,
        judgement: { correct: false },
      }),
    ).toEqual([{ idx: 3, response: null, rt_ms: null, presented_ms: null, correct: false }]);
  });

  it('scoreRows: (80 + 15·Wortlänge) + speedBonus(rt, deadlineMs, 60)', () => {
    const config: AnagramConfig = { minLen: 5, maxLen: 7, deadlineMs: 30000, trials: 10 };
    const row = (text: string | null, rt: number | null, correct: boolean) => ({
      idx: 0,
      response: text === null ? null : { text },
      rt_ms: rt,
      presented_ms: null,
      correct,
    });
    // 5 Buchstaben, halbe Deadline → 80 + 75 + round(60·0.5) = 185
    expect(anagram.scoreRows(config, [row('lampe', 15000, true)])).toBe(185);
    // getrimmt und großgeschrieben ändert die Wortlänge nicht
    expect(anagram.scoreRows(config, [row('  LAMPE ', 15000, true)])).toBe(185);
    // 7500 ms → round(60·0.75) = 45 → 80 + 75 + 45 = 200
    expect(anagram.scoreRows(config, [row('lampe', 7500, true)])).toBe(200);
    // 7 Buchstaben, ohne rt → 80 + 105 = 185
    expect(anagram.scoreRows(config, [row('fenster', null, true)])).toBe(185);
    // rt ab der Deadline → kein Bonus
    expect(anagram.scoreRows(config, [row('fenster', 30000, true)])).toBe(185);
    expect(anagram.scoreRows(config, [row('fenster', 45000, true)])).toBe(185);
    // falsch → 0
    expect(anagram.scoreRows(config, [row('unsinn', 1000, false)])).toBe(0);
    // keine Antwort → 0
    expect(anagram.scoreRows(config, [row(null, null, false)])).toBe(0);
    // Summe über mehrere Zeilen: 185 + 200 + 0
    expect(
      anagram.scoreRows(config, [
        row('lampe', 15000, true),
        row('lampe', 7500, true),
        row('lampe', 100, false),
      ]),
    ).toBe(385);
    expect(anagram.scoreRows(config, [])).toBe(0);
  });

  it('theoreticalMax = trials · (80 + 15·maxLen + 60)', () => {
    expect(anagram.theoreticalMax(anagram.levelToConfig(1))).toBe(10 * (80 + 90 + 60));
    expect(anagram.theoreticalMax(anagram.levelToConfig(12))).toBe(10 * (80 + 135 + 60));
    for (const config of CONFIGS) {
      expect(anagram.theoreticalMax(config)).toBe(config.trials * (80 + 15 * config.maxLen + 60));
    }
  });

  it('score() entspricht scoreRows über toResultRows und bleibt unter theoreticalMax', () => {
    const config = anagram.levelToConfig(5);
    const trials = anagram.generateRun(new Rng(11), config, config.trials);
    const results = trials.map((t) => {
      const response = { text: t.solutions[0].toUpperCase() };
      return { response, rtMs: 0, judgement: anagram.judge(t, response) };
    });
    const score = anagram.score({ trials, results, config, durationMs: 1000 });
    const expected = trials.reduce((sum, t) => sum + 80 + 15 * t.solutions[0].length + 60, 0);
    expect(score).toBe(expected);
    expect(score).toBeLessThanOrEqual(anagram.theoreticalMax(config));
  });
});
