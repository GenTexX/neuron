import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Startet für die E2E-Suite eine eigene Datenbank und eine API-Instanz, die das
 * Static-Build ausliefert. Wird über `NEURON_E2E_DATABASE_URL` und
 * `NEURON_E2E_API` konfiguriert; ohne die Variablen wird alles selbst gestartet.
 */
const PORT = Number(process.env.NEURON_E2E_PORT ?? 4173);
const ROOT = new URL('../../..', import.meta.url).pathname;

let api: ChildProcess | null = null;

export default async function globalSetup() {
  const databaseUrl = process.env.NEURON_E2E_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'NEURON_E2E_DATABASE_URL fehlt. Beispiel: postgres://postgres@localhost:5432/neuron_e2e',
    );
  }

  // Frisches Schema je Lauf: die Suite prüft unter anderem die Bestenliste.
  const reset = spawnSync(
    'psql',
    [
      databaseUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
    ],
    { stdio: 'inherit' },
  );
  if (reset.status !== 0) throw new Error('Datenbank konnte nicht zurückgesetzt werden');

  const logPath = join(mkdtempSync(join(tmpdir(), 'neuron-e2e-')), 'api.log');
  api = spawn(join(ROOT, 'apps/api/target/debug/neuron-api'), {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      JWT_SECRET: 'e2e-secret-mit-mindestens-32-zeichen!!',
      BIND_ADDR: `127.0.0.1:${PORT}`,
      STATIC_DIR: join(ROOT, 'apps/web/build'),
      RUST_LOG: 'warn',
      COOKIE_DOMAIN: 'localhost',
      COOKIE_SECURE: 'false',
      CORS_ORIGINS: `http://127.0.0.1:${PORT}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chunks: string[] = [];
  api.stdout?.on('data', (d: Buffer) => chunks.push(d.toString()));
  api.stderr?.on('data', (d: Buffer) => chunks.push(d.toString()));

  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) break;
    } catch {
      // noch nicht bereit
    }
    if (Date.now() > deadline) {
      writeFileSync(logPath, chunks.join(''));
      throw new Error(`API startete nicht. Log: ${logPath}\n${chunks.join('').slice(-2000)}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  (globalThis as { __neuronApi?: ChildProcess }).__neuronApi = api;
}
