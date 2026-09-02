<script lang="ts">
  import { api } from '$lib/api/client';
  import type { HistoryEntry, StatsResponse } from '$lib/api/types';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import { categoryName, gameName, t } from '$lib/i18n';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { theme, type ThemeChoice } from '$lib/stores/theme.svelte';

  let stats = $state<StatsResponse | null>(null);
  let history = $state<HistoryEntry[]>([]);
  let nextBefore = $state<string | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let saved = $state(false);

  let displayName = $state('');
  let timezone = $state('');

  $effect(() => {
    if (session.loading || !session.isAuthenticated) return;
    displayName = session.user?.display_name ?? '';
    timezone = session.user?.timezone ?? '';
    Promise.all([api.stats(), api.history({ limit: 25 })])
      .then(([s, h]) => {
        stats = s;
        history = h.entries;
        nextBefore = h.next_before;
      })
      .finally(() => (loading = false));
  });

  async function saveProfile(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    saved = false;
    try {
      const user = await api.updateMe({ display_name: displayName.trim(), timezone });
      session.updateUser(user);
      saved = true;
    } finally {
      saving = false;
    }
  }

  async function loadMore() {
    if (!nextBefore) return;
    const h = await api.history({ limit: 25, before: nextBefore });
    history = [...history, ...h.entries];
    nextBefore = h.next_before;
  }

  const themeChoices: ThemeChoice[] = ['system', 'light', 'dark'];
  const zones =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const dateFormat = new Intl.DateTimeFormat('de', { dateStyle: 'short', timeStyle: 'short' });
  const percent = (x: number | null) => (x === null ? null : Math.round(x * 100));
</script>

<svelte:head><title>{t('profile.title')} – {t('app.name')}</title></svelte:head>

<h1>{t('profile.title')}</h1>

{#if session.loading || loading}
  <p class="muted">{t('common.loading')}</p>
{:else if !session.isAuthenticated}
  <p class="muted"><a href="/login">{t('nav.login')}</a></p>
{:else}
  <section>
    <h2>{t('profile.stats')}</h2>
    <div class="tiles">
      <div class="tile">
        <p class="label">{t('dashboard.streak')}</p>
        <p class="value">{stats?.streak ?? 0}</p>
      </div>
      <div class="tile">
        <p class="label">{t('dashboard.totalRuns')}</p>
        <p class="value">{stats?.total_runs ?? 0}</p>
      </div>
    </div>

    <ul class="games">
      {#each stats?.games ?? [] as g (g.game_id)}
        <li>
          <a href="/games/{g.game_id}">{gameName(g.game_id)}</a>
          <span class="cat">{categoryName(g.category)}</span>
          <span class="lvl">{t('games.level')} {g.level}/{g.max_level}</span>
          <span class="pb">{g.personal_best ?? t('common.none')}</span>
          <span class="pct">
            {percent(g.percentile) === null ? t('common.none') : `${percent(g.percentile)} %`}
          </span>
          <Sparkline values={g.recent_scores.map((s) => s.score)} />
        </li>
      {/each}
    </ul>
  </section>

  <section>
    <h2>{t('profile.settings')}</h2>
    <form onsubmit={saveProfile}>
      <label>
        <span>{t('auth.displayName')}</span>
        <input type="text" bind:value={displayName} minlength="2" maxlength="32" required />
      </label>

      <label>
        <span>{t('profile.timezone')}</span>
        {#if zones.length > 0}
          <select bind:value={timezone}>
            {#each zones as zone (zone)}
              <option value={zone}>{zone}</option>
            {/each}
          </select>
        {:else}
          <input type="text" bind:value={timezone} />
        {/if}
        <small>{t('profile.timezoneHint')}</small>
      </label>

      <button type="submit" disabled={saving}>{t('common.save')}</button>
      {#if saved}<p class="ok" role="status">{t('common.saved')}</p>{/if}
    </form>

    <fieldset>
      <legend>{t('theme.label')}</legend>
      <div class="switches">
        {#each themeChoices as choice (choice)}
          <button
            type="button"
            class:active={theme.choice === choice}
            onclick={() => theme.set(choice)}
          >
            {t(`theme.${choice}`)}
          </button>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>{t('profile.settings')}</legend>
      <label class="toggle">
        <input
          type="checkbox"
          checked={settings.reducedMotion}
          onchange={(e) => settings.update({ reducedMotion: e.currentTarget.checked })}
        />
        <span>{t('profile.reducedMotion')}</span>
      </label>
      <label class="toggle">
        <input
          type="checkbox"
          checked={settings.sound}
          onchange={(e) => settings.update({ sound: e.currentTarget.checked })}
        />
        <span>{t('profile.sound')}</span>
      </label>
      <label class="toggle">
        <input
          type="checkbox"
          checked={settings.haptics}
          onchange={(e) => settings.update({ haptics: e.currentTarget.checked })}
        />
        <span>{t('profile.haptics')}</span>
      </label>
    </fieldset>
  </section>

  <section>
    <h2>{t('profile.history')}</h2>
    {#if history.length === 0}
      <p class="muted">{t('profile.historyEmpty')}</p>
    {:else}
      <ul class="history">
        {#each history as entry (entry.run_id)}
          <li class:invalid={!entry.valid}>
            <a href="/games/{entry.game_id}">{gameName(entry.game_id)}</a>
            <span class="mode">{t(`game.mode.${entry.mode}`)}</span>
            <span class="score">{entry.score ?? t('common.none')}</span>
            <span class="acc">{entry.correct_count ?? 0}/{entry.trial_count}</span>
            <time datetime={entry.submitted_at}>
              {dateFormat.format(new Date(entry.submitted_at))}
            </time>
            {#if !entry.valid}<span class="tag">{t('profile.invalidRun')}</span>{/if}
          </li>
        {/each}
      </ul>
      {#if nextBefore}
        <button type="button" class="more" onclick={loadMore}>{t('profile.loadMore')}</button>
      {/if}
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

  .tiles {
    display: flex;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .tile {
    flex: 1;
    max-width: 12rem;
    padding: var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
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

  .games,
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .games li {
    display: grid;
    grid-template-columns: 10rem 8rem 6rem 4rem 4rem auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
    font-size: var(--text-sm);
  }

  .history li {
    display: grid;
    grid-template-columns: 10rem 5rem 4rem 4rem 1fr auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
    font-size: var(--text-sm);
  }

  .history li.invalid {
    opacity: 0.55;
  }

  .cat,
  .lvl,
  .acc,
  .mode,
  time,
  .pct {
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .pb,
  .score {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .tag {
    font-size: var(--text-xs);
    color: var(--color-wrong);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 24rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  label span {
    font-size: var(--text-sm);
    font-weight: 600;
  }

  input[type='text'],
  select {
    min-height: var(--hit-min);
    padding: 0 var(--space-3);
    background: var(--color-surface);
    color: var(--color-text);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    font: inherit;
  }

  small {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  button[type='submit'],
  .more {
    min-height: var(--hit-min);
    padding: 0 var(--space-5);
    background: var(--color-accent);
    color: var(--color-accent-text);
    border: none;
    border-radius: var(--radius-md);
    font-weight: 700;
    cursor: pointer;
    align-self: flex-start;
    touch-action: manipulation;
  }

  .more {
    margin-top: var(--space-3);
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }

  .ok {
    margin: 0;
    color: var(--color-correct);
    font-size: var(--text-sm);
  }

  fieldset {
    margin: var(--space-4) 0 0;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    max-width: 24rem;
  }

  legend {
    font-size: var(--text-sm);
    font-weight: 600;
    padding: 0 var(--space-1);
  }

  .switches {
    display: flex;
    gap: var(--space-2);
  }

  .switches button {
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

  .switches button.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-text);
  }

  .toggle {
    flex-direction: row;
    align-items: center;
    gap: var(--space-2);
    min-height: 2.5rem;
  }

  .toggle input {
    width: 1.25rem;
    height: 1.25rem;
  }

  .muted {
    color: var(--color-text-muted);
  }

  @media (width <= 40rem) {
    .games li,
    .history li {
      grid-template-columns: 1fr auto;
      row-gap: var(--space-1);
    }
  }
</style>
