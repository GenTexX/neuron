<script lang="ts">
  import { t } from '$lib/i18n';

  /**
   * Pflicht-Countdown vor zeitkritischen Runs (§13.2). Ohne ihn wird der erste
   * Trial systematisch schlechter beantwortet, was die Messung verzerrt.
   * Die Zählung läuft über requestAnimationFrame gegen performance.now().
   */
  type Props = { from?: number; oncomplete: () => void };
  const { from = 3, oncomplete }: Props = $props();

  // Startwert wird im Effekt gesetzt, damit `from` nicht nur initial gelesen wird.
  let remaining = $state(0);

  $effect(() => {
    remaining = from;
    const start = performance.now();
    let raf = 0;
    const tick = (ts: number) => {
      const elapsed = ts - start;
      const left = from - Math.floor(elapsed / 1000);
      remaining = Math.max(0, left);
      if (elapsed >= from * 1000) {
        oncomplete();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="countdown" role="status" aria-live="assertive">
  {remaining > 0 ? remaining : t('play.countdown.go')}
</div>

<style>
  .countdown {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 12rem;
    font-size: var(--text-2xl);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--color-accent);
  }
</style>
