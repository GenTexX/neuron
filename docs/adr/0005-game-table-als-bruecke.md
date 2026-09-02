# ADR 0005 – `game-table.json` als Brücke zwischen TS-Registry und Rust

**Status:** akzeptiert · **Datum:** 2026-09-02

## Kontext

Die Level-Leiter (`levelToConfig`), `trialCount` und `theoreticalMax` sind in TypeScript
definiert (§7, §12). Der Server braucht dieselben Werte: er vergibt Config und Seed (§4.1),
prüft die Score-Obergrenze (§9.2) und legt die Ranked-Runden an (§10.3). Eine handgepflegte
Zweitfassung in Rust würde unweigerlich auseinanderdriften.

## Entscheidung

Ein Test (`packages/games/test/game-table.spec.ts`) leitet aus der TS-Registry
`packages/games/game-table.json` ab: pro Spiel alle Level-Configs und alle Ranked-Configs, jeweils
mit `configHash`, `trialCount` und `theoreticalMax`. Rust bindet die Datei per `include_str!` ein
(`domain::table`). Der Test schlägt fehl, sobald Code und Datei auseinanderlaufen; ein
Rust-Test prüft zusätzlich, dass die eigene `theoretical_max`-Implementierung dieselben Werte
liefert.

Analog liegen die Ranked-Config-Listen in `packages/games/ranked-configs.json` (§10.3) und die
Score-Paritäts-Fixtures in `packages/games/test/fixtures/scoring/<game>.json`.

## Konsequenzen

Die Level-Formeln existieren genau einmal – in TypeScript. In Rust bleibt nur die Score-Formel
doppelt, und die ist durch Fixtures abgesichert (ADR 0003). Nach einer Änderung an einem Spiel:
`UPDATE_GAME_TABLE=1 UPDATE_FIXTURES=1 pnpm --filter @neuron/games test`, dann `cargo test`.
