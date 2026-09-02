import type { ChildProcess } from 'node:child_process';

export default async function globalTeardown() {
  const api = (globalThis as { __neuronApi?: ChildProcess }).__neuronApi;
  if (api && !api.killed) {
    api.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
    if (!api.killed) api.kill('SIGKILL');
  }
}
