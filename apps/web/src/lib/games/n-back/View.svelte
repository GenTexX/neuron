<script module lang="ts">
  import type { Phase } from '$lib/runner';
  import type { NBackConfig, NBackTrial } from '@neuron/games';

  /**
   * Phasenfolge (§12.2): ein Trial ist der ganze Symbolstrom, deshalb gibt es
   * je Stromposition zwei Phasen — `symbol-<i>` (60 % des ISI) und `gap-<i>`
   * (der Rest). Beide nehmen Eingaben an: ein Druck in der Lücke gehört noch
   * zum zuletzt gezeigten Symbol. Das Timing macht der Runner (§6.1 Regel 2).
   */
  export function phases(config: NBackConfig, trials: NBackTrial[]): Phase[] {
    const length = trials[0]?.symbols.length ?? config.length;
    const symbolMs = Math.round(config.isiMs * 0.6);
    const gapMs = Math.max(0, config.isiMs - symbolMs);
    const list: Phase[] = [];
    for (let i = 0; i < length; i++) {
      list.push({ name: `symbol-${i}`, durationMs: symbolMs, acceptsInput: true });
      list.push({ name: `gap-${i}`, durationMs: gapMs, acceptsInput: true });
    }
    return list;
  }

  /** Stromposition aus dem Phasennamen (`symbol-7` → 7); null außerhalb. */
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
  import type { NBackPress } from '@neuron/games';

  const props: GameViewProps = $props();

  const config = $derived(props.config as NBackConfig);
  const trials = $derived(props.trials as NBackTrial[]);
  /** Ein Trial = der ganze Strom, also immer `trials[0]`. */
  const symbols = $derived(trials[0]?.symbols ?? []);

  const position = $derived(positionOf(props.phaseName));
  const showSymbol = $derived(props.phaseName?.startsWith('symbol-') === true);
  const symbol = $derived(position === null ? null : (symbols[position] ?? null));
  /** Symbole sind Indizes ins Alphabet; dargestellt als Großbuchstaben. */
  const letter = $derived(symbol === null ? '' : String.fromCharCode(65 + symbol));

  /** Kontinuierliche Antwort: lokal gesammelt und nach jedem Druck gemeldet. */
  let presses = $state<NBackPress[]>([]);

  function handlePress(atMs: number) {
    const index = position;
    if (index === null) return;
    /*
     * `rtMs` ist die Zeit seit dem Onset von `symbol-<i>`. Diesen Onset gibt der
     * Runner nicht heraus; `props.elapsed(atMs)` liefert die ms seit Onset der
     * ersten Input-Phase des Trials (= `symbol-0`). Davon die kumulierte
     * Soll-Zeit der vorangegangenen Positionen abziehen — jede Position dauert
     * genau `isiMs` — und bei 0 klemmen, damit Frame-Jitter keine negativen
     * Reaktionszeiten erzeugt. Mehrfachdrücke auf dieselbe Position sind
     * erlaubt; die Spiellogik zählt sie als einen (§12.2).
     */
    const sinceStreamStart = props.elapsed(atMs);
    const rtMs =
      sinceStreamStart === null ? 0 : Math.max(0, sinceStreamStart - index * config.isiMs);
    // Neues Array, damit Svelte die Änderung sieht.
    presses = [...presses, { index, rtMs }];
    props.update({ presses });
  }
</script>

<div class="nback">
  <StimulusStage>
    <p class="level" aria-live="polite">{t('game.n-back.level', { n: config.n })}</p>
    <div class="symbol-slot">
      {#if showSymbol && letter}
        <span class="symbol">{letter}</span>
      {/if}
    </div>
  </StimulusStage>

  <PressInput disabled={!props.acceptsInput} onpress={handlePress} label={t('game.n-back.match')} />
</div>

<style>
  .nback {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    width: 100%;
  }

  .level {
    /* Feste Höhe wie die Regelzeile bei stroop (§13.4). */
    min-height: 1.5rem;
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .symbol-slot {
    /* Feste Abmessungen: die Lücke ist leer, verschiebt aber nichts (§13.4). */
    display: flex;
    align-items: center;
    justify-content: center;
    height: 8rem;
  }

  .symbol {
    font-family: var(--font-stimulus);
    font-size: var(--text-stimulus);
    font-weight: 700;
    letter-spacing: 0.02em;
  }
</style>
