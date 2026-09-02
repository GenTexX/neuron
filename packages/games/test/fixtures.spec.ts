import { Rng, configHash, type TrialResultRow } from '@neuron/engine';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GAMES, rankedConfigList } from '../src';
import { SIMULATORS } from './simulate';

/**
 * Scoring-Paritäts-Fixtures (§15): pro Spiel eine JSON-Datei mit
 * { config, rows, expected, theoreticalMax }-Fällen. `cargo test` liest dieselbe
 * Datei und muss dieselben Scores liefern.
 *
 *   UPDATE_FIXTURES=1 pnpm --filter @neuron/games test -- fixtures
 */
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'fixtures', 'scoring');
const UPDATE = process.env.UPDATE_FIXTURES === '1';

type Fixture = {
  name: string;
  config: unknown;
  configHash: string;
  trialCount: number;
  rows: TrialResultRow[];
  expected: number;
  theoreticalMax: number;
};

function buildFixtures(gameId: string): Fixture[] {
  const game = GAMES[gameId];
  const simulate = SIMULATORS[gameId];
  const configs = [
    ...[1, 3, 6, game.maxLevel].map((l) => ({ name: `level-${l}`, config: game.levelToConfig(l) })),
    ...rankedConfigList(gameId).map((c, i) => ({ name: `ranked-${i}`, config: c })),
  ];
  const out: Fixture[] = [];
  configs.forEach(({ name, config }, ci) => {
    for (let s = 0; s < 3; s++) {
      const seed = 1000 * ci + s;
      const n = game.trialCount(config);
      const genRng = new Rng(seed);
      const trials = game.generateRun(genRng, config, n);
      const simRng = new Rng(seed + 7);
      const rows = trials.flatMap((t, i) =>
        game.toResultRows(t, i, simulate(simRng, t, config, i)),
      );
      out.push({
        name: `${name}-seed-${seed}`,
        config,
        configHash: configHash(config),
        trialCount: n,
        rows,
        expected: game.scoreRows(config, rows),
        theoreticalMax: game.theoreticalMax(config),
      });
    }
  });
  // Randfälle: leere Antworten
  const config = game.levelToConfig(2);
  const n = game.trialCount(config);
  const trials = game.generateRun(new Rng(3), config, n);
  const emptyRows = trials.flatMap((t, i) =>
    game.toResultRows(t, i, {
      response: null,
      rtMs: null,
      presentedMs: null,
      judgement: { correct: false },
    }),
  );
  out.push({
    name: 'no-responses',
    config,
    configHash: configHash(config),
    trialCount: n,
    rows: emptyRows,
    expected: game.scoreRows(config, emptyRows),
    theoreticalMax: game.theoreticalMax(config),
  });
  return out;
}

describe.each(Object.keys(GAMES))('%s – Scoring-Fixtures', (gameId) => {
  const file = join(dir, `${gameId}.json`);

  it('Fixture-Datei existiert und stimmt mit der aktuellen Formel überein', () => {
    const fresh = buildFixtures(gameId);
    if (UPDATE || !existsSync(file)) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(fresh, null, 1) + '\n');
    }
    const stored = JSON.parse(readFileSync(file, 'utf8')) as Fixture[];
    expect(stored.length).toBe(fresh.length);
    stored.forEach((f, i) => {
      expect(f.name).toBe(fresh[i].name);
      expect(f.rows).toEqual(fresh[i].rows);
      expect(f.expected).toBe(fresh[i].expected);
      expect(f.configHash).toBe(fresh[i].configHash);
    });
    const game = GAMES[gameId];
    for (const f of stored) {
      expect(game.scoreRows(f.config, f.rows)).toBe(f.expected);
      expect(f.expected).toBeLessThanOrEqual(f.theoreticalMax);
    }
  });
});
