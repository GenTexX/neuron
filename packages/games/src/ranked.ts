import rankedConfigs from '../ranked-configs.json';

type RankedTable = Record<string, unknown[]>;

const TABLE = rankedConfigs as unknown as RankedTable;

/**
 * Wählt die Ranked-Config eines Spiels für eine ISO-Kalenderwoche (§10.3).
 * Rotation: `index = isoWeek % list.length`. Muss mit `domain::ranked` in Rust
 * übereinstimmen.
 */
export function rankedConfigFor<C>(gameId: string, isoWeek: number): C {
  const list = TABLE[gameId];
  if (!list || list.length === 0) throw new Error(`no ranked configs for ${gameId}`);
  const idx = ((isoWeek % list.length) + list.length) % list.length;
  return list[idx] as C;
}

export function rankedConfigList<C>(gameId: string): readonly C[] {
  const list = TABLE[gameId];
  if (!list) throw new Error(`no ranked configs for ${gameId}`);
  return list as C[];
}
