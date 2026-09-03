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
    /*
     * `flex-basis: 0` statt einer festen Höhe: die Bühne bekommt genau den
     * Platz, den Kopfzeile und Eingabe übrig lassen. Entscheidend ist die
     * Null als Basis – damit hängt die Größe am Container und nicht am
     * Inhalt, die Bühne behält also über alle Phasen eines Trials dieselben
     * Abmessungen (§13.4). Nach oben bleibt es bei den bisherigen 24rem.
     */
    flex: 1 1 0;
    min-height: 6rem;
    max-height: min(60vh, 24rem);
    overflow: hidden;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    contain: layout paint;
  }

  .stage.wide {
    width: min(100%, 44rem);
  }

  /* Auf dem Telefon zählt jeder Pixel für die Eingabe darunter. */
  @media (height <= 44rem) {
    .stage {
      max-height: 45vh;
    }
  }
</style>
