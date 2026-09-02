//! Argon2id mit OWASP-Minimum m=19456 KiB, t=2, p=1 (§8).

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};

fn argon2() -> Argon2<'static> {
    let params = Params::new(19_456, 2, 1, None).expect("gültige Argon2-Parameter");
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = argon2()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("hashing failed: {e}"))?;
    Ok(hash.to_string())
}

pub fn verify_password(password: &str, stored: &str) -> bool {
    match PasswordHash::new(stored) {
        Ok(parsed) => argon2()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_and_verify() {
        let h = hash_password("korrektes-passwort").unwrap();
        assert!(h.starts_with("$argon2id$"));
        assert!(verify_password("korrektes-passwort", &h));
        assert!(!verify_password("falsches-passwort", &h));
        assert!(!verify_password("x", "kein-hash"));
    }

    #[test]
    fn same_password_different_hashes() {
        assert_ne!(
            hash_password("abcabcabca").unwrap(),
            hash_password("abcabcabca").unwrap()
        );
    }
}
