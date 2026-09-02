//! Konfiguration über Umgebungsvariablen (§14.4). Fehlt eine Pflichtvariable,
//! bricht der Prozess beim Start ab – kein stilles Weiterlaufen mit Defaults.

use figment::{providers::Env, Figment};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub bind_addr: String,
    pub static_dir: String,
    #[serde(default = "default_rust_log")]
    pub rust_log: String,
    pub cookie_domain: String,
    pub cors_origins: String,
    /// Optional: `false` erlaubt Cookies ohne `Secure` für lokale http-Entwicklung.
    #[serde(default = "default_true")]
    pub cookie_secure: bool,
    /// Optional: Migrationen beim Start ausführen (Default: true).
    #[serde(default = "default_true")]
    pub run_migrations: bool,
}

fn default_true() -> bool {
    true
}

fn default_rust_log() -> String {
    "info".to_string()
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let cfg: Config = Figment::new()
            .merge(Env::raw())
            .extract()
            .map_err(|e| anyhow::anyhow!("Konfiguration unvollständig: {e}"))?;
        if cfg.jwt_secret.len() < 32 {
            anyhow::bail!("JWT_SECRET muss mindestens 32 Zeichen lang sein");
        }
        Ok(cfg)
    }

    pub fn cors_origin_list(&self) -> Vec<String> {
        self.cors_origins
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    }
}
