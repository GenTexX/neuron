<script lang="ts">
  import { page } from '$app/state';
  import { api } from '$lib/api/client';
  import type { GameInfo, HistoryEntry } from '$lib/api/types';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import { categoryName, gameName, t } from '$lib/i18n';
  import { session } from '$lib/stores/session.svelte';

  const gameId = $derived(page.params.id ?? '');

  let game = $state<GameInfo | null>(null);
  let history = $state<HistoryEntry[]>([]);
  let loading = $state(true);
  let notFound = $state(false);

  $effect(() => {
    if (session.loading) return;
    const id = gameId;
    loading = true;
    notFound = false;
    api
      .games()
      .then(async (games) => {
        const found = games.find((g) => g.id === id) ?? null;
        game = found;
        notFound = found === null;
        if (found && session.isAuthenticated) {
          const h = await api.history({ game_id: id, limit: 20 });
          history = h.entries;
        }
      })
      .catch(() => (notFound = true))
      .finally(() => (loading = false));
  });

  const scores = $derived(
    history
      .filter((h) => h.valid && h.score !== null)
      .map((h) => h.score as number)
      .reverse(),
  );
  const roundEnds = $derived(game?.ranked_round ? new Date(game.ranked_round.ends_at) : null);
  const dateFormat = new Intl.DateTimeFormat('de', { dateStyle: 'short', timeStyle: 'short' });
</script>

<svelte:head><title>{gameName(gameId)} – {t('app.name')}</title></svelte:head>

{#if loading}
  <p class="muted">{t('common.loading')}</p>
{:else if notFound || !game}
  <p class="muted">{t('game.notFound')}</p>
{:else}
  <header class="head">
    <p class="category">{categoryName(game.category)}</p>
    <h1>{gameName(game.id)}</h1>
    <p class="short">{t(`game.${game.id}.short`)}</p>
  </header>

  <section class="rules">
    <h2>{t('game.rules')}</h2>
    <p>{t(`game.${game.id}.rules`)}</p>
  </section>

  {#if !game.enabled}
    <p class="notice">{t('games.disabled')}</p>
  {:else}
    <section class="modes">
      <article>
        <h2>{t('game.mode.training')}</h2>
        <p class="hint">{t('game.mode.trainingHint')}</p>
        {#if game.level !== undefined}
          <p class="level">{t('games.level')} {game.level} / {game.max_level}</p>
        {/if}
        <a class="primary" href="/play/{game.id}?mode=training">{t('game.startTraining')}</a>
      </article>

      <article>
        <h2>{t('game.mode.ranked')}</h2>
        <p class="hint">{t('game.mode.rankedHint')}</p>
        {#if !game.ranked_round}
          <p class="level">{t('game.noRankedRound')}</p>
        {:else if game.ranked_round.played}
          <p class="level">{t('game.rankedAlreadyPlayed')}</p>
        {:else if roundEnds}
          <p class="level">{t('game.rankedEndsAt')}: {dateFormat.format(roundEnds)}</p>
        {/if}
        {#if game.ranked_round && !game.ranked_round.played}
          <a class="primary" href="/play/{game.id}?mode=ranked">{t('game.startRanked')}</a>
        {/if}
        <a class="secondary" href="/games/{game.id}/leaderboard">{t('game.leaderboard')}</a>
      </article>
    </section>
  {/if}

  {#if session.isAuthenticated}
    <section>
      <h2>{t('game.history')}</h2>
      {#if history.length === 0}
        <p class="muted">{t('profile.historyEmpty')}</p>
      {:else}
        {#if scores.length > 1}
          <Sparkline values={scores} width={280} height={48} />
        {/if}
        <ul class="history">
          {#each history as entry (entry.run_id)}
            <li class:invalid={!entry.valid}>
              <span class="mode">{t(`game.mode.${entry.mode}`)}</span>
              <span class="score">{entry.score ?? t('common.none')}</span>
              <span class="accuracy">
                {entry.correct_count ?? 0}/{entry.trial_count}
              </span>
              <time datetime={entry.submitted_at}>
                {dateFormat.format(new Date(entry.submitted_at))}
              </time>
              {#if !entry.valid}
                <span class="tag">{t('profile.invalidRun')}</span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .head {
    margin-bottom: var(--space-5);
  }

  .category {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .short {
    margin: var(--space-1) 0 0;
    color: var(--color-text-muted);
  }

  h2 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-2);
  }

  section {
    margin-bottom: var(--space-6);
  }

  .rules p {
    margin: 0;
    max-width: 46rem;
  }

  .notice {
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .modes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--space-3);
  }

  .modes article {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .hint,
  .level {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .primary,
  .secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--hit-min);
    margin-top: auto;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    font-weight: 600;
    text-decoration: none;
  }

  .primary {
    background: var(--color-accent);
    color: var(--color-accent-text);
  }

  .secondary {
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .history {
    list-style: none;
    margin: var(--space-3) 0 0;
    padding: 0;
  }

  .history li {
    display: grid;
    grid-template-columns: 5rem 4rem 5rem 1fr auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
    font-size: var(--text-sm);
  }

  .history li.invalid {
    opacity: 0.55;
  }

  .score {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .accuracy,
  time,
  .mode {
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .tag {
    font-size: var(--text-xs);
    color: var(--color-wrong);
  }

  .muted {
    color: var(--color-text-muted);
  }

  @media (width <= 40rem) {
    .history li {
      grid-template-columns: 1fr auto;
      row-gap: var(--space-1);
    }
  }
</style>
