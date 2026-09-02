# ADR 0002 – DOM-freie, zeitfreie, zustandsfreie Spiellogik

**Status:** akzeptiert · **Datum:** 2026-09-02

## Kontext

Generatoren und Scorer sollen ohne Umschreiben nach Rust portierbar sein (Meilenstein „echte
Verifikation“). Jede Abhängigkeit von `window`, `document`, `Date`, `performance` oder
`Math.random` würde das verhindern.

## Entscheidung

`packages/engine` und `packages/games` enthalten nur reine Funktionen `(rng, config) → Trial[]`,
`(trial, response) → Judgement` und `(config, rows) → score`. ESLint (`no-restricted-globals`,
`no-restricted-properties`, `no-restricted-imports`) erzwingt die Grenze. Selbst `TextEncoder`
wird vermieden; UTF-8 und SHA-256 sind als reine Funktionen implementiert.

## Konsequenzen

Views (`apps/web/src/lib/games/<id>/View.svelte`) enthalten keine Spiellogik. Timing gehört
ausschließlich dem `TrialRunner`.
