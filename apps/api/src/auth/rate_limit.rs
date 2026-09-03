//! Rate Limiting für `/auth/login` und `/auth/register` (§8): 10 Anfragen pro
//! IP und 15 Minuten.
//!
//! Ohne diese Bremse ist ein Login-Endpunkt mit Argon2id gleich zweifach
//! angreifbar: als Brute-Force-Fläche und als CPU-Erschöpfung – jeder Versuch
//! kostet den Server absichtlich Rechenzeit.
//!
//! ## Woher die IP kommt
//!
//! Hinter einem Reverse Proxy ist die Peer-IP immer die des Proxys; ohne
//! Proxy-Header landen dann alle Nutzer im selben Zähler. Die Header darf man
//! aber nur auswerten, wenn die API **nicht** direkt erreichbar ist – sonst
//! setzt sich ein Angreifer einfach ein eigenes `X-Forwarded-For` und hebelt
//! die Bremse aus.
//!
//! Deshalb `TRUST_PROXY_HEADERS`: Standard `false` (Peer-IP). Hinter nginx auf
//! `true` stellen und die API nur an `127.0.0.1` binden.

use std::sync::Arc;

use axum::{
    body::Body,
    http::{header, Response, StatusCode},
    Router,
};
use tower_governor::{
    governor::GovernorConfigBuilder,
    key_extractor::{PeerIpKeyExtractor, SmartIpKeyExtractor},
    GovernorError, GovernorLayer,
};

/// §8: 10 Anfragen pro IP und 15 Minuten.
pub const DEFAULT_BURST_SIZE: u32 = 10;
pub const WINDOW_SECONDS: u64 = 15 * 60;

/// Nachfüllrate der GCRA: ein Versuch je `WINDOW / BURST`.
pub fn replenish_seconds(burst: u32) -> u64 {
    (WINDOW_SECONDS / burst.max(1) as u64).max(1)
}

/// Antwort im einheitlichen Fehlerformat (§11) statt der Klartextvorgabe.
fn error_response(error: GovernorError) -> Response<Body> {
    let (status, code, message) = match error {
        GovernorError::TooManyRequests { wait_time, .. } => (
            StatusCode::TOO_MANY_REQUESTS,
            "rate_limited",
            format!("Zu viele Versuche. Bitte in {wait_time} Sekunden erneut versuchen."),
        ),
        // Fail-open wäre hier falsch: eine unbestimmbare IP darf die Bremse
        // nicht aushebeln.
        GovernorError::UnableToExtractKey => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            "Interner Fehler.".to_string(),
        ),
        GovernorError::Other { code, .. } => (code, "rate_limited", "Abgelehnt.".to_string()),
    };
    let body = serde_json::json!({ "error": { "code": code, "message": message } });
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .expect("Fehlerantwort baut sich")
}

/// Legt die Bremse auf die übergebenen Routen.
///
/// Der konkrete Layer-Typ hängt vom Key-Extractor ab und ist nicht benennbar
/// (die Middleware der `governor`-Crate ist dort privat), deshalb wird er in
/// beiden Zweigen an Ort und Stelle gebaut.
pub fn throttled<S>(routes: Router<S>, trust_proxy_headers: bool, burst: u32) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    let burst = burst.max(1);
    if trust_proxy_headers {
        let config = GovernorConfigBuilder::default()
            .key_extractor(SmartIpKeyExtractor)
            .per_second(replenish_seconds(burst))
            .burst_size(burst)
            .error_handler(error_response)
            .finish()
            .expect("gültige Governor-Konfiguration");
        routes.layer(GovernorLayer {
            config: Arc::new(config),
        })
    } else {
        let config = GovernorConfigBuilder::default()
            .key_extractor(PeerIpKeyExtractor)
            .per_second(replenish_seconds(burst))
            .burst_size(burst)
            .error_handler(error_response)
            .finish()
            .expect("gültige Governor-Konfiguration");
        routes.layer(GovernorLayer {
            config: Arc::new(config),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_matches_the_spec() {
        // 10 Versuche pro Viertelstunde, also alle 90 Sekunden einer nach.
        assert_eq!(DEFAULT_BURST_SIZE, 10);
        assert_eq!(WINDOW_SECONDS, 900);
        assert_eq!(replenish_seconds(DEFAULT_BURST_SIZE), 90);
    }

    #[test]
    fn replenish_rate_scales_with_the_burst_and_never_hits_zero() {
        assert_eq!(replenish_seconds(1), 900);
        assert_eq!(replenish_seconds(100), 9);
        // Sehr große Werte dürfen nicht auf 0 abrunden – das wäre "kein Limit".
        assert_eq!(replenish_seconds(10_000), 1);
        assert_eq!(replenish_seconds(0), 900);
    }

    #[test]
    fn too_many_requests_uses_the_shared_error_shape() {
        let res = error_response(GovernorError::TooManyRequests {
            wait_time: 42,
            headers: None,
        });
        assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(
            res.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
    }

    #[test]
    fn missing_key_is_an_internal_error_not_a_free_pass() {
        let res = error_response(GovernorError::UnableToExtractKey);
        assert_eq!(res.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn both_variants_build() {
        let _: Router<()> = throttled(Router::new(), true, DEFAULT_BURST_SIZE);
        let _: Router<()> = throttled(Router::new(), false, DEFAULT_BURST_SIZE);
    }
}
