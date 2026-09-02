<script module lang="ts">
  import type { Phase } from '$lib/runner';
  import type { StroopConfig } from '@neuron/games';

  /**
   * Phasenfolge (§12.4): fixation (400 ms) → stimulus (deadlineMs, Input)
   * → feedback (250 ms).
   */
  export function phases(config: StroopConfig): Phase[] {
    return [
      { name: 'fixation', durationMs: 400, acceptsInput: false },
      { name: 'stimulus', durationMs: config.deadlineMs, acceptsInput: true },
      { name: 'feedback', durationMs: 250, acceptsInput: false },
    ];
  }

  const COLOR_VARS = [
    '--stim-red',
    '--stim-blue',
    '--stim-green',
    '--stim-yellow',
    '--stim-purple',
  ];
</script>

<script lang="ts">
  import Feedback from '$lib/components/Feedback.svelte';
  import StimulusStage from '$lib/components/StimulusStage.svelte';
  import { t } from '$lib/i18n';
  import { ChoiceInput } from '$lib/input';
  import type { GameViewProps } from '$lib/games/registry';
  import type { StroopTrial } from '@neuron/games';

  const props: GameViewProps = $props();

  const config = $derived(props.config as StroopConfig);
  const trials = $derived(props.trials as StroopTrial[]);
  const trial = $derived(trials[props.trialIndex]);

  const options = $derived(
    Array.from({ length: config.colors }, (_, i) => ({
      value: i,
      label: t(`color.${i}`),
      swatch: COLOR_VARS[i],
    })),
  );

  const showStimulus = $derived(props.phaseName === 'stimulus');
  const showFeedback = $derived(props.phaseName === 'feedback');
</script>

<div class="stroop">
  <StimulusStage>
    <p class="rule" aria-live="polite">
      {trial && config.switchRule ? t(`game.stroop.rule.${trial.rule}`) : ''}
    </p>
    <div class="word-slot">
      {#if showStimulus && trial}
        <span class="word" style:color={`var(${COLOR_VARS[trial.ink]})`}>
          {t(`color.${trial.word}`)}
        </span>
      {:else if showFeedback}
        <Feedback
          state={props.lastCorrect === null ? 'none' : props.lastCorrect ? 'correct' : 'wrong'}
        />
      {:else}
        <span class="fixation" aria-hidden="true">+</span>
      {/if}
    </div>
  </StimulusStage>

  <ChoiceInput
    {options}
    disabled={!props.acceptsInput}
    onchoose={(value, atMs) => props.respond({ choice: value }, atMs)}
  />
</div>

<style>
  .stroop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    width: 100%;
  }

  .rule {
    /* Feste Höhe, damit der Regelwechsel das Layout nicht verschiebt (§13.4). */
    min-height: 1.5rem;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .word-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 8rem;
  }

  .word {
    font-family: var(--font-stimulus);
    font-size: var(--text-stimulus);
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .fixation {
    font-size: var(--text-2xl);
    color: var(--color-text-muted);
  }
</style>
