<script module lang="ts">
  import type { Phase } from '$lib/runner';
  import { MENTAL_CHAIN_START_MS, type MentalChainConfig, type MentalChainOp } from '@neuron/games';

  /**
   * Phasenfolge (§12.1): start (1200 ms) → je Rechenschritt `step-<k>`
   * (`stepMs`) und `gap-<k>` (`gapMs`) → answer (ohne Limit, Input).
   * Die View deklariert die Phasen nur; das Timing macht der Runner (§6.3).
   */
  export function phases(config: MentalChainConfig): Phase[] {
    const list: Phase[] = [
      { name: 'start', durationMs: MENTAL_CHAIN_START_MS, acceptsInput: false },
    ];
    for (let k = 0; k < config.steps; k++) {
      list.push({ name: `step-${k}`, durationMs: config.stepMs, acceptsInput: false });
      list.push({ name: `gap-${k}`, durationMs: config.gapMs, acceptsInput: false });
    }
    list.push({ name: 'answer', durationMs: null, acceptsInput: true });
    return list;
  }

  /** Typografische Operatorzeichen: `+7`, `−12`, `×3` — nicht Bindestrich/x. */
  const OP_SIGN: Record<MentalChainOp, string> = { add: '+', sub: '−', mul: '×' };

  /** Schrittindex aus `step-<k>`, sonst null. */
  function stepIndexOf(phaseName: string | null): number | null {
    if (phaseName === null) return null;
    const match = /^step-(\d+)$/.exec(phaseName);
    return match === null ? null : Number(match[1]);
  }
</script>

<script lang="ts">
  import StimulusStage from '$lib/components/StimulusStage.svelte';
  import { t } from '$lib/i18n';
  import { NumericInput } from '$lib/input';
  import type { GameViewProps } from '$lib/games/registry';
  import type { MentalChainTrial } from '@neuron/games';

  const props: GameViewProps = $props();

  const trials = $derived(props.trials as MentalChainTrial[]);
  const trial = $derived(trials[props.trialIndex]);

  const showStart = $derived(props.phaseName === 'start');
  const showAnswer = $derived(props.phaseName === 'answer');
  const stepIndex = $derived(stepIndexOf(props.phaseName));
  const step = $derived(stepIndex === null ? undefined : trial?.steps[stepIndex]);
</script>

<div class="mental-chain">
  <StimulusStage>
    <p class="caption" aria-live="polite">{showStart ? t('game.mental-chain.start') : ''}</p>
    <!--
      Ein einziger Slot für Startzahl, Schritt und Pause: gleiche Abmessungen in
      jeder Phase, damit zwischen den Schritten nichts springt (§13.4).
    -->
    <div class="value-slot">
      {#if showStart && trial}
        <span class="value">{trial.start}</span>
      {:else if step}
        <span class="value">{OP_SIGN[step.op]}{step.value}</span>
      {:else if showAnswer}
        <span class="value muted" aria-hidden="true">?</span>
      {/if}
    </div>
  </StimulusStage>

  <div class="answer">
    <p class="label">{t('game.mental-chain.result')}</p>
    <!--
      Das Ziffernfeld steht dauerhaft, nur deaktiviert: es erst in der
      answer-Phase einzublenden wäre ein Layout-Shift mitten im Trial (§13.4).
    -->
    <NumericInput
      allowNegative
      disabled={!props.acceptsInput}
      onsubmit={(value, atMs) => props.respond({ value }, atMs)}
    />
  </div>
</div>

<style>
  .mental-chain {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    width: 100%;
  }

  .caption {
    /* Feste Höhe, damit die Beschriftung das Layout nicht verschiebt (§13.4). */
    min-height: 1.5rem;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .value-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 8rem;
  }

  .value {
    font-family: var(--font-mono);
    font-size: var(--text-stimulus);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: var(--color-text-muted);
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
