import { configHash } from '@neuron/engine';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GAMES, rankedConfigList } from '../src';

/**
 * Erzeugt `packages/games/game-table.json`: die aus der TS-Registry abgeleitete
 * Tabelle aller Spiele mit Level-Leiter (Config, trialCount, theoreticalMax) und
 * Ranked-Configs. Der Rust-Server bindet die Datei per `include_str!` ein und
 * braucht so keine eigene Kopie der Level-Formeln (Single Source of Truth).
 *
 *   UPDATE_GAME_TABLE=1 pnpm --filter @neuron/games test -- game-table
 */
const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'game-table.json');
const UPDATE = process.env.UPDATE_GAME_TABLE === '1';

type Entry = { config: unknown; configHash: string; trialCount: number; theoreticalMax: number };
type GameRow = {
  id: string;
  category: string;
  inputKind: string;
  timingSensitive: boolean;
  responseModel: string;
  maxLevel: number;
  levels: Entry[];
  ranked: Entry[];
};

function build(): { $comment: string; games: GameRow[] } {
  const games: GameRow[] = [];
  for (const game of Object.values(GAMES)) {
    let implemented = true;
    try {
      game.levelToConfig(1);
    } catch {
      implemented = false;
    }
    if (!implemented) continue; // Platzhalter während der Entwicklung
    const entry = (config: unknown): Entry => ({
      config,
      configHash: configHash(config),
      trialCount: game.trialCount(config),
      theoreticalMax: game.theoreticalMax(config),
    });
    games.push({
      id: game.id,
      category: game.category,
      inputKind: game.inputKind,
      timingSensitive: game.timingSensitive,
      responseModel: game.responseModel,
      maxLevel: game.maxLevel,
      levels: Array.from({ length: game.maxLevel }, (_, i) => entry(game.levelToConfig(i + 1))),
      ranked: rankedConfigList(game.id).map(entry),
    });
  }
  return {
    $comment:
      'GENERIERT aus packages/games (test/game-table.spec.ts). Nicht von Hand bearbeiten. Rust liest diese Datei per include_str!.',
    games,
  };
}

describe('game-table.json', () => {
  it('ist aktuell gegenüber der Registry', () => {
    const fresh = build();
    if (UPDATE || !existsSync(file)) writeFileSync(file, JSON.stringify(fresh, null, 1) + '\n');
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    expect(stored.games).toEqual(fresh.games);
  });
});
