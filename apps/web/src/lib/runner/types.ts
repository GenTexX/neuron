/** Phasen- und Aufzeichnungstypen des TrialRunners (§6.3). */

export type Phase = {
  /** Interne Kennung, wird an die View durchgereicht. */
  name: string;
  /** Soll-Dauer in ms. null = wartet auf Response. */
  durationMs: number | null;
  /** Nimmt der Runner in dieser Phase Eingaben an? */
  acceptsInput: boolean;
};

export type PhaseRecord = { name: string; onsetMs: number; presentedMs: number };

export type TrialRecord<R> = {
  index: number;
  response: R | null;
  /** ms seit Onset der ersten Input-annehmenden Phase. null wenn keine Antwort. */
  rtMs: number | null;
  phases: PhaseRecord[];
  correct: boolean;
};

export type AbortReason = 'visibility' | 'blur' | 'frameGap' | 'durationDrift' | 'aborted';

/** Grenzwerte aus §6.2. */
export const MAX_FRAME_GAP_MS = 250;
export const MAX_DURATION_DRIFT = 0.1;

export type RunnerStatus = 'idle' | 'running' | 'finished';
