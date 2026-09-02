import { Rng, configHash } from '@neuron/engine';
import { describe, expect, it } from 'vitest';
import { GAMES, rankedConfigList } from '../src';
import { SIMULATORS } from './simulate';

const SEEDS = [0, 1, 42, 1234567, 4294967295];

/**
 * Generischer Determinismus-Test über die Registry (§5.2). Neue Spiele werden
 * automatisch erfasst.
 */
describe.each(Object.values(GAMES))('$id – Determinismus und Registry-Invarianten', (game) => {
  it('hat einen Simulator für Scoring-Fixtures', () => {
    expect(SIMULATORS[game.id]).toBeDefined();
  });

  it('hat Ranked-Configs und rankedConfig() liefert eine davon', () => {
    const list = rankedConfigList(game.id);
    expect(list.length).toBeGreaterThan(0);
    for (let week = 1; week <= 53; week++) {
      const c = game.rankedConfig(week);
      expect(list.map((x) => configHash(x))).toContain(configHash(c));
    }
  });

  it('levelToConfig ist für 1..maxLevel definiert und liefert JSON-kanonisierbare Configs', () => {
    expect(game.maxLevel).toBeGreaterThanOrEqual(1);
    const hashes = new Set<string>();
    for (let l = 1; l <= game.maxLevel; l++) {
      const c = game.levelToConfig(l);
      expect(() => configHash(c)).not.toThrow();
      expect(game.trialCount(c)).toBeGreaterThan(0);
      expect(game.theoreticalMax(c)).toBeGreaterThan(0);
      hashes.add(configHash(c));
    }
    // Levels über maxLevel werden geklemmt
    expect(configHash(game.levelToConfig(game.maxLevel + 5))).toBe(
      configHash(game.levelToConfig(game.maxLevel)),
    );
    expect(hashes.size).toBeGreaterThan(1);
  });

  const configs = [
    ...Array.from({ length: game.maxLevel }, (_, i) => game.levelToConfig(i + 1)),
    ...rankedConfigList(game.id),
  ];

  it.each(SEEDS)('seed %i: gleicher Seed → bitgleiche Trials, für jede Config', (seed) => {
    for (const config of configs) {
      const n = game.trialCount(config);
      const a = game.generateRun(new Rng(seed), config, n);
      const b = game.generateRun(new Rng(seed), config, n);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.length).toBeGreaterThan(0);
      if (game.responseModel === 'discrete') expect(a.length).toBe(n);
      else expect(a.length).toBe(1);
    }
  });

  it('verschiedene Seeds → (fast immer) verschiedene Trials', () => {
    const config = game.levelToConfig(3);
    const n = game.trialCount(config);
    const a = JSON.stringify(game.generateRun(new Rng(1), config, n));
    const b = JSON.stringify(game.generateRun(new Rng(2), config, n));
    expect(a).not.toBe(b);
  });

  it('toResultRows liefert genau trialCount Zeilen mit lückenlosen Indizes; Score <= theoreticalMax', () => {
    const simulate = SIMULATORS[game.id];
    for (const config of configs.slice(0, 6)) {
      const n = game.trialCount(config);
      const rng = new Rng(77);
      const trials = game.generateRun(rng, config, n);
      const rows = trials.flatMap((t, i) => game.toResultRows(t, i, simulate(rng, t, config, i)));
      expect(rows.map((r) => r.idx)).toEqual(Array.from({ length: n }, (_, i) => i));
      const score = game.scoreRows(config, rows);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(game.theoreticalMax(config));
    }
  });

  it('perfekte Antworten erreichen höchstens theoreticalMax', () => {
    for (const config of configs.slice(0, 4)) {
      const n = game.trialCount(config);
      const trials = game.generateRun(new Rng(5), config, n);
      const simulate = SIMULATORS[game.id];
      // Simulator mit "immer richtig"-Tendenz gibt es nicht generisch; wir prüfen nur die Schranke
      const rows = trials.flatMap((t, i) =>
        game.toResultRows(t, i, simulate(new Rng(9), t, config, i)),
      );
      expect(game.scoreRows(config, rows)).toBeLessThanOrEqual(game.theoreticalMax(config));
    }
  });
});
