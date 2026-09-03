//! Konfiguration über Umgebungsvariablen (§14.4). Fehlt eine Pflichtvariable,
//! bricht der Prozess beim Start ab – kein stilles Weiterlaufen mit Defaults.
//!
//! Die Werte kommen aus der Prozessumgebung. `load_dotenv()` füllt sie vorher
//! aus einer `.env`-Datei auf; bereits gesetzte Variablen gewinnen (übliche
//! dotenv-Semantik, und wichtig für Docker, wo die Umgebung gesetzt wird).

use std::path::PathBuf;

use figment::{error::Kind, providers::Env, Figment};
use serde::Deserialize;

/// Pflichtvariablen, in der Reihenfolge aus `.env.example`.
const REQUIRED: &[&str] = &[
    "DATABASE_URL",
    "JWT_SECRET",
    "BIND_ADDR",
    "STATIC_DIR",
    "COOKIE_DOMAIN",
    "CORS_ORIGINS",
];

const OPTIONAL: &[&str] = &[
    "RUST_LOG",
    "COOKIE_SECURE",
    "RUN_MIGRATIONS",
    "TRUST_PROXY_HEADERS",
    "AUTH_RATE_LIMIT_BURST",
];

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
    /// Optional: erlaubte Auth-Versuche je IP und 15 Minuten (§8: 10).
    /// Höher setzen, wenn viele Nutzer hinter derselben IP sitzen (NAT).
    #[serde(default = "default_auth_rate_limit_burst")]
    pub auth_rate_limit_burst: u32,
    /// Optional: `X-Forwarded-For` & Co. für das Rate Limiting auswerten.
    /// Nur einschalten, wenn ausschließlich ein Reverse Proxy die API erreicht
    /// (siehe `auth::rate_limit`). Standard: aus.
    #[serde(default)]
    pub trust_proxy_headers: bool,
}

fn default_true() -> bool {
    true
}

fn default_rust_log() -> String {
    "info".to_string()
}

fn default_auth_rate_limit_burst() -> u32 {
    crate::auth::rate_limit::DEFAULT_BURST_SIZE
}

/// Lädt eine `.env`-Datei, gesucht ab dem aktuellen Verzeichnis aufwärts.
///
/// Gibt den Pfad der geladenen Datei zurück. Fehlt die Datei, ist das kein
/// Fehler – in Produktion kommt die Konfiguration aus der Umgebung.
pub fn load_dotenv() -> Option<PathBuf> {
    match dotenvy::dotenv() {
        Ok(path) => Some(path),
        Err(err) if err.not_found() => None,
        Err(err) => {
            eprintln!("Warnung: .env konnte nicht gelesen werden: {err}");
            None
        }
    }
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Self::from_figment(Figment::new().merge(Env::raw()))
    }

    fn from_figment(figment: Figment) -> anyhow::Result<Self> {
        let cfg: Config = figment
            .extract()
            .map_err(|err| missing_config_error(&figment, err))?;
        if cfg.auth_rate_limit_burst == 0 {
            anyhow::bail!("AUTH_RATE_LIMIT_BURST muss mindestens 1 sein.");
        }
        if cfg.jwt_secret.len() < 32 {
            anyhow::bail!(
                "JWT_SECRET muss mindestens 32 Zeichen lang sein (aktuell {}).",
                cfg.jwt_secret.len()
            );
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

/// Übersetzt figments "missing field"-Meldung in einen Hinweis, mit dem man
/// etwas anfangen kann: welche Variablen fehlen und wo sie hingehören.
///
/// figment bricht beim ersten fehlenden Feld ab. Deshalb wird die Quelle hier
/// noch einmal selbst befragt – sonst behebt man eine Variable nach der
/// anderen und startet dazwischen jedes Mal neu.
fn missing_config_error(figment: &Figment, err: figment::Error) -> anyhow::Error {
    let reports_missing = err
        .clone()
        .into_iter()
        .any(|e| matches!(e.kind, Kind::MissingField(_)));
    if !reports_missing {
        return anyhow::anyhow!("Konfiguration ungültig: {err}");
    }

    let missing: Vec<String> = REQUIRED
        .iter()
        .filter(|key| figment.find_value(&key.to_lowercase()).is_err())
        .map(|key| (*key).to_string())
        .collect();

    if missing.is_empty() {
        return anyhow::anyhow!("Konfiguration ungültig: {err}");
    }

    anyhow::anyhow!(
        "Konfiguration unvollständig: {fehlend} {verb}.\n\n\
         Pflichtvariablen: {required}\n\
         Optional: {optional}\n\n\
         Lege eine .env-Datei an – die Vorlage liegt in .env.example:\n\
         \x20   cp .env.example apps/api/.env\n\
         Gesucht wird sie ab dem aktuellen Verzeichnis aufwärts. Alternativ die \
         Variablen direkt in der Umgebung setzen; gesetzte Variablen haben Vorrang \
         vor der .env-Datei.",
        fehlend = missing.join(", "),
        verb = if missing.len() == 1 {
            "fehlt"
        } else {
            "fehlen"
        },
        required = REQUIRED.join(", "),
        optional = OPTIONAL.join(", "),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use figment::providers::Serialized;
    use serde_json::{json, Map, Value};

    /// Die Werte werden als JSON-Objekt aufgebaut, damit Zahlen Zahlen bleiben.
    /// (Echte Umgebungsvariablen sind Strings, die figments `Env`-Provider
    /// selbst umwandelt – das deckt die E2E-Suite ab.)
    fn full() -> Map<String, Value> {
        let mut map = Map::new();
        map.insert("database_url".into(), json!("postgres://localhost/neuron"));
        map.insert("jwt_secret".into(), json!("a".repeat(32)));
        map.insert("bind_addr".into(), json!("0.0.0.0:8080"));
        map.insert("static_dir".into(), json!("./build"));
        map.insert("cookie_domain".into(), json!("localhost"));
        map.insert(
            "cors_origins".into(),
            json!("http://localhost:5173, http://localhost:8080"),
        );
        map
    }

    fn from(map: Map<String, Value>) -> anyhow::Result<Config> {
        Config::from_figment(Figment::from(Serialized::defaults(Value::Object(map))))
    }

    #[test]
    fn accepts_a_complete_configuration() {
        let cfg = from(full()).expect("vollständige Konfiguration");
        assert_eq!(cfg.database_url, "postgres://localhost/neuron");
        // Optionale Werte haben Defaults.
        assert_eq!(cfg.rust_log, "info");
        assert!(cfg.cookie_secure);
        assert!(cfg.run_migrations);
        assert!(
            !cfg.trust_proxy_headers,
            "Proxy-Header werden nur bewusst vertraut"
        );
        assert_eq!(cfg.auth_rate_limit_burst, 10, "§8-Vorgabe als Standard");
    }

    #[test]
    fn trims_and_splits_cors_origins() {
        let cfg = from(full()).unwrap();
        assert_eq!(
            cfg.cors_origin_list(),
            vec!["http://localhost:5173", "http://localhost:8080"]
        );
    }

    #[test]
    fn names_the_missing_variable_and_points_at_dotenv() {
        let mut map = full();
        map.remove("database_url");
        let err = from(map).unwrap_err().to_string();
        assert!(err.contains("DATABASE_URL fehlt"), "{err}");
        assert!(err.contains(".env.example"), "{err}");
    }

    #[test]
    fn lists_every_missing_variable() {
        let mut map = full();
        map.remove("database_url");
        map.remove("cookie_domain");
        let err = from(map).unwrap_err().to_string();
        assert!(err.contains("DATABASE_URL"), "{err}");
        assert!(err.contains("COOKIE_DOMAIN"), "{err}");
        assert!(err.contains("fehlen"), "{err}");
    }

    #[test]
    fn accepts_a_raised_rate_limit() {
        let mut map = full();
        map.insert("auth_rate_limit_burst".into(), json!(30));
        assert_eq!(from(map).unwrap().auth_rate_limit_burst, 30);
    }

    #[test]
    fn rejects_a_zero_rate_limit() {
        let mut map = full();
        map.insert("auth_rate_limit_burst".into(), json!(0));
        let err = from(map).unwrap_err().to_string();
        assert!(err.contains("mindestens 1"), "{err}");
    }

    #[test]
    fn proxy_trust_is_opt_in() {
        let mut map = full();
        map.insert("trust_proxy_headers".into(), json!(true));
        assert!(from(map).unwrap().trust_proxy_headers);
    }

    #[test]
    fn rejects_a_short_jwt_secret() {
        let mut map = full();
        map.insert("jwt_secret".into(), json!("zu-kurz"));
        let err = from(map).unwrap_err().to_string();
        assert!(err.contains("mindestens 32 Zeichen"), "{err}");
    }
}
