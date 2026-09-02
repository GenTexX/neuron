<script lang="ts">
  import { t } from '$lib/i18n';

  export type ChoiceOption = {
    value: number;
    label: string;
    /** Optionale Farbfläche (CSS-Custom-Property-Name aus tokens.css). */
    swatch?: string;
  };

  type Props = {
    options: ChoiceOption[];
    disabled?: boolean;
    /** Wird mit dem Zeitstempel des Event-Handlers aufgerufen (§6.1 Regel 5). */
    onchoose: (value: number, atMs: number) => void;
    label?: string;
  };

  const { options, disabled = false, onchoose, label = t('input.choose') }: Props = $props();

  /**
   * Tastaturkürzel (§7.2): bei zwei Optionen F/J (Zeigefinger-Grundstellung,
   * in der Psychophysik üblich) plus Pfeiltasten; bei n Optionen die Ziffern.
   */
  function shortcutFor(index: number, total: number): string {
    if (total === 2) return index === 0 ? 'F' : 'J';
    return String(index + 1);
  }

  function handleKey(event: KeyboardEvent) {
    if (disabled) return;
    const at = performance.now();
    const key = event.key.toLowerCase();
    let index = -1;
    if (options.length === 2) {
      if (key === 'f' || key === 'arrowleft') index = 0;
      else if (key === 'j' || key === 'arrowright') index = 1;
    }
    if (index === -1 && /^[1-9]$/.test(key)) index = Number(key) - 1;
    const option = options[index];
    if (!option) return;
    event.preventDefault();
    onchoose(option.value, at);
  }

  function handlePointer(event: PointerEvent, value: number) {
    const at = performance.now();
    if (disabled) return;
    event.preventDefault();
    onchoose(value, at);
  }
</script>

<svelte:window on:keydown={handleKey} />

<div class="choices" role="group" aria-label={label} data-count={options.length}>
  {#each options as option, i (option.value)}
    <button
      type="button"
      class="choice"
      {disabled}
      onpointerdown={(e) => handlePointer(e, option.value)}
      aria-keyshortcuts={shortcutFor(i, options.length)}
    >
      {#if option.swatch}
        <!-- §12.4: nie nur Farbe – Farbfläche zusätzlich zum Namen. -->
        <span class="swatch" style:background={`var(${option.swatch})`} aria-hidden="true"></span>
      {/if}
      <span class="text">{option.label}</span>
      <span class="key" aria-hidden="true">{shortcutFor(i, options.length)}</span>
    </button>
  {/each}
</div>

<style>
  .choices {
    display: grid;
    gap: var(--space-2);
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    width: 100%;
    max-width: 42rem;
  }

  .choice {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--hit-min);
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface);
    color: var(--color-text);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--text-lg);
    font-weight: 600;
    cursor: pointer;
    /* §7.2: verhindert die 300-ms-Verzögerung durch Double-Tap-Zoom */
    touch-action: manipulation;
    user-select: none;
  }

  .choice:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .choice:not(:disabled):hover {
    border-color: var(--color-accent);
  }

  .choice:not(:disabled):active {
    background: var(--color-accent-soft);
  }

  .swatch {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    flex: none;
  }

  .key {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-1);
  }

  /* Auf Mobile bildschirmbreite Balken am unteren Rand, in Daumenreichweite. */
  @media (width <= 40rem) {
    .choices {
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }

    .choices[data-count='2'] {
      grid-template-columns: 1fr 1fr;
    }

    .choice {
      min-height: 4rem;
      font-size: var(--text-md);
    }

    .key {
      display: none;
    }
  }
</style>
