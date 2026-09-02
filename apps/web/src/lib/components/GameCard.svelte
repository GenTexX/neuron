<script lang="ts">
  import type { GameInfo } from '$lib/api/types';
  import { categoryName, gameName, t } from '$lib/i18n';

  const { game }: { game: GameInfo } = $props();
</script>

<article class="card" class:disabled={!game.enabled}>
  <a class="title" href="/games/{game.id}">
    <h3>{gameName(game.id)}</h3>
    <p class="short">{t(`game.${game.id}.short`)}</p>
  </a>
  <p class="category">{categoryName(game.category)}</p>
  <dl class="stats">
    {#if game.level !== undefined}
      <div>
        <dt>{t('games.level')}</dt>
        <dd>{game.level}</dd>
      </div>
    {/if}
    {#if game.runs_played !== undefined}
      <div>
        <dt>{t('games.runsPlayed')}</dt>
        <dd>{game.runs_played}</dd>
      </div>
    {/if}
    {#if game.personal_best}
      <div>
        <dt>{t('games.personalBest')}</dt>
        <dd>{game.personal_best.score}</dd>
      </div>
    {/if}
  </dl>
  {#if !game.enabled}
    <p class="badge muted">{t('games.disabled')}</p>
  {:else if game.ranked_round}
    <p class="badge" class:done={game.ranked_round.played}>
      {game.ranked_round.played ? t('games.rankedPlayed') : t('games.rankedOpen')}
    </p>
  {/if}
</article>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
  }

  .card.disabled {
    opacity: 0.55;
  }

  .title {
    color: inherit;
    text-decoration: none;
  }

  .title:hover h3 {
    color: var(--color-accent);
  }

  h3 {
    font-size: var(--text-lg);
  }

  .short {
    margin: var(--space-1) 0 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .category {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .stats {
    display: flex;
    gap: var(--space-4);
    margin: auto 0 0;
  }

  .stats dt {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .stats dd {
    margin: 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .badge {
    align-self: flex-start;
    margin: 0;
    padding: var(--space-1) var(--space-2);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .badge.done,
  .badge.muted {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
  }
</style>
