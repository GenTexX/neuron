<script lang="ts">
  import { t } from '$lib/i18n';

  type Props = {
    disabled?: boolean;
    /** Zeitstempel wird als erste Anweisung im Handler genommen (§6.1). */
    onpress: (atMs: number) => void;
    label?: string;
    hint?: string;
  };

  const {
    disabled = false,
    onpress,
    label = t('input.press'),
    hint = t('input.pressHint'),
  }: Props = $props();

  function handleKey(event: KeyboardEvent) {
    const at = performance.now();
    if (disabled || event.repeat) return;
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    onpress(at);
  }

  function handlePointer(event: PointerEvent) {
    const at = performance.now();
    if (disabled) return;
    event.preventDefault();
    onpress(at);
  }
</script>

<svelte:window on:keydown={handleKey} />

<button type="button" class="press" {disabled} onpointerdown={handlePointer}>
  <span class="label">{label}</span>
  <span class="hint">{hint}</span>
</button>

<style>
  .press {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    width: 100%;
    max-width: 32rem;
    min-height: 5rem;
    padding: var(--space-4);
    background: var(--color-accent);
    color: var(--color-accent-text);
    border: none;
    border-radius: var(--radius-lg);
    font-size: var(--text-lg);
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
  }

  .press:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .press:not(:disabled):active {
    filter: brightness(0.92);
  }

  .hint {
    font-size: var(--text-xs);
    font-weight: 400;
    opacity: 0.85;
  }
</style>
