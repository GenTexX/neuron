# Neuron

Brain-Training-Plattform: kognitive Minispiele mit Training- (adaptiv) und Ranked-Modus
(feste Tagesrunde, Bestenliste). PWA mit SvelteKit, API in Rust/Axum, PostgreSQL.

## Struktur

```
apps/web        SvelteKit-PWA (Svelte 5, Runes, adapter-static)
apps/api        Rust/Axum-API, sqlx (offline), Migrationen
packages/engine DOM-freie Engine: RNG, Config-Hash, Staircase, Scoring-Bausteine, Typen
packages/games  DOM-freie Spiellogik: Generatoren, Judges, Scorer, Registry
docs/           CONTEXT.md (Domänensprache), ADRs
```

## Entwicklung

Voraussetzungen: Node 22, pnpm 10, Rust 1.94, PostgreSQL 16 (oder Docker).

```sh
pnpm install
cp .env.example .env            # anpassen
docker compose up -d postgres   # oder eigene DB
cd apps/api && sqlx migrate run # oder: API startet Migrationen selbst
cargo run                       # API auf :8080
pnpm dev                        # Web auf :5173, /api wird an :8080 weitergeleitet
```

Tests und Prüfungen:

```sh
pnpm lint                 # ESLint + Prettier
pnpm check                # svelte-check + tsc
pnpm test                 # Vitest (engine, games, web)
cd apps/api && cargo test # Rust: Domain, Paritäts- und API-Tests (DATABASE_URL nötig)

# E2E: braucht ein gebautes Frontend, eine gebaute API und eine eigene Datenbank.
pnpm --filter @neuron/web build
cargo build --manifest-path apps/api/Cargo.toml
NEURON_E2E_DATABASE_URL=postgres://neuron:neuron@localhost:5432/neuron_e2e pnpm test:e2e
```

Die E2E-Suite läuft auf Desktop- und Mobile-Viewport (§15). In Umgebungen mit vorinstalliertem
Chromium zeigt `PLAYWRIGHT_CHROMIUM_EXECUTABLE` auf die Binärdatei.

sqlx-Offline-Daten aktualisieren (nach Query-Änderungen): `cd apps/api && cargo sqlx prepare`.

## Ein Spiel ändern oder hinzufügen

1. Spiellogik in `packages/games/src/<id>.ts` (rein, DOM-frei) und in `GAMES` eintragen.
2. Simulator in `packages/games/test/simulate/<id>.ts`, Invarianten-Test in `test/<id>.spec.ts`.
3. Generierte Dateien auffrischen:
   `UPDATE_GAME_TABLE=1 UPDATE_FIXTURES=1 pnpm --filter @neuron/games test`
4. Rust-Scorer in `apps/api/src/domain/scoring/<id>.rs` (Parität gegen die Fixtures).
5. View in `apps/web/src/lib/games/<id>/View.svelte` und in `lib/games/registry.ts` eintragen.
6. Strings in `apps/web/src/lib/i18n/de.ts`.

## Produktion

`docker compose up --build` baut Web + API in einem Image; die API liefert das Static-Build aus.
`JWT_SECRET` muss gesetzt sein.
