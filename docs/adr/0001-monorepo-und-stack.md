# ADR 0001 – Monorepo und fixierter Stack

**Status:** akzeptiert · **Datum:** 2026-09-02

## Kontext

Die Plattform besteht aus einer PWA (SvelteKit), einer API (Rust/Axum/sqlx/Postgres) und
DOM-freier Spiellogik, die später nach Rust/WASM portiert werden soll.

## Entscheidung

pnpm-Workspace mit `apps/web`, `apps/api`, `packages/engine`, `packages/games`. Svelte 5 mit
Runes, `adapter-static` mit SPA-Fallback; die API liefert das Static-Build aus. Kein Tailwind,
kein ORM, kein externes State-Management.

## Konsequenzen

Ein Repo, ein Lockfile für TS, ein `Cargo.lock` für Rust. Docker-Build in einem Multi-Stage-
Dockerfile. Die Grenze zwischen Spiellogik und Darstellung wird per ESLint erzwungen (ADR 0002).
