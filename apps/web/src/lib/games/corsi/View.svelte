<script module lang="ts">
  import type { Phase } from '$lib/runner';
  import { corsiSequenceLength, type CorsiConfig, type CorsiTrial } from '@neuron/games';

  /**
   * Phasenfolge (§12.3): ready (600 ms) → je Sequenzelement flash/gap →
   * input (wartet auf die Antwort) → feedback (500 ms). Die Sequenzlänge
   * wächst innerhalb eines Runs, deshalb hängt die Folge vom Trial-Index ab.
   */
  export function phases(config: CorsiConfig, trials: CorsiTrial[], index: number): Phase[] {
    const length = trials[index]?.sequence.length ?? corsiSequenceLength(config, index);
    const list: Phase[] = [{ name: 'ready', durationMs: 600, acceptsInput: false }];
    for (let k = 0; k < length; k++) {
      list.push({ name: `flash-${k}`, durationMs: config.flashMs, acceptsInput: false });
      list.push({ name: `gap-${k}`, durationMs: config.gapMs, acceptsInput: false });
    }
    list.push({ name: 'input', durationMs: null, acceptsInput: true });
    list.push({ name: 'feedback', durationMs: 500, acceptsInput: false });
    return list;
  }

  /** Sequenzposition aus dem Phasennamen (`flash-2` → 2); null außerhalb. */
  function flashIndexOf(phaseName: string | null): number | null {
    const match = phaseName?.match(/^flash-(\d+)$/);
    return match ? Number(match[1]) : null;
  }
</script>

<script lang="ts">
  import Feedback from '$lib/components/Feedback.svelte';
  import { t } from '$lib/i18n';
  import { GridInput } from '$lib/input';
  import type { GameViewProps } from '$lib/games/registry';
  import { CORSI_LAYOUT } from '@neuron/games';

  const props: GameViewProps = $props();

  const config = $derived(props.config as CorsiConfig);
  const trials = $derived(props.trials as CorsiTrial[]);
  const trial = $derived(trials[props.trialIndex]);

  /** Festes, unregelmäßiges Corsi-Layout in Normkoordinaten 0..1 (§12.3). */
  const positions = $derived(CORSI_LAYOUT.slice(0, config.blocks));

  const flashIndex = $derived(flashIndexOf(props.phaseName));
  const showFeedback = $derived(props.phaseName === 'feedback');
  const isInput = $derived(props.phaseName === 'input');
  const expected = $derived(trial?.sequence.length ?? 0);

  /** Diskrete Antwort: lokal gesammelt, am Ende der Sequenzlänge gemeldet. */
  let taps = $state<number[]>([]);
  /** Zuletzt getippter Block, damit der Tipp sichtbar quittiert wird. */
  let lastTap = $state<number | null>(null);

  $effect(() => {
    // Beim Trialwechsel die lokal gesammelte Antwort verwerfen.
    resetTrialState(props.trialIndex);
  });

  function resetTrialState(_trialIndex: number) {
    taps = [];
    lastTap = null;
  }

  const hint = $derived(
    isInput
      ? config.reverse
        ? t('game.corsi.repeatReverse')
        : t('game.corsi.repeat')
      : t('game.corsi.watch'),
  );

  const cells = $derived(
    positions.map((_, i) => {
      // In der Flash-Phase leuchtet genau der Block der aktuellen Sequenzposition.
      const flashing = flashIndex !== null && trial?.sequence[flashIndex] === i;
      return { active: flashing || (isInput && lastTap === i), disabled: !isInput };
    }),
  );

  function handleTap(index: number, atMs: number) {
    if (!isInput || expected === 0) return;
    const next = [...taps, index];
    taps = next;
    lastTap = index;
    if (next.length >= expected) props.respond({ taps: next }, atMs);
  }
</script>

<div class="corsi">
  <!-- Feste Höhe: Hinweis und Feedback teilen sich denselben Platz (§13.4). -->
  <div class="hint-slot" aria-live="polite">
    {#if showFeedback}
      <Feedback
        state={props.lastCorrect === null ? 'none' : props.lastCorrect ? 'correct' : 'wrong'}
      />
    {:else}
      <p class="hint">{hint}</p>
    {/if}
  </div>

  <div class="board">
    <GridInput
      {cells}
      columns={3}
      {positions}
      disabled={!props.acceptsInput}
      label={t('game.corsi.name')}
      ontap={handleTap}
    />
  </div>
</div>

<style>
  .corsi {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
  }

  .hint-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 3rem;
  }

  .hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  /* Feste, quadratische Bühne; neutraler, konstanter Hintergrund (§13.4). */
  .board {
    display: flex;
    align-items: center;
    justify-content: center;
    width: min(100%, 22rem);
    aspect-ratio: 1;
    padding: var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    contain: layout paint;
  }
</style>
