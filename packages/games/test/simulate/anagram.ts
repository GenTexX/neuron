import {
  anagram,
  type AnagramConfig,
  type AnagramResponse,
  type AnagramTrial,
} from '../../src/anagram';
import type { Simulator } from './types';

export const simulateAnagram: Simulator<AnagramConfig, AnagramTrial, AnagramResponse> = (
  rng,
  trial,
  config,
) => {
  const roll = rng.nextFloat();
  const rtMs = rng.nextRange(2000, config.deadlineMs + 5000);
  // 10 % keine Antwort
  if (roll < 0.1) {
    return { response: null, rtMs: null, presentedMs: null, judgement: { correct: false } };
  }
  let text: string;
  if (roll < 0.75) {
    // korrekt; ein Teil davon mit Großschreibung und Leerzeichen (Trim/Lowercase)
    const word = rng.pick(trial.solutions);
    text = rng.chance(0.25) ? `  ${word.toUpperCase()} ` : word;
  } else {
    // falsch: die verwürfelte Vorgabe ist per Konstruktion keine Lösung
    text = trial.scrambled;
  }
  const response: AnagramResponse = { text };
  return { response, rtMs, presentedMs: null, judgement: anagram.judge(trial, response) };
};
