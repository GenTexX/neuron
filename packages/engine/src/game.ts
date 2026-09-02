import type { Rng } from './rng';

export type GameCategory =
  'working-memory' | 'attention' | 'arithmetic' | 'spatial' | 'language' | 'logic';

export const GAME_CATEGORIES: readonly GameCategory[] = [
  'working-memory',
  'attention',
  'arithmetic',
  'spatial',
  'language',
  'logic',
];

export type InputKind =
  | 'binary' // zwei Antwortmöglichkeiten
  | 'choice' // n Antwortmöglichkeiten
  | 'numeric' // Zahleneingabe
  | 'text' // Texteingabe
  | 'grid' // Zellen in einem Raster antippen
  | 'canvas'; // freie Interaktion auf Canvas

export type Mode = 'training' | 'ranked';

export type Judgement = { correct: boolean; [k: string]: unknown };

/**
 * Eine Zeile `trial_result` auf dem Draht (§9.3, §11.2). Der Client sendet
 * Rohdaten, keine Punkte. Genau diese Form ist die gemeinsame Eingabe der
 * TS- und Rust-Score-Funktionen (Paritäts-Fixtures).
 */
export type TrialResultRow = {
  idx: number;
  response: unknown;
  rt_ms: number | null;
  presented_ms: number | null;
  correct: boolean;
};

export type TrialOutcome<R> = {
  response: R | null;
  rtMs: number | null;
  presentedMs: number | null;
  judgement: Judgement;
};

export type ScoreInput<T, R> = {
  trials: readonly T[];
  results: readonly {
    response: R | null;
    rtMs: number | null;
    judgement: Judgement;
  }[];
  config: unknown;
  durationMs: number;
};

export type GameModule<C, T, R> = {
  id: string;
  category: GameCategory;
  inputKind: InputKind;

  /** Reagiert das Spiel empfindlich auf Timing? Steuert §6.2. */
  timingSensitive: boolean;

  /**
   * Anzahl der `trial_result`-Zeilen eines Runs für eine Config. Bei
   * kontinuierlichen Spielen (n-back, go-nogo) ist das die Stromlänge, obwohl
   * `generateRun` nur einen Trial (den ganzen Strom) liefert (§12.2).
   */
  trialCount(config: C): number;

  /** Schwierigkeitsleiter für den Training-Modus. Level >= 1. */
  levelToConfig(level: number): C;
  /** Höchstes definiertes Level. Darüber wird geklemmt. */
  maxLevel: number;

  /** Config für den Ranked-Modus der gegebenen ISO-Kalenderwoche (§10.3). */
  rankedConfig(isoWeek: number): C;

  /** Erzeugt ALLE Trials eines Runs vorab. Deterministisch. */
  generateRun(rng: Rng, config: C, trialCount: number): T[];

  /** Bewertet eine einzelne Antwort. Rein, ohne Zeitbezug. */
  judge(trial: T, response: R): Judgement;

  /**
   * Wandelt das Ergebnis eines Trials in `trial_result`-Zeilen um. Diskrete
   * Spiele liefern genau eine Zeile; kontinuierliche Spiele eine je Reiz.
   */
  toResultRows(trial: T, index: number, outcome: TrialOutcome<R>): TrialResultRow[];

  /**
   * Maßgebliche Score-Formel über die Draht-Zeilen. Muss mit
   * `apps/api/src/domain/scoring/<id>.rs` übereinstimmen (§9.3).
   */
  scoreRows(config: C, rows: readonly TrialResultRow[]): number;

  /** Berechnet den Run-Score aus allen Trials (Komfort-Variante von scoreRows). */
  score(input: ScoreInput<T, R>): number;

  /** Obergrenze des Scores für eine Config (§9.2). Muss mit Rust übereinstimmen. */
  theoreticalMax(config: C): number;
};

/** Standard-Umsetzung von `toResultRows` für diskrete Spiele. */
export function singleRow<T, R>(
  _trial: T,
  index: number,
  outcome: TrialOutcome<R>,
): TrialResultRow[] {
  return [
    {
      idx: index,
      response: outcome.response,
      rt_ms: outcome.rtMs === null ? null : Math.round(outcome.rtMs),
      presented_ms: outcome.presentedMs === null ? null : Math.round(outcome.presentedMs),
      correct: outcome.judgement.correct,
    },
  ];
}

/** Standard-Umsetzung von `score` über `toResultRows` + `scoreRows`. */
export function scoreViaRows<C, T, R>(
  mod: Pick<GameModule<C, T, R>, 'toResultRows' | 'scoreRows'>,
  input: ScoreInput<T, R>,
): number {
  const rows: TrialResultRow[] = [];
  input.trials.forEach((trial, i) => {
    const r = input.results[i];
    const outcome: TrialOutcome<R> = r
      ? { response: r.response, rtMs: r.rtMs, presentedMs: null, judgement: r.judgement }
      : { response: null, rtMs: null, presentedMs: null, judgement: { correct: false } };
    rows.push(...mod.toResultRows(trial, i, outcome));
  });
  return mod.scoreRows(input.config as C, rows);
}
