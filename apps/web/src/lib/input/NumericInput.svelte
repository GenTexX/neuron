<script lang="ts">
  import { t } from '$lib/i18n';

  type Props = {
    disabled?: boolean;
    allowNegative?: boolean;
    maxLength?: number;
    onsubmit: (value: number, atMs: number) => void;
  };

  const { disabled = false, allowNegative = true, maxLength = 6, onsubmit }: Props = $props();

  let raw = $state('');
  let negative = $state(false);

  const display = $derived((negative ? '−' : '') + (raw === '' ? '0' : raw));
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  function append(d: string) {
    if (raw.length >= maxLength) return;
    raw = raw === '0' ? d : raw + d;
  }

  function clear() {
    raw = '';
    negative = false;
  }

  function backspace() {
    raw = raw.slice(0, -1);
  }

  function submit(atMs: number) {
    if (raw === '') return;
    const value = Number(raw) * (negative ? -1 : 1);
    if (!Number.isFinite(value)) return;
    onsubmit(value, atMs);
    clear();
  }

  function handleKey(event: KeyboardEvent) {
    const at = performance.now();
    if (disabled) return;
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      append(event.key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      backspace();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      submit(at);
    } else if (event.key === '-' && allowNegative) {
      event.preventDefault();
      negative = !negative;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      clear();
    }
  }
</script>

<svelte:window on:keydown={handleKey} />

<!--
  Eigenes On-Screen-Ziffernfeld statt <input type="number"> (§7.2):
  das native Feld öffnet auf Mobile inkonsistente Tastaturen und ist eine
  Quelle von Timing-Rauschen.
-->
<div class="numeric" class:disabled>
  <output class="display" aria-live="polite">{display}</output>
  <div class="pad">
    {#each digits as d (d)}
      <button
        type="button"
        class="key"
        class:zero={d === '0'}
        {disabled}
        onpointerdown={(e) => {
          e.preventDefault();
          append(d);
        }}>{d}</button
      >
    {/each}
    {#if allowNegative}
      <button
        type="button"
        class="key fn"
        {disabled}
        aria-pressed={negative}
        aria-label={t('input.numeric.minus')}
        onpointerdown={(e) => {
          e.preventDefault();
          negative = !negative;
        }}>±</button
      >
    {/if}
    <button
      type="button"
      class="key fn"
      {disabled}
      aria-label={t('input.numeric.clear')}
      onpointerdown={(e) => {
        e.preventDefault();
        backspace();
      }}>⌫</button
    >
    <button
      type="button"
      class="key submit"
      {disabled}
      onpointerdown={(e) => {
        const at = performance.now();
        e.preventDefault();
        submit(at);
      }}>{t('input.numeric.submit')}</button
    >
  </div>
</div>

<style>
  .numeric {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    max-width: 20rem;
  }

  .numeric.disabled {
    opacity: 0.45;
  }

  .display {
    display: block;
    min-height: 3.5rem;
    padding: var(--space-2) var(--space-4);
    background: var(--color-surface);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: var(--text-xl);
    text-align: right;
    line-height: 2.5rem;
  }

  .pad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }

  .key {
    min-height: var(--hit-min);
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--text-lg);
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
  }

  .key:not(:disabled):active {
    background: var(--color-accent-soft);
  }

  .key:disabled {
    cursor: default;
  }

  .fn {
    font-size: var(--text-md);
  }

  .submit {
    grid-column: 1 / -1;
    background: var(--color-accent);
    color: var(--color-accent-text);
    border-color: transparent;
  }
</style>
