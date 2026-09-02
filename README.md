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
pnpm test:e2e             # Playwright
```

sqlx-Offline-Daten aktualisieren (nach Query-Änderungen): `cd apps/api && cargo sqlx prepare`.

## Produktion

`docker compose up --build` baut Web + API in einem Image; die API liefert das Static-Build aus.
`JWT_SECRET` muss gesetzt sein.
