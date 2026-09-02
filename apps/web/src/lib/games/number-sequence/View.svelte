<script module lang="ts">
  import type { Phase } from '$lib/runner';
  import type { NumberSequenceConfig } from '@neuron/games';

  /**
   * Phasenfolge (§12.8): sequence (`deadlineMs`; ohne Limit wartet die Phase
   * auf die Antwort) → feedback (600 ms). Kein Zeitdruck (`timingSensitive`
   * false), die Folge bleibt die ganze Antwortphase über sichtbar.
   */
  export function phases(config: NumberSequenceConfig): Phase[] {
    return [
      { name: 'sequence', durationMs: config.deadlineMs, acceptsInput: true },
      { name: 'feedback', durationMs: 600, acceptsInput: false },
    ];
  }
</script>

<script lang="ts">
  import Feedback from '$lib/components/Feedback.svelte';
  import StimulusStage from '$lib/components/StimulusStage.svelte';
  import { t } from '$lib/i18n';
  import { NumericInput } from '$lib/input';
  import type { GameViewProps } from '$lib/games/registry';
  import type { NumberSequenceTrial } from '@neuron/games';

  const props: GameViewProps = $props();

  const trials = $derived(props.trials as NumberSequenceTrial[]);
  const trial = $derived(trials[props.trialIndex]);
  const shown = $derived(trial?.shown ?? []);

  const showFeedback = $derived(props.phaseName === 'feedback');
</script>

<div class="number-sequence">
  <StimulusStage wide>
    <!--
      Die Folge steht während der gesamten Antwortphase (und im Feedback): das
      Spiel prüft Regelerkennung, nicht das Auswendiglernen der Glieder.
    -->
    <ol class="sequence" aria-label={t('game.number-sequence.name')}>
      {#each shown as term, i (i)}
        <li class="term">{term}</li>
      {/each}
      <li class="term unknown" aria-label={t('game.number-sequence.unknown')}>?</li>
    </ol>
    <!-- Fester Feedback-Platz: keine Verschiebung der Folge zwischen den Phasen (§13.4). -->
    <div class="feedback-slot">
      {#if showFeedback}
        <Feedback
          state={props.lastCorrect === null ? 'none' : props.lastCorrect ? 'correct' : 'wrong'}
        />
      {/if}
    </div>
  </StimulusStage>

  <div class="answer">
    <p class="label">{t('game.number-sequence.next')}</p>
    <NumericInput
      allowNegative
      disabled={!props.acceptsInput}
      onsubmit={(value, atMs) => props.respond({ value }, atMs)}
    />
  </div>
</div>

<style>
  .number-sequence {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    width: 100%;
  }

  .sequence {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-2) var(--space-3);
    width: 100%;
    min-height: 8rem;
    margin: 0;
    padding: 0 var(--space-4);
    list-style: none;
  }

  .term {
    min-width: 2.5rem;
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: clamp(1.25rem, 5vw, var(--text-xl));
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .unknown {
    background: var(--color-accent-soft);
    border-color: var(--color-accent);
    color: var(--color-accent);
    font-weight: 700;
  }

  .feedback-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 3rem;
  }

  .answer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
  }

  .label {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
</style>
