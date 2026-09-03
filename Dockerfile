# ---------- Web-Build (SvelteKit, adapter-static) ----------
FROM node:22-alpine AS web
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
# Playwright ist nur eine Test-Abhängigkeit; ohne diese Variable lädt das
# postinstall-Skript im Build Browser herunter (mehrere hundert MB).
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /src
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/engine/package.json packages/engine/
COPY packages/games/package.json packages/games/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages ./packages
COPY apps/web ./apps/web
COPY tsconfig.base.json ./
RUN pnpm --filter @neuron/web build

# ---------- API-Build (Rust, sqlx offline) ----------
FROM rust:1.94-bookworm AS api
WORKDIR /src
COPY apps/api/Cargo.toml apps/api/Cargo.lock ./apps/api/
COPY apps/api/src ./apps/api/src
COPY apps/api/migrations ./apps/api/migrations
COPY apps/api/.sqlx ./apps/api/.sqlx
# Wird per include_str! eingebunden: die aus der TS-Registry erzeugte
# Spieltabelle (ADR 0005). Ohne sie schlägt der Build fehl.
COPY packages/games/game-table.json ./packages/games/game-table.json
COPY packages/games/ranked-configs.json ./packages/games/ranked-configs.json
# Nur für `cargo test` nötig (Golden-Files und Score-Paritäts-Fixtures).
COPY packages/engine/test/golden ./packages/engine/test/golden
COPY packages/games/test/fixtures ./packages/games/test/fixtures
WORKDIR /src/apps/api
ENV SQLX_OFFLINE=true
RUN cargo build --release --locked

# ---------- Laufzeit ----------
FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=api /src/apps/api/target/release/neuron-api /app/neuron-api
COPY --from=web /src/apps/web/build /app/static
ENV STATIC_DIR=/app/static BIND_ADDR=0.0.0.0:8080
EXPOSE 8080
USER nobody
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["/app/neuron-api"]
