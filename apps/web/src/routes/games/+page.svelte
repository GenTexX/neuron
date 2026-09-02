<script lang="ts">
  import { api } from '$lib/api/client';
  import type { GameInfo } from '$lib/api/types';
  import GameCard from '$lib/components/GameCard.svelte';
  import { categoryName, t } from '$lib/i18n';
  import { session } from '$lib/stores/session.svelte';
  import { GAME_CATEGORIES } from '@neuron/engine';

  let games = $state<GameInfo[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let filter = $state<string>('all');

  $effect(() => {
    if (session.loading) return;
    api
      .games()
      .then((g) => (games = g))
      .catch(() => (failed = true))
      .finally(() => (loading = false));
  });

  const visible = $derived(filter === 'all' ? games : games.filter((g) => g.category === filter));
</script>

<svelte:head><title>{t('games.title')} – {t('app.name')}</title></svelte:head>

<h1>{t('games.title')}</h1>

<div class="filters" role="group" aria-label={t('games.title')}>
  <button type="button" class:active={filter === 'all'} onclick={() => (filter = 'all')}>
    {t('games.filter.all')}
  </button>
  {#each GAME_CATEGORIES as category (category)}
    <button type="button" class:active={filter === category} onclick={() => (filter = category)}>
      {categoryName(category)}
    </button>
  {/each}
</div>

{#if loading}
  <p class="muted">{t('common.loading')}</p>
{:else if failed}
  <p class="muted">{t('common.error')}</p>
{:else if visible.length === 0}
  <p class="muted">{t('games.empty')}</p>
{:else}
  <div class="grid">
    {#each visible as game (game.id)}
      <GameCard {game} />
    {/each}
  </div>
{/if}

<style>
  h1 {
    margin-bottom: var(--space-4);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }

  .filters button {
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

  .filters button.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-text);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: var(--space-3);
  }

  .muted {
    color: var(--color-text-muted);
  }
</style>
