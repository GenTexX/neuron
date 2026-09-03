<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiRequestError } from '$lib/api/client';
  import { t } from '$lib/i18n';
  import { session } from '$lib/stores/session.svelte';

  let email = $state('');
  let password = $state('');
  let displayName = $state('');
  let error = $state<string | null>(null);
  let fieldErrors = $state<Record<string, string>>({});
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = null;
    fieldErrors = {};
    try {
      const s = await api.register({
        email: email.trim(),
        password,
        display_name: displayName.trim(),
        // Zeitzone des Browsers als Vorgabe; bestimmt den Streak-Tag (§10.4).
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      session.set(s.user, s.access_token, s.expires_in);
      await goto('/');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'email_taken') error = t('auth.error.emailTaken');
        else if (err.code === 'display_name_taken') error = t('auth.error.displayNameTaken');
        else if (err.fields) {
          fieldErrors = Object.fromEntries(err.fields.map((f) => [f.field, f.message]));
        } else error = t('common.error');
      } else {
        error = t('common.error');
      }
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('auth.register.title')} – {t('app.name')}</title></svelte:head>

<form onsubmit={submit}>
  <h1>{t('auth.register.title')}</h1>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <label>
    <span>{t('auth.email')}</span>
    <input type="email" bind:value={email} autocomplete="email" required />
    {#if fieldErrors.email}<small class="field-error">{fieldErrors.email}</small>{/if}
  </label>

  <label>
    <span>{t('auth.password')}</span>
    <input
      type="password"
      bind:value={password}
      autocomplete="new-password"
      minlength="10"
      required
    />
    <small>{t('auth.register.passwordHint')}</small>
    {#if fieldErrors.password}<small class="field-error">{fieldErrors.password}</small>{/if}
  </label>

  <label>
    <span>{t('auth.displayName')}</span>
    <input
      type="text"
      bind:value={displayName}
      autocomplete="nickname"
      minlength="2"
      maxlength="32"
      required
    />
    <small>{t('auth.register.displayNameHint')}</small>
    {#if fieldErrors.display_name}<small class="field-error">{fieldErrors.display_name}</small>{/if}
  </label>

  <button type="submit" disabled={busy}>{t('auth.register.submit')}</button>

  <p class="alt">
    {t('auth.register.hasAccount')}
    <a href="/login">{t('nav.login')}</a>
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

  small {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .field-error {
    color: var(--color-wrong);
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

  .alt a {
    display: inline-block;
    padding: var(--space-2) 0;
  }
</style>
