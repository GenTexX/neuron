<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, ApiRequestError } from '$lib/api/client';
  import { t } from '$lib/i18n';
  import { session } from '$lib/stores/session.svelte';

  let email = $state('');
  let password = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);

  const next = $derived(page.url.searchParams.get('next') ?? '/');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = null;
    try {
      const s = await api.login({ email: email.trim(), password });
      session.set(s.user, s.access_token, s.expires_in);
      await goto(next);
    } catch (err) {
      error =
        err instanceof ApiRequestError && err.status === 401
          ? t('auth.error.unauthorized')
          : t('common.error');
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('auth.login.title')} – {t('app.name')}</title></svelte:head>

<form onsubmit={submit}>
  <h1>{t('auth.login.title')}</h1>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <label>
    <span>{t('auth.email')}</span>
    <input type="email" bind:value={email} autocomplete="email" required />
  </label>

  <label>
    <span>{t('auth.password')}</span>
    <input type="password" bind:value={password} autocomplete="current-password" required />
  </label>

  <button type="submit" disabled={busy}>{t('auth.login.submit')}</button>

  <p class="alt">
    {t('auth.login.noAccount')}
    <a href="/register">{t('nav.register')}</a>
  </p>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 24rem;
    margin: 0 auto;
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

  input {
    min-height: var(--hit-min);
    padding: 0 var(--space-3);
    background: var(--color-surface);
    color: var(--color-text);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    font: inherit;
  }

  button {
    min-height: var(--hit-min);
    background: var(--color-accent);
    color: var(--color-accent-text);
    border: none;
    border-radius: var(--radius-md);
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .error {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border-left: 4px solid var(--color-wrong);
    border-radius: var(--radius-sm);
    color: var(--color-wrong);
  }

  .alt {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
</style>
