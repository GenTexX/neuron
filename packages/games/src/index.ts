import type { GameModule } from '@neuron/engine';
import { anagram } from './anagram';
import { corsi } from './corsi';
import { goNoGo } from './go-nogo';
import { lightsOut } from './lights-out';
import { mentalChain } from './mental-chain';
import { mentalRotation } from './mental-rotation';
import { nBack } from './n-back';
import { numberSequence } from './number-sequence';
import { schulte } from './schulte';
import type { ResponseModel } from './shared';
import { stroop } from './stroop';

/* eslint-disable @typescript-eslint/no-explicit-any -- Registry ist bewusst heterogen (§7.1) */
export type AnyGameModule = GameModule<any, any, any> & { responseModel: ResponseModel };

/**
 * Die Registry ist die einzige Stelle, an der ein neues Spiel eingetragen wird (§7.1).
 * Routen, Katalog, Determinismus-Tests und Statistiken leiten sich daraus ab.
 * Reihenfolge = Anzeigereihenfolge im Katalog.
 */
export const GAMES: Record<string, AnyGameModule> = {
  [stroop.id]: stroop,
  [goNoGo.id]: goNoGo,
  [nBack.id]: nBack,
  [mentalChain.id]: mentalChain,
  [numberSequence.id]: numberSequence,
  [corsi.id]: corsi,
  [schulte.id]: schulte,
  [lightsOut.id]: lightsOut,
  [anagram.id]: anagram,
  [mentalRotation.id]: mentalRotation,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export const GAME_IDS: readonly string[] = Object.keys(GAMES);

export function getGame(id: string): AnyGameModule {
  const g = GAMES[id];
  if (!g) throw new Error(`unknown game: ${id}`);
  return g;
}

export { rankedConfigFor, rankedConfigList } from './ranked';
export type { ResponseModel } from './shared';
export * from './stroop';
export * from './go-nogo';
export * from './n-back';
export * from './mental-chain';
export * from './number-sequence';
export * from './corsi';
export * from './schulte';
export * from './lights-out';
export * from './anagram';
export * from './mental-rotation';
