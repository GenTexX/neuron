//! Kanonisches JSON + SHA-256 (16 Hex) – identisch zu `packages/engine/src/config-hash.ts` (§10.2).

use serde_json::Value;
use sha2::{Digest, Sha256};

pub fn canonical_json(value: &Value) -> String {
    let mut out = String::new();
    write_canonical(value, &mut out);
    out
}

fn write_canonical(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                out.push_str(&i.to_string());
            } else if let Some(u) = n.as_u64() {
                out.push_str(&u.to_string());
            } else if let Some(f) = n.as_f64() {
                out.push_str(&format_number(f));
            }
        }
        Value::String(s) => out.push_str(&serde_json::to_string(s).expect("string serializes")),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            out.push('{');
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).expect("key serializes"));
                out.push(':');
                write_canonical(&map[*key], out);
            }
            out.push('}');
        }
    }
}

/// Zahlenformat wie JavaScripts `String(n)` im Bereich ohne Exponentialschreibweise.
fn format_number(f: f64) -> String {
    if f == 0.0 {
        return "0".to_string();
    }
    if f.fract() == 0.0 && f.abs() < 1e21 {
        return format!("{f:.0}");
    }
    // Rusts Display liefert die kürzeste round-trip-fähige Darstellung ohne Exponent.
    format!("{f}")
}

pub fn config_hash(value: &Value) -> String {
    let canon = canonical_json(value);
    let digest = Sha256::digest(canon.as_bytes());
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    hex[..16].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const GOLDEN: &str = include_str!("../../../../packages/engine/test/golden/config-hash.json");

    #[derive(serde::Deserialize)]
    struct Case {
        name: String,
        config: Value,
        canonical: String,
        hash: String,
    }

    #[test]
    fn golden_matches_ts() {
        let cases: Vec<Case> = serde_json::from_str(GOLDEN).unwrap();
        assert!(cases.len() >= 5);
        for c in cases {
            assert_eq!(canonical_json(&c.config), c.canonical, "{}", c.name);
            assert_eq!(config_hash(&c.config), c.hash, "{}", c.name);
        }
    }

    #[test]
    fn float_formatting() {
        assert_eq!(canonical_json(&serde_json::json!(1.0)), "1");
        assert_eq!(canonical_json(&serde_json::json!(0.3)), "0.3");
        assert_eq!(canonical_json(&serde_json::json!(2.5)), "2.5");
        assert_eq!(canonical_json(&serde_json::json!(-0.0)), "0");
    }
}
