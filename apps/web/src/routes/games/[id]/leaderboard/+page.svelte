<script lang="ts">
  import { page } from '$app/state';
  import { api } from '$lib/api/client';
  import type { LeaderboardResponse } from '$lib/api/types';
  import { gameName, t } from '$lib/i18n';
  import { session } from '$lib/stores/session.svelte';

  const gameId = $derived(page.params.id ?? '');
  const periods = ['daily', 'weekly', 'alltime'] as const;

  let period = $state<(typeof periods)[number]>('daily');
  let board = $state<LeaderboardResponse | null>(null);
  let loading = $state(true);
  let failed = $state(false);

  $effect(() => {
    if (session.loading) return;
    const id = gameId;
    const p = period;
    loading = true;
    failed = false;
    api
      .leaderboard(id, p)
      .then((b) => (board = b))
      .catch(() => (failed = true))
      .finally(() => (loading = false));
  });

  const dateFormat = new Intl.DateTimeFormat('de', { dateStyle: 'short', timeStyle: 'short' });
</script>

<svelte:head><title>{t('leaderboard.title')} – {gameName(gameId)}</title></svelte:head>

<header class="head">
  <a class="back" href="/games/{gameId}">{gameName(gameId)}</a>
  <h1>{t('leaderboard.title')}</h1>
</header>

<div class="periods" role="group" aria-label={t('leaderboard.title')}>
  {#each periods as p (p)}
    <button type="button" class:active={period === p} onclick={() => (period = p)}>
      {t(`leaderboard.period.${p}`)}
    </button>
  {/each}
</div>

{#if loading}
  <p class="muted">{t('common.loading')}</p>
{:else if failed || !board}
  <p class="muted">{t('game.noRankedRound')}</p>
{:else if board.entries.length === 0}
  <p class="muted">{t('leaderboard.empty')}</p>
{:else}
  <table>
    <caption>{t('leaderboard.configNote')}</caption>
    <thead>
      <tr>
        <th scope="col" class="rank">{t('leaderboard.rank')}</th>
        <th scope="col">{t('leaderboard.player')}</th>
        <th scope="col" class="num">{t('leaderboard.score')}</th>
        <th scope="col" class="when">{t('result.title')}</th>
      </tr>
    </thead>
    <tbody>
      {#each board.entries as entry (entry.rank + entry.display_name)}
        <tr class:me={entry.is_me}>
          <td class="rank">{entry.rank}</td>
          <td>{entry.display_name}</td>
          <td class="num">{entry.score}</td>
          <td class="when">
            <time datetime={entry.achieved_at}>
              {dateFormat.format(new Date(entry.achieved_at))}
            </time>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if board.me}
    <p class="me-row">
      {t('leaderboard.yourRank')}: <strong>{board.me.rank}</strong>
      {t('common.of')}
      {board.me.of} · {board.me.score}
      {t('result.score')}
    </p>
  {/if}
{/if}

<style>
  .head {
    margin-bottom: var(--space-4);
  }

  .back {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .periods {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .periods button {
    min-height: 2.5rem;
    padding: 0 var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-muted);
    cursor: pointer;
    touch-action: manipulation;
  }

  .periods button.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-text);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  caption {
    caption-side: bottom;
    padding: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-align: left;
  }

  th,
  td {
    padding: var(--space-2) var(--space-3);
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    font-size: var(--text-sm);
  }

  th {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .rank,
  .num {
    font-variant-numeric: tabular-nums;
  }

  .num {
    text-align: right;
    font-weight: 700;
  }

  .rank {
    width: 4rem;
  }

  tr.me {
    background: var(--color-accent-soft);
    font-weight: 700;
  }

  .me-row {
    margin-top: var(--space-3);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .muted {
    color: var(--color-text-muted);
  }

  @media (width <= 40rem) {
    .when {
      display: none;
    }
  }
</style>
