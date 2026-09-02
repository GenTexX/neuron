<script module lang="ts">
  import type { Phase } from '$lib/runner';

  /**
   * Phasenfolge (§12.10): eine einzige, wartende Phase `board`. Das Spiel hat
   * keinen Zeitdruck (`timingSensitive: false`) — die Phase läuft, bis das
   * Brett gelöst ist oder aufgegeben wird.
   */
  export function phases(): Phase[] {
    return [{ name: 'board', durationMs: null, acceptsInput: true }];
  }
</script>

<script lang="ts">
  import { t } from '$lib/i18n';
  import { GridInput } from '$lib/input';
  import type { GridCell } from '$lib/input/GridInput.svelte';
  import type { GameViewProps } from '$lib/games/registry';
  import type { LightsOutResponse, LightsOutTrial } from '@neuron/games';
  import { applyLightsOutMove, applyLightsOutMoves } from '@neuron/games';

  const props: GameViewProps = $props();

  const trials = $derived(props.trials as LightsOutTrial[]);
  /** Ein Run = ein Trial (§12.10), der Index bleibt 0. */
  const trial = $derived(trials[props.trialIndex]);
  const size = $derived(trial?.size ?? 0);

  /**
   * Einziger Zustand ist die Zugfolge. Das Brett wird daraus abgeleitet, exakt
   * so, wie der Server die Züge später nachspielt (`lightsOutEvaluate`) —
   * damit können Anzeige und Wertung nicht auseinanderlaufen.
   */
  let moves = $state<number[]>([]);

  const board = $derived(
    trial ? applyLightsOutMoves(trial.initial, trial.size, moves) : ([] as boolean[]),
  );
  const solved = $derived(board.length > 0 && board.every((on) => !on));

  const cells = $derived<GridCell[]>(board.map((on) => ({ active: on })));

  /**
   * Beendet den Trial. Reihenfolge mit Absicht: `respond` meldet die Antwort
   * mit dem Handler-Zeitstempel (§6.1 Regel 5), `update` sichert den Endstand
   * auch dann, wenn der Runner die Antwort wegen vorheriger `update`-Aufrufe
   * bereits kennt, und `complete` beendet die wartende Phase.
   */
  function finish(response: LightsOutResponse, atMs: number) {
    props.respond(response, atMs);
    props.update(response);
    props.complete();
  }

  function handleTap(cell: number, atMs: number) {
    if (!trial || !props.acceptsInput) return;
    const elapsedMs = props.elapsed(atMs) ?? 0;
    const next = applyLightsOutMove(board, trial.size, cell);
    const nextMoves = [...moves, cell];
    moves = nextMoves;
    const nextSolved = next.every((on) => !on);
    if (nextSolved) {
      finish({ moves: nextMoves, solved: true, elapsedMs }, atMs);
      return;
    }
    props.update({ moves: nextMoves, solved: false, elapsedMs });
  }

  /**
   * Zurücksetzen ist kein Undo: die bisherigen Züge werden ein zweites Mal
   * angewandt und heben sich dadurch auf (Züge sind involutiv und kommutativ,
   * §12.10). Das Brett steht wieder auf der Ausgangsstellung, die Zugzahl
   * zählt aber weiter — ehrlich gegenüber der Wertung und identisch zu dem,
   * was der Server nachspielt.
   */
  function handleReset() {
    const atMs = performance.now();
    if (!trial || !props.acceptsInput) return;
    const nextMoves = [...moves, ...moves];
    moves = nextMoves;
    props.update({ moves: nextMoves, solved: false, elapsedMs: props.elapsed(atMs) ?? 0 });
  }

  function handleGiveUp() {
    const atMs = performance.now();
    if (!props.acceptsInput) return;
    finish({ moves, solved: false, elapsedMs: props.elapsed(atMs) ?? 0 }, atMs);
  }
</script>

<div class="lights-out">
  <!-- Fester Kopfbereich: Zähler und Lösungshinweis verschieben nichts (§13.4). -->
  <div class="header">
    <dl class="counters">
      <div>
        <dt>{t('game.lights-out.moves')}</dt>
        <dd>{moves.length}</dd>
      </div>
      <div>
        <dt>{t('game.lights-out.optimal')}</dt>
        <dd>{trial?.optimalMoves ?? 0}</dd>
      </div>
    </dl>
    <p class="solved" aria-live="polite">
      {#if solved}
        <!-- Symbol zusätzlich zur Farbe (§13.4). -->
        <span aria-hidden="true">✓</span>
        {t('game.lights-out.solved')}
      {/if}
    </p>
  </div>

  <div class="board">
    <GridInput
      {cells}
      columns={size}
      disabled={!props.acceptsInput}
      label={t('game.lights-out.name')}
      ontap={handleTap}
    />
  </div>

  <div class="actions">
    <button type="button" onclick={handleReset} disabled={!props.acceptsInput}>
      {t('game.lights-out.reset')}
    </button>
    <button type="button" onclick={handleGiveUp} disabled={!props.acceptsInput}>
      {t('game.lights-out.give-up')}
    </button>
  </div>
</div>

<style>
  .lights-out {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
  }

  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    /* Feste Höhe: der Lösungshinweis darf das Brett nicht verschieben. */
    height: 4.5rem;
    justify-content: center;
  }

  .counters {
    display: flex;
    gap: var(--space-5);
    margin: 0;
  }

  .counters div {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .counters dt {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .counters dd {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .solved {
    /* Fester Platz, auch solange nichts gelöst ist. */
    min-height: 1.5rem;
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-correct);
  }

  .board {
    display: flex;
    justify-content: center;
    width: min(100%, 26rem);
  }

  .actions {
    display: flex;
    gap: var(--space-3);
  }

  .actions button {
    min-height: var(--hit-min);
    padding: var(--space-2) var(--space-5);
    background: var(--color-surface);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--text-md);
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  .actions button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .actions button:not(:disabled):hover {
    border-color: var(--color-accent);
  }
</style>
