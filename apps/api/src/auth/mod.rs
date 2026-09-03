//! Authentifizierung (§8): Argon2id, JWT-Access-Token, opakes rotierendes Refresh-Token.

pub mod extractor;
pub mod jwt;
pub mod password;
pub mod rate_limit;
pub mod refresh;

pub const ACCESS_TTL_SECONDS: i64 = 15 * 60;
pub const REFRESH_TTL_DAYS: i64 = 30;
pub const REFRESH_COOKIE: &str = "neuron_refresh";
pub const REFRESH_COOKIE_PATH: &str = "/api/auth";
