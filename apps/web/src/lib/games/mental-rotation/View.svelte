<script module lang="ts">
  import type { Phase } from '$lib/runner';
  import type { MentalRotationConfig } from '@neuron/games';

  /**
   * Phasenfolge (§12.7): fixation (400 ms) → stimulus (`deadlineMs`, Input)
   * → feedback (300 ms).
   */
  export function phases(config: MentalRotationConfig): Phase[] {
    return [
      { name: 'fixation', durationMs: 400, acceptsInput: false },
      { name: 'stimulus', durationMs: config.deadlineMs, acceptsInput: true },
      { name: 'feedback', durationMs: 300, acceptsInput: false },
    ];
  }

  /** Rand in CSS-Pixeln, damit die Figur bei jeder Drehung im Bild bleibt. */
  const CANVAS_PADDING = 10;
  /** Strichstärke der Zelltrennung in CSS-Pixeln. */
  const CELL_STROKE = 2;
</script>

<script lang="ts">
  import Feedback from '$lib/components/Feedback.svelte';
  import StimulusStage from '$lib/components/StimulusStage.svelte';
  import { t } from '$lib/i18n';
  import { ChoiceInput } from '$lib/input';
  import { theme } from '$lib/stores/theme.svelte';
  import type { GameViewProps } from '$lib/games/registry';
  import type { MentalRotationCell, MentalRotationTrial } from '@neuron/games';

  const props: GameViewProps = $props();

  const trials = $derived(props.trials as MentalRotationTrial[]);

  const showStimulus = $derived(props.phaseName === 'stimulus');
  const showFeedback = $derived(props.phaseName === 'feedback');

  let originalCanvas = $state<HTMLCanvasElement | null>(null);
  let rotatedCanvas = $state<HTMLCanvasElement | null>(null);

  const options = $derived([
    { value: 1, label: t('game.mental-rotation.same') },
    { value: 0, label: t('game.mental-rotation.mirrored') },
  ]);

  /**
   * Zeichnet eine Figur zentriert um ihren Schwerpunkt.
   *
   * `shape === null` leert die Fläche (Fixations- und Feedbackphase) — die
   * Abmessungen bleiben dabei unverändert, es gibt keinen Layout-Shift (§13.4).
   *
   * Der Maßstab hängt nur vom größten Abstand einer Zellecke zum Schwerpunkt
   * ab, nicht vom Winkel. Dadurch sind beide Figuren garantiert identisch groß
   * und bleiben bei jeder Drehung vollständig sichtbar.
   *
   * Zur y-Achse: Canvas zählt y nach unten, das Gitter nach oben. Beide
   * Figuren nutzen dieselbe Konvention, und gefragt ist ausschließlich
   * „reine Drehung oder zusätzliche Spiegelung" — diese Eigenschaft ist gegen
   * ein globales Umklappen der Achse invariant.
   */
  function draw(
    canvas: HTMLCanvasElement | null,
    shape: readonly MentalRotationCell[] | null,
    angleDeg: number,
    mirrored: boolean,
  ) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const cssSize = Math.min(rect.width, rect.height);
    if (cssSize <= 0) return;

    // devicePixelRatio-Skalierung: Backing-Store in Gerätepixeln, gezeichnet
    // wird danach weiterhin in CSS-Pixeln.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssSize, cssSize);
    if (!shape || shape.length === 0) return;

    // Schwerpunkt der Zellmittelpunkte in Gittereinheiten.
    let sumX = 0;
    let sumY = 0;
    for (const [x, y] of shape) {
      sumX += x;
      sumY += y;
    }
    const centerX = sumX / shape.length + 0.5;
    const centerY = sumY / shape.length + 0.5;

    // Größter Abstand einer Zellecke zum Schwerpunkt — bestimmt den Maßstab.
    let radius = 0;
    for (const [x, y] of shape) {
      for (const dx of [0, 1]) {
        for (const dy of [0, 1]) {
          radius = Math.max(radius, Math.hypot(x + dx - centerX, y + dy - centerY));
        }
      }
    }
    const unit = (cssSize / 2 - CANVAS_PADDING) / Math.max(radius, 0.5);

    // Farben ausschließlich aus den Tokens des Dokuments (§13.4).
    const styles = getComputedStyle(canvas);
    const fill = styles.getPropertyValue('--color-accent').trim() || styles.color;
    const stroke = styles.getPropertyValue('--color-surface').trim() || styles.color;

    ctx.save();
    ctx.translate(cssSize / 2, cssSize / 2);
    // Beliebige Winkel (auch 45°) über die Canvas-Transformation, nicht über
    // Gitteroperationen — nur so bleibt die Figur unverzerrt.
    ctx.rotate((angleDeg * Math.PI) / 180);
    if (mirrored) ctx.scale(-1, 1);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = CELL_STROKE;
    for (const [x, y] of shape) {
      const px = (x - centerX) * unit;
      const py = (y - centerY) * unit;
      ctx.fillRect(px, py, unit, unit);
      ctx.strokeRect(px, py, unit, unit);
    }
    ctx.restore();
  }

  $effect(() => {
    // Abhängigkeiten bewusst lesen: neuer Trial, neue Phase, neues Theme.
    const current = trials[props.trialIndex];
    const visible = props.phaseName === 'stimulus' && current !== undefined;
    void theme.resolved;
    draw(originalCanvas, visible ? current.shape : null, 0, false);
    draw(
      rotatedCanvas,
      visible ? current.shape : null,
      current?.angleDeg ?? 0,
      current?.mirrored ?? false,
    );
  });
</script>

<div class="mental-rotation">
  <StimulusStage wide>
    <div class="figures">
      <!--
        Das Canvas selbst trägt keine zugängliche Information; die Benennung
        steht als Bildunterschrift daneben und bleibt visuell verborgen.
      -->
      <figure class="figure-cell">
        <canvas bind:this={originalCanvas} class="figure" aria-hidden="true"></canvas>
        <figcaption class="visually-hidden">{t('game.mental-rotation.original')}</figcaption>
      </figure>
      <figure class="figure-cell">
        <canvas bind:this={rotatedCanvas} class="figure" aria-hidden="true"></canvas>
        <figcaption class="visually-hidden">{t('game.mental-rotation.rotated')}</figcaption>
      </figure>
    </div>

    <!-- Fester Platz für Fixationskreuz und Rückmeldung: keine Verschiebung. -->
    <div class="marker-slot">
      {#if showFeedback}
        <Feedback
          state={props.lastCorrect === null ? 'none' : props.lastCorrect ? 'correct' : 'wrong'}
        />
      {:else if !showStimulus}
        <span class="fixation" aria-hidden="true">+</span>
      {/if}
    </div>
  </StimulusStage>

  <ChoiceInput
    {options}
    disabled={!props.acceptsInput}
    onchoose={(value, atMs) => props.respond({ same: value === 1 }, atMs)}
  />
</div>

<style>
  .mental-rotation {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    width: 100%;
  }

  .figures {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-5);
  }

  .figure-cell {
    margin: 0;
  }

  .figure {
    /* Feste, für beide Figuren identische Abmessungen (§12.7, §13.4). */
    width: min(10rem, 36vw);
    height: min(10rem, 36vw);
    display: block;
  }

  .marker-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 3rem;
  }

  .fixation {
    font-size: var(--text-2xl);
    color: var(--color-text-muted);
  }
</style>
