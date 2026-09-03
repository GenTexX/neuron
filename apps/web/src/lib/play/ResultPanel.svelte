<script lang="ts">
  import type { SubmitResponse } from '$lib/api/types';
  import { gameName, t } from '$lib/i18n';
  import type { AbortReason } from '$lib/runner';
  import { SUCCESS_THRESHOLD, type Judgement } from '@neuron/engine';

  type Props = {
    result: SubmitResponse;
    gameId: string;
    mode: 'training' | 'ranked';
    abortReason: AbortReason | null;
    /** Aufgaben in diesem Run. Bei genau einer sagt eine Prozentzahl nichts. */
    trialCount: number;
    /** Bewertung des einzigen Trials, sonst null. */
    soloJudgement: Judgement | null;
    onagain: () => void;
  };

  const { result, gameId, mode, abortReason, trialCount, soloJudgement, onagain }: Props = $props();

  const accuracyPercent = $derived(Math.round(result.accuracy * 100));

  /**
   * Besteht ein Run aus einer einzigen Aufgabe (schulte, lights-out), ist die
   * Genauigkeit `correctCount / trialCount` immer 0 % oder 100 %. Bei Schulte
   * stand deshalb auch nach mehreren Fehltipps „100 %“ – richtig gerechnet,
   * aber nichtssagend. Statt der Quote steht dort, was den Run unterscheidet.
   */
  const singleTask = $derived(trialCount === 1);

  const num = (key: string): number | null => {
    const value = soloJudgement?.[key];
    return typeof value === 'number' ? value : null;
  };

  const details = $derived.by((): { label: string; value: string }[] => {
    if (!singleTask || !soloJudgement) return [];
    const out: { label: string; value: string }[] = [];
    const wrongTaps = num('wrongTaps');
    if (wrongTaps !== null) out.push({ label: t('result.wrongTaps'), value: String(wrongTaps) });
    const moves = num('moveCount');
    const optimal = num('optimalMoves');
    if (moves !== null) {
      out.push({
        label: t('game.lights-out.moves'),
        value: optimal === null ? String(moves) : t('result.movesUsed', { moves, optimal }),
      });
    }
    return out;
  });

  /**
   * §7.4: drei Runs in Folge über 80 % heben das Level, einer darunter senkt
   * es. Ohne diese Zeile blieb die Regel für den Nutzer unsichtbar – nach
   * einem Run stand nur „Level 1“, ohne zu verraten, wie weit es noch ist.
   */
  const levelProgress = $derived.by((): string | null => {
    const level = result.level;
    if (!level || !result.valid || mode !== 'training') return null;
    if (level.after >= level.max_level) return t('result.levelMax');
    const missing = Math.max(1, level.ups_required - level.consecutive_up);
    const next = t(missing === 1 ? 'result.levelProgressOne' : 'result.levelProgress', {
      runs: missing,
      level: level.after + 1,
    });
    // Lag der Run unter der Schwelle, ist der zurückgesetzte Zähler die
    // wichtigere Auskunft als die reine Restzahl – sonst wirkt es, als sei
    // nichts passiert.
    return result.accuracy < SUCCESS_THRESHOLD ? `${t('result.levelProgressReset')} ${next}` : next;
  });

  const percentilePercent = $derived(
    result.percentile === undefined || result.percentile === null
      ? null
      : Math.round(result.percentile * 100),
  );

  /** §6.2: der clientseitige Grund ist konkreter als der Servergrund. */
  const abortText = $derived(
    abortReason === null
      ? null
      : abortReason === 'visibility'
        ? t('play.invalid.visibility')
        : abortReason === 'blur'
          ? t('play.invalid.blur')
          : abortReason === 'frameGap'
            ? t('play.invalid.frameGap')
            : abortReason === 'durationDrift'
              ? t('play.invalid.durationDrift')
              : t('play.invalid.aborted'),
  );

  const levelText = $derived(
    !result.level
      ? null
      : result.level.changed && result.level.after > result.level.before
        ? t('result.levelUp', { level: result.level.after })
        : result.level.changed
          ? t('result.levelDown', { level: result.level.after })
          : t('result.levelSame', { level: result.level.after }),
  );
</script>

<section class="result" data-testid="result">
  <h1>{gameName(gameId)}</h1>
  <p class="eyebrow">{t('result.title')}</p>

  {#if !result.valid}
    <div class="invalid" role="alert">
      <strong>{t('play.invalid.title')}</strong>
      <p>
        {abortText ??
          (result.invalid_reason
            ? t(`result.invalidReason.${result.invalid_reason}`)
            : t('common.error'))}
      </p>
      <p class="hint">{t('play.invalid.hint')}</p>
    </div>
  {/if}

  <p class="score" class:muted={!result.valid}>
    <span class="value">{result.score}</span>
    <span class="unit">{t('result.score')}</span>
  </p>

  {#if result.personal_best && result.valid}
    <p class="best">
      {t('result.personalBest')}
      {#if result.previous_best !== null}
        <span class="previous">{t('result.previousBest')}: {result.previous_best}</span>
      {/if}
    </p>
  {/if}

  <dl class="facts">
    {#if singleTask}
      <div>
        <dt>{t('result.completed')}</dt>
        <dd>{result.correct_count > 0 ? t('result.completedYes') : t('result.completedNo')}</dd>
      </div>
      {#each details as detail (detail.label)}
        <div>
          <dt>{detail.label}</dt>
          <dd>{detail.value}</dd>
        </div>
      {/each}
    {:else}
      <div>
        <dt>{t('result.accuracy')}</dt>
        <dd>{accuracyPercent} %</dd>
      </div>
      <div>
        <dt>{t('result.correct')}</dt>
        <dd>{result.correct_count}</dd>
      </div>
    {/if}
    {#if levelText}
      <div>
        <dt>{t('play.intro.level')}</dt>
        <dd>{levelText}</dd>
      </div>
    {/if}
    {#if result.rank}
      <div>
        <dt>{t('leaderboard.rank')}</dt>
        <dd>{t('result.rank', { rank: result.rank.daily, total: result.rank.of })}</dd>
      </div>
    {/if}
    {#if percentilePercent !== null}
      <div>
        <dt>{t('dashboard.categoryPercentiles')}</dt>
        <dd>{t('result.percentile', { percent: percentilePercent })}</dd>
      </div>
    {/if}
    <div>
      <dt>{t('dashboard.streak')}</dt>
      <dd>{t('result.streak', { days: result.streak.current })}</dd>
    </div>
  </dl>

  {#if levelProgress}
    <p class="level-progress">{levelProgress}</p>
  {/if}

  <div class="actions">
    {#if mode === 'training'}
      <button class="primary" onclick={onagain}>{t('result.again')}</button>
    {/if}
    <a class="secondary" href="/games/{gameId}">{t('result.toGame')}</a>
    <a class="secondary" href="/games/{gameId}/leaderboard">{t('result.toLeaderboard')}</a>
  </div>
</section>

<style>
  .level-progress {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .eyebrow {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    order: -1;
  }

  .result {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    width: min(100%, 34rem);
    text-align: center;
  }

  .invalid {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface);
    border: 2px solid var(--color-wrong);
    border-radius: var(--radius-md);
  }

  .invalid p {
    margin: var(--space-1) 0 0;
  }

  .hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .score {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
  }

  .score.muted {
    opacity: 0.5;
  }

  .value {
    font-size: var(--text-2xl);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .unit {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .best {
    margin: 0;
    color: var(--color-correct);
    font-weight: 700;
  }

  .previous {
    display: block;
    font-weight: 400;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: var(--space-3);
    width: 100%;
    margin: 0;
    padding: var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .facts dt {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .facts dd {
    margin: 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
  }

  .primary,
  .secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--hit-min);
    padding: 0 var(--space-5);
    border-radius: var(--radius-md);
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    touch-action: manipulation;
  }

  .primary {
    background: var(--color-accent);
    color: var(--color-accent-text);
    border: none;
  }

  .secondary {
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }
</style>
