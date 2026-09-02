import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Statisches SPA-Build mit Fallback; die Rust-API liefert es aus (§2).
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true,
    }),
    serviceWorker: {
      // Registrierung übernimmt das Root-Layout, damit sie nur in Produktion läuft.
      register: false,
    },
  },
};

export default config;
