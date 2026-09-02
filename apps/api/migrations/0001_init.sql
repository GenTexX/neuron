-- 0001_init.sql — Grundschema (§10.1)

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE app_user (
    id                uuid PRIMARY KEY,
    email             citext NOT NULL UNIQUE,
    password_hash     text NOT NULL,
    display_name      text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 32),
    role              text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
    timezone          text NOT NULL DEFAULT 'Europe/Vienna',
    email_verified_at timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_user_display_name_lower_idx
    ON app_user (lower(display_name));

CREATE TABLE refresh_token (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash  bytea NOT NULL UNIQUE,
    issued_at   timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    replaced_by uuid REFERENCES refresh_token(id)
);
CREATE INDEX refresh_token_user_idx ON refresh_token (user_id);

CREATE TABLE game (
    id        text PRIMARY KEY,
    category  text NOT NULL,
    enabled   boolean NOT NULL DEFAULT true,
    max_level integer NOT NULL
);

CREATE TABLE ranked_round (
    id          uuid PRIMARY KEY,
    game_id     text NOT NULL REFERENCES game(id),
    config      jsonb NOT NULL,
    config_hash text NOT NULL,
    seed        bigint NOT NULL,          -- u32-Wertebereich
    trial_count integer NOT NULL,
    starts_at   timestamptz NOT NULL,
    ends_at     timestamptz NOT NULL,
    CHECK (ends_at > starts_at)
);
CREATE UNIQUE INDEX ranked_round_game_start_idx ON ranked_round (game_id, starts_at);

CREATE TABLE run (
    id                 uuid PRIMARY KEY,
    user_id            uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    game_id            text NOT NULL REFERENCES game(id),
    mode               text NOT NULL CHECK (mode IN ('training','ranked')),
    ranked_round_id    uuid REFERENCES ranked_round(id),
    level              integer,                    -- nur bei mode='training'
    config             jsonb NOT NULL,
    config_hash        text NOT NULL,
    seed               bigint NOT NULL,
    trial_count        integer NOT NULL,
    nonce              bytea NOT NULL,
    server_started_at  timestamptz NOT NULL DEFAULT now(),
    submitted_at       timestamptz,
    client_duration_ms integer,
    correct_count      integer,
    score              integer,
    valid              boolean NOT NULL DEFAULT false,
    invalid_reason     text,
    CHECK ((mode = 'ranked') = (ranked_round_id IS NOT NULL))
);

-- Ein gewerteter Ranked-Versuch pro Nutzer und Runde.
CREATE UNIQUE INDEX run_one_ranked_per_round_idx
    ON run (user_id, ranked_round_id)
    WHERE ranked_round_id IS NOT NULL;

CREATE INDEX run_user_game_idx ON run (user_id, game_id, submitted_at DESC);
CREATE INDEX run_leaderboard_idx
    ON run (game_id, config_hash, score DESC)
    WHERE valid AND submitted_at IS NOT NULL;

CREATE TABLE trial_result (
    run_id       uuid NOT NULL REFERENCES run(id) ON DELETE CASCADE,
    idx          integer NOT NULL,
    response     jsonb,
    rt_ms        integer,
    presented_ms integer,
    correct      boolean NOT NULL,
    PRIMARY KEY (run_id, idx)
);

CREATE TABLE user_game_state (
    user_id        uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    game_id        text NOT NULL REFERENCES game(id),
    level          integer NOT NULL DEFAULT 1,
    consecutive_up integer NOT NULL DEFAULT 0,
    runs_played    integer NOT NULL DEFAULT 0,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, game_id)
);

CREATE TABLE personal_best (
    user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    game_id     text NOT NULL REFERENCES game(id),
    config_hash text NOT NULL,
    score       integer NOT NULL,
    run_id      uuid NOT NULL REFERENCES run(id) ON DELETE CASCADE,
    achieved_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, game_id, config_hash)
);

-- Ein Eintrag pro Nutzer und lokalem Kalendertag mit mindestens einem gültigen Run.
CREATE TABLE daily_activity (
    user_id   uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    local_day date NOT NULL,
    run_count integer NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, local_day)
);
