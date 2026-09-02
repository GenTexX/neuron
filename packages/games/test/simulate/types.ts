import type { Rng, TrialOutcome } from '@neuron/engine';

/**
 * Simuliert eine Nutzerantwort auf einen Trial – deterministisch über den Rng.
 * Wird für Scoring-Fixtures (TS↔Rust-Parität) und für Score-Obergrenzen-Tests genutzt.
 */
export type Simulator<C, T, R> = (rng: Rng, trial: T, config: C, index: number) => TrialOutcome<R>;
