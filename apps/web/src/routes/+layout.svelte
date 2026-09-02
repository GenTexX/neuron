<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, refreshSession } from '$lib/api/client';
  import { t } from '$lib/i18n';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { theme } from '$lib/stores/theme.svelte';
  import '$lib/tokens.css';
  import type { Snippet } from 'svelte';

  const { children }: { children: Snippet } = $props();

  let online = $state(true);

  $effect(() => {
    const cleanup = theme.init();
    settings.init();
    // Sitzung nach einem Reload über das Refresh-Cookie wiederherstellen (§8).
    void refreshSession().finally(() => (session.loading = false));

    // Service Worker nur in Produktion registrieren (§13.6).
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/service-worker.js', { type: 'module' });
    }

    online = navigator.onLine;
    const on = () => (online = true);
    const off = () => (online = false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      cleanup?.();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  });

  // §13.1: /play/[id] ist eine eigene Vollbild-Ansicht ohne Navigation.
  const fullscreen = $derived(page.url.pathname.startsWith('/play/'));

  async function logout() {
    await api.logout().catch(() => undefined);
    // Das Access-Token lebt nur im Speicher (§8); `clear()` verwirft es, das
    // Refresh-Cookie hat der Server gelöscht. Ein harter Reload ist unnötig.
    session.clear();
    await goto('/', { invalidateAll: true });
  }
</script>

{#if fullscreen}
  {@render children()}
{:else}
  <a class="skip" href="#main">{t('nav.skipToContent')}</a>
  <header>
    <nav aria-label={t('app.name')}>
      <a class="brand" href="/">{t('app.name')}</a>
      <ul>
        <li>
          <a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}
            >{t('nav.dashboard')}</a
          >
        </li>
        <li>
          <a
            href="/games"
            aria-current={page.url.pathname.startsWith('/games') ? 'page' : undefined}
          >
            {t('nav.games')}
          </a>
        </li>
        {#if session.isAuthenticated}
          <li>
            <a href="/me" aria-current={page.url.pathname === '/me' ? 'page' : undefined}
              >{t('nav.profile')}</a
            >
          </li>
          <li><button type="button" class="link" onclick={logout}>{t('nav.logout')}</button></li>
        {:else if !session.loading}
          <li><a href="/login">{t('nav.login')}</a></li>
          <li><a class="cta" href="/register">{t('nav.register')}</a></li>
        {/if}
      </ul>
    </nav>
  </header>

  {#if !online}
    <p class="offline" role="status">
      <strong>{t('offline.title')}</strong>
      {t('offline.message')}
    </p>
  {/if}

  <main id="main">
    {@render children()}
  </main>
{/if}

<style>
  .skip {
    position: absolute;
    left: -9999px;
  }

  .skip:focus {
    left: var(--space-4);
    top: var(--space-4);
    z-index: 10;
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border-radius: var(--radius-sm);
  }

  header {
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    max-width: var(--content-width);
    margin: 0 auto;
    padding: var(--space-3) var(--space-4);
  }

  .brand {
    font-weight: 800;
    font-size: var(--text-lg);
    color: var(--color-text);
    text-decoration: none;
    letter-spacing: -0.02em;
  }

  ul {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  a,
  .link {
    display: inline-flex;
    align-items: center;
    min-height: 2.5rem;
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: var(--text-sm);
    font-weight: 600;
    background: none;
    border: none;
    cursor: pointer;
    touch-action: manipulation;
  }

  a[aria-current='page'] {
    color: var(--color-text);
    background: var(--color-accent-soft);
  }

  .cta {
    background: var(--color-accent);
    color: var(--color-accent-text);
  }

  .offline {
    max-width: var(--content-width);
    margin: var(--space-4) auto 0;
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-left: 4px solid var(--color-accent);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }

  main {
    max-width: var(--content-width);
    margin: 0 auto;
    padding: var(--space-5) var(--space-4) var(--space-8);
  }

  @media (width <= 40rem) {
    nav {
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    ul {
      flex-wrap: wrap;
    }
  }
</style>
