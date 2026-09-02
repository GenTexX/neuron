import type { AbortReason, Phase, PhaseRecord, RunnerStatus, TrialRecord } from './types';
import { MAX_DURATION_DRIFT, MAX_FRAME_GAP_MS } from './types';

/**
 * Zustandsautomat für die Stimuluspräsentation (§6).
 *
 * Grundregeln:
 * - Jede Zeitmessung über `performance.now()`, nie `Date.now()`.
 * - Phasendauern laufen über eine `requestAnimationFrame`-Schleife, nie über
 *   `setTimeout` (Drift, Clamping, Throttling).
 * - Der Onset einer Phase ist der `DOMHighResTimeStamp` des Frames, in dem sie
 *   erstmals gerendert wurde — nicht der Zeitpunkt der Zustandsänderung.
 * - Aufgezeichnet wird die tatsächliche Dauer (`presentedMs`), nicht die Soll-Dauer.
 */

export type PhaseProvider = (trialIndex: number) => Phase[];

export type RunnerOptions<R> = {
  trialCount: number;
  /** Phasenfolge je Trial. Views deklarieren Phasen, steuern kein Timing. */
  phases: PhaseProvider;
  /** Reagiert das Spiel empfindlich auf Timing? Steuert §6.2 Punkte 1–2. */
  timingSensitive: boolean;
  /** Wird nach jedem Trial aufgerufen (Bewertung durch das Spielmodul). */
  onTrialEnd: (index: number, response: R | null, rtMs: number | null) => boolean;
  /** Wird nach dem letzten Trial aufgerufen. */
  onFinish: (records: TrialRecord<R>[], durationMs: number) => void;
  /**
   * Optional: bricht den Run nach diesem Trial vorzeitig ab (z. B. corsi nach
   * zwei Fehlern in Folge). Die verbleibenden Trials gelten als nicht bearbeitet.
   */
  shouldStopEarly?: (index: number, records: TrialRecord<R>[]) => boolean;
};

export class TrialRunner<R> {
  status = $state<RunnerStatus>('idle');
  /** Index des laufenden Trials. */
  trialIndex = $state(0);
  /** Name der laufenden Phase; null vor dem Start. */
  phaseName = $state<string | null>(null);
  /** Nimmt die laufende Phase Eingaben an? */
  acceptsInput = $state(false);
  /** Gesetzt, sobald eine Abbruchbedingung (§6.2) verletzt wurde. */
  abortReason = $state<AbortReason | null>(null);

  readonly records: TrialRecord<R>[] = [];

  private options: RunnerOptions<R>;
  private phases: Phase[] = [];
  private phaseIndex = 0;
  private phaseRecords: PhaseRecord[] = [];
  private phaseOnset: number | null = null;
  private inputOnset: number | null = null;
  private response: R | null = null;
  private responseRt: number | null = null;
  /**
   * Getrennt von `response`, weil kontinuierliche Spiele über `updateResponse`
   * laufend einen Zwischenstand melden. Nur eine echte Antwort schließt den
   * Trial ab; ein Zwischenstand darf sie nicht blockieren.
   */
  private responded = false;
  private rafId: number | null = null;
  private lastFrameTs = 0;
  private runStart = 0;
  private plannedMs = 0;
  private presentedMs = 0;
  private cleanups: (() => void)[] = [];

  constructor(options: RunnerOptions<R>) {
    this.options = options;
  }

  start() {
    if (this.status === 'running') return;
    this.status = 'running';
    this.trialIndex = 0;
    this.records.length = 0;
    this.abortReason = null;
    this.plannedMs = 0;
    this.presentedMs = 0;
    this.runStart = performance.now();
    this.lastFrameTs = this.runStart;
    this.attachGuards();
    this.beginTrial(0);
    this.rafId = requestAnimationFrame((ts) => this.frame(ts));
  }

  /** Antwort aus einer View. Der Zeitstempel wird dort als erste Anweisung genommen. */
  submitResponse(response: R, atMs = performance.now()) {
    if (this.status !== 'running' || !this.acceptsInput) return;
    if (this.responded) return; // eine abschließende Antwort pro Trial
    this.responded = true;
    this.response = response;
    this.responseRt = this.inputOnset === null ? null : atMs - this.inputOnset;
    /*
     * Die Antwort beendet die laufende Eingabephase — sowohl eine wartende
     * (durationMs === null) als auch eine befristete. Das entspricht dem
     * üblichen Vorgehen in der Psychophysik: der Reiz verschwindet mit der
     * Reaktion, statt bis zur Deadline stehen zu bleiben. `presentedMs` bleibt
     * ehrlich, weil immer die tatsächliche Dauer aufgezeichnet wird (§6.1).
     * Kontinuierliche Spiele nutzen `updateResponse` und sind nicht betroffen.
     */
    this.endPhaseNow();
  }

  /**
   * Aktualisiert eine kontinuierliche Antwort (n-back, go-nogo, schulte,
   * lights-out), ohne die Phase zu beenden.
   */
  updateResponse(response: R) {
    if (this.status !== 'running') return;
    this.response = response;
  }

  /** Nutzerabbruch (§6.2). */
  abort(reason: AbortReason = 'aborted') {
    if (this.status !== 'running') return;
    this.abortReason ??= reason;
    this.finish();
  }

  /** Beendet den laufenden Trial sofort (z. B. wenn ein Puzzle gelöst wurde). */
  completeTrial() {
    if (this.status !== 'running') return;
    this.endPhaseNow();
    while (this.phaseIndex < this.phases.length) {
      this.phaseIndex++;
    }
    this.advance(performance.now());
  }

  destroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.detachGuards();
  }

  /** ms seit Onset der ersten Input-annehmenden Phase des laufenden Trials. */
  now(): number {
    return performance.now();
  }

  elapsedSinceInputOnset(atMs = performance.now()): number | null {
    return this.inputOnset === null ? null : atMs - this.inputOnset;
  }

  // ---------------------------------------------------------------- intern

  private attachGuards() {
    if (!this.options.timingSensitive) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') this.markInvalid('visibility');
    };
    const onBlur = () => this.markInvalid('blur');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
    this.cleanups.push(() => window.removeEventListener('blur', onBlur));
  }

  private detachGuards() {
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
  }

  /**
   * Markiert den Run als ungültig, bricht ihn aber nicht ab: der Nutzer spielt
   * zu Ende und sieht sein Ergebnis, es zählt nur nicht (§6.2).
   */
  private markInvalid(reason: AbortReason) {
    this.abortReason ??= reason;
  }

  private beginTrial(index: number) {
    this.trialIndex = index;
    this.phases = this.options.phases(index);
    this.phaseIndex = 0;
    this.phaseRecords = [];
    this.phaseOnset = null;
    this.inputOnset = null;
    this.response = null;
    this.responseRt = null;
    this.responded = false;
    this.applyPhase();
  }

  private applyPhase() {
    const phase = this.phases[this.phaseIndex];
    this.phaseName = phase?.name ?? null;
    this.acceptsInput = phase?.acceptsInput ?? false;
    this.phaseOnset = null; // wird im nächsten Frame gesetzt
  }

  /**
   * Beendet die laufende Phase sofort, weil eine Antwort vorliegt.
   *
   * Für die Drift-Prüfung (§6.2) zählt hier die *tatsächliche* Dauer auch als
   * Soll-Dauer: die Phase wurde absichtlich verkürzt, nicht vom System
   * gestört. Andernfalls würde jede schnelle Antwort den Run als ungültig
   * markieren. Die aufgezeichnete `presentedMs` bleibt davon unberührt.
   */
  private endPhaseNow() {
    const phase = this.phases[this.phaseIndex];
    if (!phase || this.phaseOnset === null) return;
    const now = performance.now();
    const presented = now - this.phaseOnset;
    this.phaseRecords.push({ name: phase.name, onsetMs: this.phaseOnset, presentedMs: presented });
    this.presentedMs += presented;
    this.plannedMs += presented;
    this.phaseIndex++;
    this.applyPhase();
  }

  private frame(ts: number) {
    if (this.status !== 'running') return;

    // §6.2: ein einzelner Frame-Abstand > 250 ms macht den Run ungültig.
    const gap = ts - this.lastFrameTs;
    if (gap > MAX_FRAME_GAP_MS) this.markInvalid('frameGap');
    this.lastFrameTs = ts;

    const phase = this.phases[this.phaseIndex];
    if (phase) {
      if (this.phaseOnset === null) {
        // Onset ist der Zeitstempel des Frames, in dem die Phase erstmals gerendert wurde.
        this.phaseOnset = ts;
        if (phase.acceptsInput && this.inputOnset === null) this.inputOnset = ts;
      } else if (phase.durationMs !== null && ts - this.phaseOnset >= phase.durationMs) {
        const presented = ts - this.phaseOnset;
        this.phaseRecords.push({
          name: phase.name,
          onsetMs: this.phaseOnset,
          presentedMs: presented,
        });
        this.presentedMs += presented;
        this.plannedMs += phase.durationMs;
        this.phaseIndex++;
        this.applyPhase();
      }
    }

    if (this.phaseIndex >= this.phases.length) {
      this.advance(ts);
      if (this.status !== 'running') return;
    }

    this.rafId = requestAnimationFrame((next) => this.frame(next));
  }

  private advance(ts: number) {
    const correct = this.options.onTrialEnd(this.trialIndex, this.response, this.responseRt);
    this.records.push({
      index: this.trialIndex,
      response: this.response,
      rtMs: this.responseRt === null ? null : Math.max(0, this.responseRt),
      phases: this.phaseRecords,
      correct,
    });

    const stopEarly = this.options.shouldStopEarly?.(this.trialIndex, this.records) ?? false;
    const next = this.trialIndex + 1;
    if (stopEarly || next >= this.options.trialCount) {
      // Nicht bearbeitete Trials zählen als falsch (§12.3).
      for (let i = next; i < this.options.trialCount; i++) {
        this.options.onTrialEnd(i, null, null);
        this.records.push({ index: i, response: null, rtMs: null, phases: [], correct: false });
      }
      this.finish(ts);
      return;
    }
    this.beginTrial(next);
  }

  private finish(ts = performance.now()) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.phaseName = null;
    this.acceptsInput = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.detachGuards();

    // §6.2: Summe der presentedMs darf um höchstens 10 % von der Soll-Summe abweichen.
    if (this.options.timingSensitive && this.plannedMs > 0) {
      const drift = Math.abs(this.presentedMs - this.plannedMs) / this.plannedMs;
      if (drift > MAX_DURATION_DRIFT) this.markInvalid('durationDrift');
    }
    this.options.onFinish(this.records, ts - this.runStart);
  }
}
