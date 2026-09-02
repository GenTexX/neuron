/** 0..maxBonus, linear abnehmend; 0 ab targetMs. (§7.3) */
export function speedBonus(rtMs: number, targetMs: number, maxBonus = 50): number {
  if (rtMs >= targetMs) return 0;
  return Math.round(maxBonus * (1 - rtMs / targetMs));
}

/** Signalentdeckungstheorie: Trefferrate minus Falschalarmrate, 0..1. (§7.3) */
export function discriminationIndex(
  hits: number,
  signals: number,
  falseAlarms: number,
  noise: number,
): number {
  const hr = signals > 0 ? hits / signals : 0;
  const far = noise > 0 ? falseAlarms / noise : 0;
  return Math.max(0, hr - far);
}

/**
 * Median einer Liste. Bei gerader Anzahl das arithmetische Mittel der beiden
 * mittleren Werte. Leere Liste → 0. Muss mit `domain::scoring::median` in Rust
 * übereinstimmen.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Score ist immer eine nicht-negative ganze Zahl (§7.3). */
export function finalizeScore(x: number): number {
  return Math.max(0, Math.round(x));
}
