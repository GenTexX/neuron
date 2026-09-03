import { api, ApiRequestError } from '$lib/api/client';
import type { CreateRunResponse, SubmitResponse, TrialRowPayload } from '$lib/api/types';
import { loadView, type GameViewModule } from '$lib/games/registry';
import { TrialRunner, type AbortReason, type Phase } from '$lib/runner';
import { Rng, type Judgement, type TrialOutcome } from '@neuron/engine';
import { getGame, type AnyGameModule } from '@neuron/games';

export type PlayPhase =
  'loading' | 'intro' | 'countdown' | 'running' | 'submitting' | 'result' | 'error';

/**
 * Besitzt den Zustand eines Runs (§13.3): bewusst lokal, nicht global —
 * ein Navigationswechsel bricht den Run ab.
 *
 * Ablauf (§4.1, §13.2): POST /runs im Intro (damit Trials und Assets vor dem
 * Countdown bereit sind) → Countdown → Trials → POST /submit → Ergebnis.
 */
export class PlaySession {
  phase = $state<PlayPhase>('loading');
  error = $state<string | null>(null);

  run = $state<CreateRunResponse | null>(null);
  game = $state<AnyGameModule | null>(null);
  view = $state<GameViewModule | null>(null);
  trials = $state<unknown[]>([]);
  result = $state<SubmitResponse | null>(null);
  abortReason = $state<AbortReason | null>(null);

  runner = $state<TrialRunner<unknown> | null>(null);
  /** Bewertung des zuletzt beendeten Trials, für die Feedback-Phase. */
  lastCorrect = $state<boolean | null>(null);
  /**
   * Bewertung des einzigen Trials, wenn ein Run aus genau einem besteht
   * (schulte, lights-out). Dort ist die Genauigkeit als Anteil richtiger
   * Aufgaben immer 0 % oder 100 % und sagt nichts – die Ergebnisseite zeigt
   * stattdessen, was sich tatsächlich unterscheidet (Fehltipps, Züge).
   */
  soloJudgement = $state<Judgement | null>(null);

  /** Nur in Development: lokal gerechneter Score für den Paritätsabgleich (§9.3). */
  localScore: number | null = null;

  private outcomes: TrialOutcome<unknown>[] = [];
  private judgements: Judgement[] = [];
  /**
   * Wanduhr-Zeitpunkt, zu dem der Server den Run angelegt hat (Eintreffen der
   * Antwort auf POST /runs). Bezugspunkt für `client_duration_ms`.
   */
  private createdAtMs = 0;

  constructor(
    readonly gameId: string,
    readonly mode: 'training' | 'ranked',
  ) {}

  /** Legt den Run an und erzeugt die Trials — vor dem Countdown (§13.2). */
  async prepare() {
    this.phase = 'loading';
    this.error = null;
    try {
      const game = getGame(this.gameId);
      const [run, view] = await Promise.all([
        api.createRun({ game_id: this.gameId, mode: this.mode }),
        loadView(this.gameId),
      ]);
      // Der Server vergibt Seed und Config; der Client fragt sie nicht selbst (§4.1).
      // Ab hier läuft die Serveruhr (`server_started_at`); siehe `submit`.
      this.createdAtMs = Date.now();
      const trials = game.generateRun(new Rng(run.seed), run.config, run.trial_count) as unknown[];
      this.game = game;
      this.run = run;
      this.view = view;
      this.trials = trials;
      this.outcomes = [];
      this.judgements = [];
      this.phase = 'intro';
    } catch (err) {
      this.error = errorCode(err);
      this.phase = 'error';
    }
  }

  begin() {
    const game = this.game;
    const run = this.run;
    const view = this.view;
    if (!game || !run || !view) return;

    this.phase = game.timingSensitive ? 'countdown' : 'running';
    const phaseProvider = (index: number): Phase[] =>
      (view.phases as unknown as (c: unknown, t: unknown[], i: number) => Phase[])(
        run.config,
        this.trials,
        index,
      );

    this.runner = new TrialRunner<unknown>({
      trialCount: this.trials.length,
      phases: phaseProvider,
      timingSensitive: game.timingSensitive,
      onTrialEnd: (index, response) => {
        const trial = this.trials[index];
        const judgement: Judgement =
          response === null || trial === undefined
            ? { correct: false }
            : (game.judge(trial, response) as Judgement);
        this.outcomes[index] = { response, rtMs: null, presentedMs: null, judgement };
        this.judgements[index] = judgement;
        this.lastCorrect = response === null ? null : judgement.correct;
        return judgement.correct;
      },
      shouldStopEarly: (index) => this.stopEarly(index),
      onFinish: (records) => {
        records.forEach((record, i) => {
          const outcome = this.outcomes[i];
          if (outcome) outcome.rtMs = record.rtMs;
        });
        void this.submit();
      },
    });

    if (!game.timingSensitive) this.runner.start();
  }

  /** Wird vom Countdown aufgerufen. */
  startAfterCountdown() {
    this.phase = 'running';
    this.runner?.start();
  }

  abort() {
    this.runner?.abort('aborted');
  }

  destroy() {
    this.runner?.destroy();
  }

  /** §12.3: corsi endet vorzeitig nach zwei aufeinanderfolgenden Fehlern. */
  private stopEarly(index: number): boolean {
    if (this.gameId !== 'corsi' || index < 1) return false;
    return (
      this.judgements[index]?.correct === false && this.judgements[index - 1]?.correct === false
    );
  }

  private async submit() {
    const game = this.game;
    const run = this.run;
    const runner = this.runner;
    if (!game || !run || !runner) return;

    this.abortReason = runner.abortReason;
    this.soloJudgement = this.trials.length === 1 ? (this.judgements[0] ?? null) : null;
    this.phase = 'submitting';

    const rows: TrialRowPayload[] = [];
    this.trials.forEach((trial, i) => {
      const outcome = this.outcomes[i] ?? {
        response: null,
        rtMs: null,
        presentedMs: null,
        judgement: { correct: false },
      };
      const presentedMs = sumPresented(runner.records[i]?.phases);
      rows.push(...(game.toResultRows(trial, i, { ...outcome, presentedMs }) as TrialRowPayload[]));
    });

    // §9.3: Abweichung zwischen TS- und Server-Score ist ein Bug.
    if (import.meta.env.DEV) this.localScore = game.scoreRows(run.config, rows) as number;

    try {
      /*
       * §9.2 vergleicht `client_duration_ms` mit `submitted_at -
       * server_started_at`. Damit dieser Vergleich etwas aussagt, muss der
       * Client *dieselbe* Spanne messen: vom Anlegen des Runs bis zur Abgabe.
       *
       * Vorher wurde nur die reine Spielzeit gemeldet. Die Serverspanne
       * enthält aber auch die Zeit im Intro und den Countdown – wer die Regeln
       * in Ruhe las, überschritt die 25 %-Toleranz und bekam den Run
       * aberkannt. Bei kurzen Trainingsruns auf Level 1 traf das fast immer zu.
       */
      const result = await api.submitRun(run.run_id, {
        nonce: run.nonce,
        client_duration_ms: Math.max(0, Date.now() - this.createdAtMs),
        client_aborted: runner.abortReason !== null,
        trials: rows,
      });
      if (
        import.meta.env.DEV &&
        this.localScore !== null &&
        result.valid &&
        this.localScore !== result.score
      ) {
        console.warn(
          `[scoring] TS-Score ${this.localScore} ≠ Server-Score ${result.score} für ${this.gameId}`,
        );
      }
      this.result = result;
      this.phase = 'result';
    } catch (err) {
      this.error = errorCode(err);
      this.phase = 'error';
    }
  }
}

function sumPresented(phases?: { presentedMs: number }[]): number | null {
  if (!phases || phases.length === 0) return null;
  return Math.round(phases.reduce((sum, p) => sum + p.presentedMs, 0));
}

function errorCode(err: unknown): string {
  return err instanceof ApiRequestError ? err.code : 'unknown';
}
