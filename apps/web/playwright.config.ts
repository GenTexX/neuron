import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.NEURON_E2E_PORT ?? 4173);

/**
 * E2E gegen den echten Stack: die Rust-API liefert das Static-Build aus (§2),
 * also läuft die Suite gegen genau die Auslieferung, die auch produktiv geht.
 * Der Server wird von `tests/global-setup.ts` hochgefahren.
 */
/**
 * In Umgebungen mit vorinstalliertem Chromium (etwa CI-Images) zeigt
 * `PLAYWRIGHT_CHROMIUM_EXECUTABLE` auf die Binärdatei; sonst nutzt Playwright
 * seinen eigenen Download.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const launchOptions = executablePath ? { launchOptions: { executablePath } } : {};

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // §15: läuft auf Desktop-Viewport UND Mobile-Viewport.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...launchOptions } },
  ],
});
