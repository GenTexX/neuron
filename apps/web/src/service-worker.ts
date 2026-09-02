/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

/**
 * Service Worker (§13.6): Precache der App-Shell und aller Spiel-Chunks,
 * `network-first` für `/api/*`, `cache-first` für statische Assets.
 *
 * Offline-Verhalten in v1: Die App lädt, Spiele sind aber nicht spielbar, weil
 * `POST /runs` den Seed liefert. Die Oberfläche zeigt dafür einen Hinweis.
 */
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `neuron-${version}`;
// `build` enthält die App-Shell inklusive aller lazy geladenen Spiel-Chunks.
const PRECACHE = [...build, ...files];

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // API: immer zuerst das Netz. Ergebnisse werden bewusst nicht gecacht —
  // ein veralteter Seed oder eine veraltete Bestenliste wäre schlimmer als ein Fehler.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(handleAsset(request, url));
});

async function handleAsset(request: Request, url: URL): Promise<Response> {
  const cache = await caches.open(CACHE);

  // Gebaute Assets sind versioniert und unveränderlich: cache-first.
  if (PRECACHE.includes(url.pathname)) {
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
  }

  try {
    const response = await fetch(request);
    if (response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // SPA-Navigation offline: die App-Shell ausliefern (§13.6).
    if (request.mode === 'navigate') {
      const shell = await cache.match('/');
      if (shell) return shell;
    }
    throw err;
  }
}
