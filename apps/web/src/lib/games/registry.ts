import type { Phase } from '$lib/runner';
import type { Component } from 'svelte';

/**
 * Zuordnung `id → Svelte-View` über dynamischen Import (§7.1), damit Spiele
 * lazy geladen werden. Die Registry der Spiellogik liegt in `@neuron/games`;
 * hier geht es ausschließlich um die Darstellung.
 */

/** Props, die jede Spiel-View erhält. */
export type GameViewProps = {
  /** Der laufende Trial-Index. */
  trialIndex: number;
  /** Name der laufenden Phase; null zwischen Trials. */
  phaseName: string | null;
  /** Nimmt die laufende Phase Eingaben an? */
  acceptsInput: boolean;
  /** Alle vorab erzeugten Trials des Runs. */
  trials: unknown[];
  /** Die servergegebene Config. */
  config: unknown;
  /** Antwort abgeben (diskrete Spiele). `atMs` ist der Handler-Zeitstempel. */
  respond: (response: unknown, atMs: number) => void;
  /** Kontinuierliche Antwort fortschreiben, ohne den Trial zu beenden. */
  update: (response: unknown) => void;
  /** Trial vorzeitig beenden (z. B. gelöstes Puzzle). */
  complete: () => void;
  /** ms seit Onset der ersten Input-Phase des Trials, oder null. */
  elapsed: (atMs?: number) => number | null;
  /** War die letzte Antwort richtig? Für die Feedback-Phase. */
  lastCorrect: boolean | null;
};

/** Ein View-Modul: Komponente plus Phasendeklaration (§6.3). */
export type GameViewModule = {
  default: Component<GameViewProps>;
  /** Phasenfolge für einen Trial. Views deklarieren Phasen, kein Timing. */
  phases: (config: never, trials: never, index: number) => Phase[];
};

const VIEWS: Record<string, () => Promise<unknown>> = {
  stroop: () => import('./stroop/View.svelte'),
  'go-nogo': () => import('./go-nogo/View.svelte'),
  'n-back': () => import('./n-back/View.svelte'),
  'mental-chain': () => import('./mental-chain/View.svelte'),
  'number-sequence': () => import('./number-sequence/View.svelte'),
  corsi: () => import('./corsi/View.svelte'),
  schulte: () => import('./schulte/View.svelte'),
  'lights-out': () => import('./lights-out/View.svelte'),
  anagram: () => import('./anagram/View.svelte'),
  'mental-rotation': () => import('./mental-rotation/View.svelte'),
};

export async function loadView(id: string): Promise<GameViewModule> {
  const load = VIEWS[id];
  if (!load) throw new Error(`keine View für Spiel ${id}`);
  return (await load()) as GameViewModule;
}

export function hasView(id: string): boolean {
  return id in VIEWS;
}
