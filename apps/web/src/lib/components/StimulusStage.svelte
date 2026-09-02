<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Bühne für die Stimuluspräsentation. Feste Abmessungen, neutraler und
   * konstanter Hintergrund, keine Animationen (§13.4): Layout-Verschiebungen
   * während eines Trials erzeugen Reflows und damit Timing-Rauschen.
   */
  type Props = { children: Snippet; wide?: boolean };
  const { children, wide = false }: Props = $props();
</script>

<div class="stage" class:wide>
  {@render children()}
</div>

<style>
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: min(100%, 32rem);
    height: min(60vh, 24rem);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    contain: layout paint;
  }

  .stage.wide {
    width: min(100%, 44rem);
  }
</style>
