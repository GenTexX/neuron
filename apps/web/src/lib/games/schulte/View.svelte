<script module lang="ts">
  import type { Phase } from '$lib/runner';

  /**
   * Phasenfolge (§12.6): eine einzige, wartende Phase `table`. Der Trial ist
   * der ganze Block (Antwortmodell continuous); er endet, wenn die letzte
   * Zielzelle getroffen wurde oder der Run abgebrochen wird.
   */
  export function phases(): Phase[] {
    return [{ name: 'table', durationMs: null, acceptsInput: true }];
  }

  /**
   * Dreht ein quadratisches Raster um 90° im Uhrzeigersinn. Reine
   * Hilfsfunktion ohne Spiellogik: sie wird auf die *Anzeige-Reihenfolge*
   * angewandt, nicht auf den Trial (§12.6 `rotating`).
   */
  export function rotateGrid<T>(cells: readonly T[], size: number): T[] {
    const out: T[] = [];
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        // Im Uhrzeigersinn: die neue Zeile `row` ist die alte Spalte `row`,
        // von unten nach oben gelesen.
        out.push(cells[(size - 1 - col) * size + row]);
      }
    }
    return out;
  }
</script>

<script lang="ts">
  import { t } from '$lib/i18n';
  import { GridInput } from '$lib/input';
  import type { GridCell } from '$lib/input/GridInput.svelte';
  import type { GameViewProps } from '$lib/games/registry';
  import type { SchulteConfig, SchulteTap, SchulteTrial } from '@neuron/games';

  const props: GameViewProps = $props();

  const config = $derived(props.config as SchulteConfig);
  const trials = $derived(props.trials as SchulteTrial[]);
  /** Ein Run = ein Trial (§12.6), der Index bleibt 0. */
  const trial = $derived(trials[props.trialIndex]);
  const size = $derived(config.size);

  /** Alle Taps des Blocks, in der Reihenfolge der Eingabe. */
  let taps = $state<SchulteTap[]>([]);

  /** Anzahl der bisherigen 90°-Drehungen der Darstellung (nur bei `rotating`). */
  let rotations = $state(0);

  /** Zuletzt falsch getippte *ursprüngliche* Zelle; der nächste Tap überschreibt sie. */
  let wrongCell = $state<number | null>(null);

  const correctCount = $derived(taps.filter((tap) => tap.correct).length);
  const total = $derived(trial?.order.length ?? 0);
  /** Das aktuell gesuchte Element; nach dem letzten Treffer undefined. */
  const target = $derived(trial?.order[correctCount]);
  /** Bereits abgearbeitete Zielwerte — die Zellen werden abgeblendet. */
  const doneValues = $derived(new Set(trial?.order.slice(0, correctCount) ?? []));

  /**
   * Anzeige-Reihenfolge als Permutation: `displayOrder[anzeigeIndex]` ist der
   * *ursprüngliche* Zellindex aus `trial.grid`. Ohne `rotating` bleibt das die
   * Identität; mit `rotating` kommt je korrektem Tipp eine 90°-Drehung dazu
   * (vier Drehungen ergeben wieder die Identität). Weil nur die Permutation
   * rotiert, bleibt `trial.grid` unangetastet — die an den Server gemeldeten
   * `cell`-Indizes beziehen sich weiterhin auf das ursprüngliche Raster.
   */
  const displayOrder = $derived.by(() => {
    let order = Array.from({ length: size * size }, (_, i) => i);
    for (let i = 0; i < rotations % 4; i++) order = rotateGrid(order, size);
    return order;
  });

  const cells = $derived<GridCell[]>(
    displayOrder.map((cell) => ({
      label: trial?.grid[cell] ?? '',
      done: doneValues.has(trial?.grid[cell] ?? ''),
      state: cell === wrongCell ? 'wrong' : null,
    })),
  );

  function handleTap(display: number, atMs: number) {
    if (!trial) return;
    // Rückbildung: der Tap kam auf einer Position der (ggf. gedrehten)
    // Anzeige, gemeldet wird der ursprüngliche Zellindex.
    const cell = displayOrder[display];
    if (cell === undefined) return;

    // Zeitstempel unverändert aus GridInput; `elapsed` misst ab Onset der Phase.
    const rtMs = props.elapsed(atMs) ?? 0;
    const correct = trial.grid[cell] === target;
    const next: SchulteTap[] = [...taps, { cell, rtMs, correct }];
    taps = next;
    // Rein visuelle Markierung ohne Timer: der nächste Tap setzt sie neu.
    wrongCell = correct ? null : cell;

    if (!correct) {
      // Fehltipps kosten Punkte, das Ziel bleibt dasselbe (§12.6).
      props.update({ taps: next });
      return;
    }

    // `rotating`: nach jedem korrekten Tipp dreht sich die Darstellung um 90°.
    if (config.rotating) rotations += 1;

    // Bewusst aus `next` gezählt statt aus dem abgeleiteten `correctCount`:
    // unabhängig davon, wann die Ableitung neu berechnet wird.
    const done = next.filter((tap) => tap.correct).length;
    if (done < total) {
      props.update({ taps: next });
      return;
    }

    // Tabelle vollständig: erst die Antwort mit dem Handler-Zeitstempel melden,
    // dann den Endstand fortschreiben. `complete()` beendet die wartende Phase
    // — nötig, weil der Runner nur *eine* `respond`-Antwort je Trial annimmt
    // und über `update` bereits eine vorliegt.
    props.respond({ taps: next }, atMs);
    props.update({ taps: next });
    props.complete();
  }
</script>

<div class="schulte">
  <!-- Fester Kopfbereich: der Wechsel des Zielwerts verschiebt nichts (§13.4). -->
  <div class="header">
    <p class="prompt" aria-live="polite">
      <span class="caption">{t('game.schulte.next')}</span>
      <span class="target">{target ?? ''}</span>
    </p>
    <p class="progress">{t('game.schulte.progress', { done: correctCount, total })}</p>
  </div>

  <div class="board">
    <GridInput
      {cells}
      columns={size}
      disabled={!props.acceptsInput}
      label={t('game.schulte.name')}
      ontap={handleTap}
    />
  </div>
</div>

<style>
  .schulte {
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
    /* Feste Höhe, damit ein- und zweistellige Ziele gleich viel Platz haben. */
    height: 5.5rem;
    justify-content: center;
  }

  .prompt {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin: 0;
  }

  .caption {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .target {
    display: inline-block;
    /* Feste Breite: der Zielwert wechselt zwischen 1 und 2 Zeichen. */
    min-width: 2.5ch;
    text-align: center;
    font-family: var(--font-stimulus);
    font-size: var(--text-2xl);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--color-accent);
  }

  .progress {
    margin: 0;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    color: var(--color-text-muted);
  }

  .board {
    display: flex;
    justify-content: center;
    width: min(100%, 26rem);
  }
</style>
