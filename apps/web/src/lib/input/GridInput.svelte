<script lang="ts">
  import { t } from '$lib/i18n';

  export type GridCell = {
    /** Beschriftung; leer für reine Farbfelder (corsi, lights-out). */
    label?: string;
    /** Hervorgehoben (aufleuchtender Corsi-Block, brennendes Licht). */
    active?: boolean;
    /** Bereits erledigt (getippte Schulte-Zahl). */
    done?: boolean;
    /** Kurzzeitige Rückmeldung. */
    state?: 'correct' | 'wrong' | null;
    disabled?: boolean;
  };

  type Props = {
    cells: GridCell[];
    columns: number;
    disabled?: boolean;
    /** Freie Positionierung in Normkoordinaten 0..1 (corsi). */
    positions?: { x: number; y: number }[];
    label?: string;
    ontap: (index: number, atMs: number) => void;
  };

  const { cells, columns, disabled = false, positions, label, ontap }: Props = $props();

  let focusIndex = $state(0);

  function tap(index: number, atMs: number) {
    if (disabled || cells[index]?.disabled) return;
    ontap(index, atMs);
  }

  function handleKey(event: KeyboardEvent) {
    const at = performance.now();
    if (disabled) return;
    const rows = Math.ceil(cells.length / columns);
    const row = Math.floor(focusIndex / columns);
    const col = focusIndex % columns;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = row * columns + Math.min(columns - 1, col + 1);
        break;
      case 'ArrowLeft':
        next = row * columns + Math.max(0, col - 1);
        break;
      case 'ArrowDown':
        next = Math.min(rows - 1, row + 1) * columns + col;
        break;
      case 'ArrowUp':
        next = Math.max(0, row - 1) * columns + col;
        break;
      case ' ':
      case 'Enter':
        event.preventDefault();
        tap(focusIndex, at);
        return;
      default:
        return;
    }
    event.preventDefault();
    if (next < cells.length) {
      focusIndex = next;
      document.getElementById(`grid-cell-${next}`)?.focus();
    }
  }
</script>

<svelte:window on:keydown={handleKey} />

<div
  class="grid"
  class:free={!!positions}
  role="group"
  aria-label={label}
  style:--columns={columns}
>
  {#each cells as cell, i (i)}
    <button
      id="grid-cell-{i}"
      type="button"
      class="cell"
      class:active={cell.active}
      class:done={cell.done}
      class:correct={cell.state === 'correct'}
      class:wrong={cell.state === 'wrong'}
      disabled={disabled || cell.disabled}
      tabindex={i === focusIndex ? 0 : -1}
      style:--x={positions ? `${positions[i].x * 100}%` : null}
      style:--y={positions ? `${positions[i].y * 100}%` : null}
      aria-label={cell.label ? undefined : t('input.grid.cell', { index: i + 1 })}
      onfocus={() => (focusIndex = i)}
      onpointerdown={(e) => {
        const at = performance.now();
        e.preventDefault();
        tap(i, at);
      }}
    >
      {#if cell.label}<span>{cell.label}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--columns), 1fr);
    gap: var(--space-2);
    width: min(100%, 26rem);
    aspect-ratio: 1;
  }

  /* Freie Positionierung für das unregelmäßige Corsi-Layout (§12.3). */
  .grid.free {
    display: block;
    position: relative;
  }

  .grid.free .cell {
    position: absolute;
    left: var(--x);
    top: var(--y);
    width: 18%;
    height: 18%;
    transform: translate(-50%, -50%);
  }

  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--hit-min);
    min-height: var(--hit-min);
    background: var(--color-surface);
    color: var(--color-text);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: clamp(var(--text-md), 4vw, var(--text-lg));
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
  }

  .grid:not(.free) .cell {
    min-width: 0;
    min-height: 0;
  }

  .cell:disabled {
    cursor: default;
  }

  .cell.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-text);
  }

  .cell.done {
    opacity: 0.4;
  }

  .cell.correct {
    border-color: var(--color-correct);
    background: var(--color-correct);
    color: var(--color-surface);
  }

  .cell.wrong {
    border-color: var(--color-wrong);
    background: var(--color-wrong);
    color: var(--color-surface);
  }
</style>
