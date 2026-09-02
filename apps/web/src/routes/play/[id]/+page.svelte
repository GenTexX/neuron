<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Countdown from '$lib/components/Countdown.svelte';
  import { t } from '$lib/i18n';
  import { PlaySession } from '$lib/play/session.svelte';
  import ResultPanel from '$lib/play/ResultPanel.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { gameName } from '$lib/i18n';

  const gameId = $derived(page.params.id ?? '');
  const mode = $derived(page.url.searchParams.get('mode') === 'ranked' ? 'ranked' : 'training');

  let play = $state<PlaySession | null>(null);

  $effect(() => {
    if (session.loading) return;
    if (!session.isAuthenticated) {
      void goto(`/login?next=${encodeURIComponent(page.url.pathname + page.url.search)}`);
      return;
    }
    const s = new PlaySession(gameId, mode);
    play = s;
    void s.prepare();
    return () => s.destroy();
  });

  // Ein Navigationswechsel bricht den Run ab (§13.3).
  function confirmAbort() {
    if (confirm(t('play.abortConfirm'))) play?.abort();
  }

  const runner = $derived(play?.runner ?? null);
  const total = $derived(play?.trials.length ?? 0);
</script>

<svelte:head><title>{gameName(gameId)} – {t('app.name')}</title></svelte:head>

<!-- §13.1: eigene, aufgeräumte Vollbild-Ansicht ohne Navigation. -->
<div class="play">
  {#if !play || play.phase === 'loading'}
    <p class="status">{t('play.loading')}</p>
  {:else if play.phase === 'error'}
    <div class="status error">
      <p>
        {play.error === 'ranked_already_played' ? t('game.rankedAlreadyPlayed') : t('common.error')}
      </p>
      <a href="/games/{gameId}">{t('common.back')}</a>
    </div>
  {:else if play.phase === 'intro'}
    <section class="intro">
      <h1>{gameName(gameId)}</h1>
      <p class="rules">{t(`game.${gameId}.rules`)}</p>
      <dl class="meta">
        {#if play.run?.level}
          <div>
            <dt>{t('play.intro.level')}</dt>
            <dd>{play.run.level}</dd>
          </div>
        {/if}
        <div>
          <dt>{t('play.intro.trials')}</dt>
          <dd>{play.run?.trial_count}</dd>
        </div>
        <div>
          <dt>{t('game.mode.training')}</dt>
          <dd>{mode === 'ranked' ? t('game.mode.ranked') : t('game.mode.training')}</dd>
        </div>
      </dl>
      <button class="primary" onclick={() => play?.begin()}>{t('play.intro.start')}</button>
      <a class="back" href="/games/{gameId}">{t('common.back')}</a>
    </section>
  {:else if play.phase === 'countdown'}
    <Countdown oncomplete={() => play?.startAfterCountdown()} />
  {:else if play.phase === 'running' && runner && play.view}
    <div class="hud">
      <span class="progress">
        {t('play.progress', { current: Math.min(runner.trialIndex + 1, total), total })}
      </span>
      <button class="ghost" onclick={confirmAbort}>{t('play.abort')}</button>
    </div>
    <play.view.default
      trialIndex={runner.trialIndex}
      phaseName={runner.phaseName}
      acceptsInput={runner.acceptsInput}
      trials={play.trials}
      config={play.run?.config}
      respond={(response, atMs) => runner.submitResponse(response, atMs)}
      update={(response) => runner.updateResponse(response)}
      complete={() => runner.completeTrial()}
      elapsed={(atMs) => runner.elapsedSinceInputOnset(atMs)}
      lastCorrect={play.lastCorrect}
    />
  {:else if play.phase === 'submitting'}
    <p class="status">{t('play.submitting')}</p>
  {:else if play.phase === 'result' && play.result}
    <ResultPanel
      result={play.result}
      {gameId}
      {mode}
      abortReason={play.abortReason}
      onagain={() => {
        const s = new PlaySession(gameId, mode);
        play?.destroy();
        play = s;
        void s.prepare();
      }}
    />
  {/if}
</div>

<style>
  .play {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    min-height: 100dvh;
    padding: var(--space-4);
    /* §13.4: neutraler, konstanter Hintergrund während eines Runs. */
    background: var(--color-bg);
  }

  .status {
    color: var(--color-text-muted);
  }

  .status.error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    color: var(--color-text);
  }

  .intro {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    max-width: 34rem;
    text-align: center;
  }

  .rules {
    margin: 0;
    color: var(--color-text-muted);
  }

  .meta {
    display: flex;
    gap: var(--space-5);
    margin: 0;
  }

  .meta div {
    text-align: center;
  }

  .meta dt {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .meta dd {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .primary {
    min-height: var(--hit-min);
    padding: 0 var(--space-6);
    background: var(--color-accent);
    color: var(--color-accent-text);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-lg);
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }

  .back {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .hud {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: min(100%, 44rem);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .ghost {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    color: var(--color-text-muted);
    cursor: pointer;
    touch-action: manipulation;
  }
</style>
