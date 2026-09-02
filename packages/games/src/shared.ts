import type { TrialResultRow } from '@neuron/engine';

/** Antwortmodell (§6.3). Steuert Runner-Verhalten und generische Tests. */
export type ResponseModel = 'discrete' | 'continuous';

/** Liest ein Feld aus einer unbekannten Response-JSON-Struktur. */
export function field<T>(response: unknown, key: string): T | undefined {
  if (response && typeof response === 'object' && key in (response as object)) {
    return (response as Record<string, unknown>)[key] as T;
  }
  return undefined;
}

export function rowsSorted(rows: readonly TrialResultRow[]): TrialResultRow[] {
  return rows.slice().sort((a, b) => a.idx - b.idx);
}
