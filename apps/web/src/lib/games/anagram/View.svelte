<script module lang="ts">
  import type { Phase } from '$lib/runner';
  import type { AnagramConfig } from '@neuron/games';

  /**
   * Phasenfolge (§12.9): word (`deadlineMs`, Input) → feedback (700 ms).
   * Kein Zeitdruck (`timingSensitive` false) — die Deadline steuert nur den
   * Geschwindigkeitsbonus.
   */
  export function phases(config: AnagramConfig): Phase[] {
    return [
      { name: 'word', durationMs: config.deadlineMs, acceptsInput: true },
      { name: 'feedback', durationMs: 700, acceptsInput: false },
    ];
  }
</script>

<script lang="ts">
  import Feedback from '$lib/components/Feedback.svelte';
  import StimulusStage from '$lib/components/StimulusStage.svelte';
  import { t } from '$lib/i18n';
  import { TextInput } from '$lib/input';
  import type { GameViewProps } from '$lib/games/registry';
  import type { AnagramTrial } from '@neuron/games';

  const props: GameViewProps = $props();

  const trials = $derived(props.trials as AnagramTrial[]);
  const trial = $derived(trials[props.trialIndex]);
  const scrambled = $derived((trial?.scrambled ?? '').toUpperCase());

  const showFeedback = $derived(props.phaseName === 'feedback');
  /**
   * Bei falscher Antwort die erste Lösung zeigen: didaktisch sinnvoll und
   * unbedenklich, weil sie nichts über künftige Trials verrät.
   */
  const revealed = $derived(
    showFeedback && props.lastCorrect !== true ? (trial?.solutions[0] ?? '').toUpperCase() : '',
  );
</script>

<div class="anagram">
  <StimulusStage wide>
    <p class="word">{scrambled}</p>
    <!-- Fester Feedback-Platz, damit das Wort zwischen den Phasen stehen bleibt (§13.4). -->
    <div class="feedback-slot">
      {#if showFeedback}
        <Feedback
          state={props.lastCorrect === null ? 'none' : props.lastCorrect ? 'correct' : 'wrong'}
        />
      {/if}
    </div>
    <p class="solution" aria-live="polite">
      {revealed === '' ? '' : t('game.anagram.solution', { word: revealed })}
    </p>
  </StimulusStage>

  <TextInput
    placeholder={t('game.anagram.solve')}
    disabled={!props.acceptsInput}
    onsubmit={(text, atMs) => props.respond({ text }, atMs)}
  />
</div>

<style>
  .anagram {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    width: 100%;
  }

  .word {
    /* Sperrsatz macht die Buchstaben einzeln greifbar; die Größe muss dafür
       auf schmalen Displays mitgehen, sonst läuft ein 9-Buchstaben-Wort über. */
    margin: 0;
    padding: 0 var(--space-4);
    font-family: var(--font-stimulus);
    font-size: clamp(1.5rem, 7vw, var(--text-stimulus));
    font-weight: 700;
    letter-spacing: 0.18em;
    text-indent: 0.18em;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .feedback-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 3rem;
  }

  .solution {
    /* Feste Höhe: die Auflösung erscheint, ohne das Wort zu verschieben. */
    min-height: 1.75rem;
    margin: 0;
    font-size: var(--text-md);
    color: var(--color-text-muted);
    letter-spacing: 0.06em;
  }
</style>
