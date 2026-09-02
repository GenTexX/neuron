<script lang="ts">
  /**
   * Rückmeldung richtig/falsch. Trägt immer ein Symbol zusätzlich zur Farbe
   * (§13.4) – reine Farbcodierung ist unzulässig.
   */
  type Props = { state: 'correct' | 'wrong' | 'none' };
  const { state }: Props = $props();
</script>

<div class="feedback" data-state={state} aria-live="polite">
  {#if state === 'correct'}
    <span class="mark" aria-hidden="true">✓</span><span class="visually-hidden">Richtig</span>
  {:else if state === 'wrong'}
    <span class="mark" aria-hidden="true">✗</span><span class="visually-hidden">Falsch</span>
  {/if}
</div>

<style>
  .feedback {
    /* Feste Abmessungen: kein Layout-Shift zwischen Phasen (§13.4). */
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    font-size: var(--text-xl);
    font-weight: 700;
  }

  .feedback[data-state='correct'] {
    color: var(--color-correct);
  }

  .feedback[data-state='wrong'] {
    color: var(--color-wrong);
  }
</style>
