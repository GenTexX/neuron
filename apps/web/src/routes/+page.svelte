<script lang="ts">
  import { api } from '$lib/api/client';
  import type { GameInfo, StatsResponse } from '$lib/api/types';
  import { categoryName, gameName, t } from '$lib/i18n';
  import { session } from '$lib/stores/session.svelte';

  let games = $state<GameInfo[]>([]);
  let stats = $state<StatsResponse | null>(null);
  let loading = $state(true);
  let failed = $state(false);

  $effect(() => {
    if (session.loading) return;
    loading = true;
    failed = false;
    const requests: [Promise<GameInfo[]>, Promise<StatsResponse | null>] = [
      api.games(),
      session.isAuthenticated ? api.stats() : Promise.resolve(null),
    ];
    Promise.all(requests)
      .then(([g, s]) => {
        games = g;
        stats = s;
      })
      .catch(() => (failed = true))
      .finally(() => (loading = false));
  });

  const openRanked = $derived(
    games.filter((g) => g.enabled && g.ranked_round && !g.ranked_round.played),
  );
  const percent = (x: number) => Math.round(x * 100);
  const timeFormat = new Intl.DateTimeFormat('de', { dateStyle: 'short', timeStyle: 'short' });
</script>

<svelte:head><title>{t('dashboard.title')} – {t('app.name')}</title></svelte:head>

<h1>{t('dashboard.title')}</h1>

{#if loading}
  <p class="muted">{t('common.loading')}</p>
{:else if failed}
  <p class="muted">{t('common.error')}</p>
{:else if !session.isAuthenticated}
  <section class="hero">
    <p>{t('app.tagline')}</p>
    <div class="cta-row">
      <a class="primary" href="/register">{t('nav.register')}</a>
      <a class="secondary" href="/games">{t('nav.games')}</a>
    </div>
  </section>
{:else}
  <section class="tiles">
    <div class="tile">
      <p class="label">{t('dashboard.streak')}</p>
      <p class="value">{stats?.streak ?? 0}</p>
      <p class="note">{t('dashboard.streakDays')}</p>
    </div>
    <div class="tile">
      <p class="label">{t('dashboard.totalRuns')}</p>
      <p class="value">{stats?.total_runs ?? 0}</p>
    </div>
    <div class="tile wide">
      <p class="label">{t('dashboard.categoryPercentiles')}</p>
      {#if stats && stats.category_percentiles.length > 0}
        <ul class="percentiles">
          {#each stats.category_percentiles as [category, value] (category)}
            <li>
              <span>{categoryName(category)}</span>
              <span class="bar" style:--fill="{percent(value)}%" aria-hidden="true"></span>
              <span class="num">{percent(value)} %</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="note">{t('dashboard.noRuns')}</p>
      {/if}
    </div>
  </section>

  <section>
    <h2>{t('dashboard.todaysRounds')}</h2>
    {#if openRanked.length === 0}
      <p class="muted">{t('dashboard.allPlayed')}</p>
    {:else}
      <ul class="rounds">
        {#each openRanked as game (game.id)}
          <li>
            <a href="/play/{game.id}?mode=ranked">
              <strong>{gameName(game.id)}</strong>
              <span class="muted">{categoryName(game.category)}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h2>{t('dashboard.recent')}</h2>
    {#if !stats || stats.recent.length === 0}
      <p class="muted">{t('dashboard.noRuns')}</p>
    {:else}
      <ul class="recent">
        {#each stats.recent as run (run.submitted_at + run.game_id)}
          <li>
            <a href="/games/{run.game_id}">{gameName(run.game_id)}</a>
            <span class="mode">{t(`game.mode.${run.mode}`)}</span>
            <span class="score">{run.score ?? t('common.none')}</span>
            <time datetime={run.submitted_at}>{timeFormat.format(new Date(run.submitted_at))}</time>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  h1 {
    margin-bottom: var(--space-5);
  }

  h2 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-3);
  }

  section + section {
    margin-top: var(--space-6);
  }

  .muted,
  .note {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    align-items: flex-start;
  }

  .cta-row {
    display: flex;
    gap: var(--space-2);
  }

  .primary,
  .secondary {
    display: inline-flex;
    align-items: center;
    min-height: var(--hit-min);
    padding: 0 var(--space-5);
    border-radius: var(--radius-md);
    font-weight: 600;
    text-decoration: none;
  }

  .primary {
    background: var(--color-accent);
    color: var(--color-accent-text);
  }

  .secondary {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .tile {
    padding: var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .tile.wide {
    grid-column: span 2;
  }

  .label {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .value {
    margin: var(--space-1) 0 0;
    font-size: var(--text-xl);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .percentiles {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .percentiles li {
    display: grid;
    grid-template-columns: 9rem 1fr 3rem;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }

  .bar {
    height: 0.5rem;
    background: var(--color-accent-soft);
    border-radius: 999px;
    position: relative;
    overflow: hidden;
  }

  .bar::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--fill);
    background: var(--color-accent);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .rounds,
  .recent {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .rounds a {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: var(--hit-min);
    padding: var(--space-2) var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--color-text);
  }

  .recent li {
    display: grid;
    grid-template-columns: 1fr auto 4rem auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    font-size: var(--text-sm);
  }

  .recent .score {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .recent time,
  .mode {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  @media (width <= 40rem) {
    .tile.wide {
      grid-column: 1 / -1;
    }

    .percentiles li {
      grid-template-columns: 7rem 1fr 3rem;
    }

    .recent li {
      grid-template-columns: 1fr auto;
      row-gap: var(--space-1);
    }
  }
</style>
