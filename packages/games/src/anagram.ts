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
import words from '../data/words-de.json';
import { rankedConfigFor } from './ranked';
import { field, type ResponseModel } from './shared';

/** §12.9 Anagramme */
export type AnagramConfig = { minLen: number; maxLen: number; deadlineMs: number; trials: number };
export type AnagramTrial = { scrambled: string; solutions: string[] };
export type AnagramResponse = { text: string };

export const ANAGRAM_BASE_POINTS = 80;
export const ANAGRAM_POINTS_PER_LETTER = 15;
export const ANAGRAM_SPEED_BONUS = 60;
/** Mindestzahl Buchstaben an anderer Position als im Original (§12.9). */
export const ANAGRAM_MIN_DISPLACEMENT = 2;
export const ANAGRAM_SHUFFLE_ATTEMPTS = 12;
export const ANAGRAM_WORD_ATTEMPTS = 8;

/**
 * Die kuratierte Wortliste (§12.9). Kleinbuchstaben a–z, Länge 4–9, alphabetisch
 * sortiert — die Sortierung ist Teil des Determinismus-Vertrags.
 * Quelle und Lizenz: `packages/games/data/LICENSE-words.md`.
 */
export const ANAGRAM_WORDS: readonly string[] = words as readonly string[];

/** Kanonischer Schlüssel einer Anagramm-Klasse: die aufsteigend sortierten Buchstaben. */
export function sortLetters(word: string): string {
  return word.split('').sort().join('');
}

/** Beim Modul-Laden gebauter Index `sortedLetters → [words]` (§12.9). */
const ANAGRAM_INDEX: ReadonlyMap<string, readonly string[]> = (() => {
  const index = new Map<string, string[]>();
  for (const word of ANAGRAM_WORDS) {
    const key = sortLetters(word);
    const bucket = index.get(key);
    if (bucket) bucket.push(word);
    else index.set(key, [word]);
  }
  return index;
})();

/** Alle Wörter mit denselben sortierten Buchstaben; enthält `word` selbst. */
export function anagramSolutions(word: string): string[] {
  return (ANAGRAM_INDEX.get(sortLetters(word)) ?? [word]).slice();
}

/** Wörter im Längenfenster `[minLen, maxLen]`, deterministisch sortiert. */
export function anagramCandidates(minLen: number, maxLen: number): string[] {
  return ANAGRAM_WORDS.filter((w) => w.length >= minLen && w.length <= maxLen);
}

/** Anzahl Positionen, an denen sich `scrambled` von `word` unterscheidet. */
export function letterDisplacement(scrambled: string, word: string): number {
  let n = 0;
  const len = Math.min(scrambled.length, word.length);
  for (let i = 0; i < len; i++) if (scrambled[i] !== word[i]) n++;
  return n + Math.abs(scrambled.length - word.length);
}

function isUsableScramble(scrambled: string, word: string, solutions: readonly string[]): boolean {
  return (
    letterDisplacement(scrambled, word) >= ANAGRAM_MIN_DISPLACEMENT &&
    !solutions.includes(scrambled)
  );
}

/**
 * Deterministischer Notnagel, wenn das Mischen für kein Wort eine brauchbare
 * Verwürfelung geliefert hat: zyklische Verschiebung um k. Verbraucht keinen Rng.
 */
function rotatedScramble(word: string, solutions: readonly string[]): string {
  for (let k = 1; k < word.length; k++) {
    const rotated = word.slice(k) + word.slice(0, k);
    if (isUsableScramble(rotated, word, solutions)) return rotated;
  }
  return word.slice(1) + word.slice(0, 1);
}

/** Erzeugt einen einzelnen Trial aus einer bereits gefilterten Kandidatenliste. */
export function generateAnagramTrial(rng: Rng, candidates: readonly string[]): AnagramTrial {
  let word = candidates[0];
  let solutions = anagramSolutions(word);
  for (let wordAttempt = 0; wordAttempt < ANAGRAM_WORD_ATTEMPTS; wordAttempt++) {
    word = rng.pick(candidates);
    solutions = anagramSolutions(word);
    const letters = word.split('');
    for (let shuffle = 0; shuffle < ANAGRAM_SHUFFLE_ATTEMPTS; shuffle++) {
      const scrambled = rng.shuffled(letters).join('');
      if (isUsableScramble(scrambled, word, solutions)) return { scrambled, solutions };
    }
  }
  return { scrambled: rotatedScramble(word, solutions), solutions };
}

export const anagram: GameModule<AnagramConfig, AnagramTrial, AnagramResponse> & {
  responseModel: ResponseModel;
} = {
  id: 'anagram',
  category: 'language',
  inputKind: 'text',
  // §12.9: kein Zeitdruck im Sinne von §6.2; die Deadline steuert nur den Bonus.
  timingSensitive: false,
  responseModel: 'discrete',
  maxLevel: 12,

  trialCount: (c) => c.trials,

  levelToConfig(level) {
    const l = Math.min(Math.max(1, Math.floor(level)), 12);
    const minLen = 4 + Math.floor(l / 4);
    return {
      minLen,
      maxLen: minLen + 2,
      deadlineMs: Math.max(15000, 40000 - 1500 * l),
      trials: 10,
    };
  },

  rankedConfig: (isoWeek) => rankedConfigFor<AnagramConfig>('anagram', isoWeek),

  generateRun(rng, config, trialCount) {
    const candidates = anagramCandidates(config.minLen, config.maxLen);
    if (candidates.length === 0) throw new Error(`anagram: no words for ${JSON.stringify(config)}`);
    const trials: AnagramTrial[] = [];
    for (let i = 0; i < trialCount; i++) trials.push(generateAnagramTrial(rng, candidates));
    return trials;
  },

  judge(trial, response): Judgement {
    const text = response.text.trim().toLowerCase();
    return { correct: trial.solutions.includes(text) };
  },

  toResultRows: singleRow,

  /**
   * Je korrekter Zeile `(80 + 15 × wordLength) + speedBonus(rt, deadlineMs, 60)`,
   * mit `wordLength` aus der getrimmten Antwort der Zeile. `rt_ms = null` ⇒ kein Bonus.
   */
  scoreRows(config, rows) {
    let total = 0;
    for (const row of rows) {
      if (!row.correct) continue;
      const text = field<string>(row.response, 'text');
      if (typeof text !== 'string') continue;
      const wordLength = text.trim().length;
      const bonus =
        row.rt_ms === null
          ? 0
          : speedBonus(Math.max(0, row.rt_ms), config.deadlineMs, ANAGRAM_SPEED_BONUS);
      total += ANAGRAM_BASE_POINTS + ANAGRAM_POINTS_PER_LETTER * wordLength + bonus;
    }
    return finalizeScore(total);
  },

  score(input: ScoreInput<AnagramTrial, AnagramResponse>) {
    return scoreViaRows(anagram, input);
  },

  theoreticalMax: (config) =>
    config.trials *
    (ANAGRAM_BASE_POINTS + ANAGRAM_POINTS_PER_LETTER * config.maxLen + ANAGRAM_SPEED_BONUS),
};
