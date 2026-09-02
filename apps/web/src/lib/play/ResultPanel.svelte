<script lang="ts">
  import type { SubmitResponse } from '$lib/api/types';
  import { gameName, t } from '$lib/i18n';
  import type { AbortReason } from '$lib/runner';

  type Props = {
    result: SubmitResponse;
    gameId: string;
    mode: 'training' | 'ranked';
    abortReason: AbortReason | null;
    onagain: () => void;
  };

  const { result, gameId, mode, abortReason, onagain }: Props = $props();

  const accuracyPercent = $derived(Math.round(result.accuracy * 100));
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
    <div>
      <dt>{t('result.accuracy')}</dt>
      <dd>{accuracyPercent} %</dd>
    </div>
    <div>
      <dt>{t('result.correct')}</dt>
      <dd>{result.correct_count}</dd>
    </div>
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

  <div class="actions">
    {#if mode === 'training'}
      <button class="primary" onclick={onagain}>{t('result.again')}</button>
    {/if}
    <a class="secondary" href="/games/{gameId}">{t('result.toGame')}</a>
    <a class="secondary" href="/games/{gameId}/leaderboard">{t('result.toLeaderboard')}</a>
  </div>
</section>

<style>
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
