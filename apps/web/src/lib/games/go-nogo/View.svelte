<script module lang="ts">
  import type { Phase } from '$lib/runner';
  import type { GoNoGoConfig, GoNoGoTrial } from '@neuron/games';

  /**
   * Phasenfolge (§12.5): ein Trial ist der ganze Reizstrom, deshalb gibt es je
   * Stromposition zwei Phasen — `stimulus-<i>` (`config.stimulusMs`) und
   * `isi-<i>` (der Rest bis `config.isiMs`). Beide nehmen Eingaben an: ein
   * Druck in der Lücke ist ein später Druck auf denselben Reiz, kein Druck auf
   * den nächsten. Das Timing macht damit vollständig der Runner (§6.1 Regel 2).
   */
  export function phases(config: GoNoGoConfig, trials: GoNoGoTrial[]): Phase[] {
    const length = trials[0]?.stimuli.length ?? config.length;
    const gapMs = Math.max(0, config.isiMs - config.stimulusMs);
    const list: Phase[] = [];
    for (let i = 0; i < length; i++) {
      list.push({ name: `stimulus-${i}`, durationMs: config.stimulusMs, acceptsInput: true });
      list.push({ name: `isi-${i}`, durationMs: gapMs, acceptsInput: true });
    }
    return list;
  }

  /** Stromposition aus dem Phasennamen (`stimulus-7` → 7); null außerhalb. */
  function positionOf(phaseName: string | null): number | null {
    const match = phaseName?.match(/-(\d+)$/);
    return match ? Number(match[1]) : null;
  }
</script>

<script lang="ts">
  import StimulusStage from '$lib/components/StimulusStage.svelte';
  import { t } from '$lib/i18n';
  import { PressInput } from '$lib/input';
  import type { GameViewProps } from '$lib/games/registry';
  import type { GoNoGoPress } from '@neuron/games';

  const props: GameViewProps = $props();

  const config = $derived(props.config as GoNoGoConfig);
  const trials = $derived(props.trials as GoNoGoTrial[]);
  /** Ein Trial = der ganze Strom, also immer `trials[0]`. */
  const stimuli = $derived(trials[0]?.stimuli ?? []);

  const position = $derived(positionOf(props.phaseName));
  const showStimulus = $derived(props.phaseName?.startsWith('stimulus-') === true);
  const stimulus = $derived(position === null ? null : (stimuli[position] ?? null));

  /** Kontinuierliche Antwort: lokal gesammelt und nach jedem Druck gemeldet. */
  let presses = $state<GoNoGoPress[]>([]);

  function handlePress(atMs: number) {
    const index = position;
    if (index === null) return;
    /*
     * `rtMs` ist die Zeit seit dem Onset von `stimulus-<i>`. Diesen Onset gibt
     * der Runner nicht heraus; `props.elapsed(atMs)` liefert die ms seit Onset
     * der ersten Input-Phase des Trials (= `stimulus-0`). Davon die kumulierte
     * Soll-Zeit der vorangegangenen Positionen abziehen — jede Position dauert
     * genau `isiMs` — und bei 0 klemmen, damit Frame-Jitter keine negativen
     * Reaktionszeiten erzeugt.
     */
    const sinceStreamStart = props.elapsed(atMs);
    const rtMs =
      sinceStreamStart === null ? 0 : Math.max(0, sinceStreamStart - index * config.isiMs);
    // Neues Array, damit Svelte die Änderung sieht.
    presses = [...presses, { index, rtMs }];
    props.update({ presses });
  }
</script>

<div class="gonogo">
  <StimulusStage>
    <div class="signal-slot">
      {#if showStimulus && stimulus}
        <div class="signal" data-kind={stimulus}>
          <span class="disc" aria-hidden="true"></span>
          <span class="word">
            {stimulus === 'go' ? t('game.go-nogo.go') : t('game.go-nogo.nogo')}
          </span>
        </div>
      {/if}
    </div>
  </StimulusStage>

  <PressInput disabled={!props.acceptsInput} onpress={handlePress} />
</div>

<style>
  .gonogo {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    width: 100%;
  }

  .signal-slot {
    /* Feste Abmessungen: die ISI-Phase ist leer, verschiebt aber nichts (§13.4). */
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12rem;
    height: 12rem;
  }

  .signal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }

  /* Farbe UND Text: reine Farbcodierung ist unzulässig (§13.4). */
  .disc {
    width: 7rem;
    height: 7rem;
    border-radius: 50%;
    background: var(--signal-color);
  }

  .word {
    font-family: var(--font-stimulus);
    font-size: var(--text-xl);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--signal-color);
  }

  .signal[data-kind='go'] {
    --signal-color: var(--stim-green);
  }

  .signal[data-kind='nogo'] {
    --signal-color: var(--stim-red);
  }
</style>
