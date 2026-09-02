import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    alias: { $lib: new URL('./src/lib', import.meta.url).pathname },
  },
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'jsdom',
  },
});
