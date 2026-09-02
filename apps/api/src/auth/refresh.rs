//! Opakes Refresh-Token: 32 zufällige Bytes, base64url; in der DB nur als SHA-256 (§8).

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use sha2::{Digest, Sha256};

pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn token_hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// Zufällige Nonce für einen Run (§4.1).
pub fn generate_nonce() -> Vec<u8> {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.to_vec()
}

pub fn encode_b64(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn decode_b64(s: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(s.as_bytes()).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_unique_and_hashable() {
        let a = generate_token();
        let b = generate_token();
        assert_ne!(a, b);
        assert_eq!(a.len(), 43); // 32 Bytes base64url ohne Padding
        assert_eq!(token_hash(&a).len(), 32);
        assert_eq!(token_hash(&a), token_hash(&a));
        assert_ne!(token_hash(&a), token_hash(&b));
    }

    #[test]
    fn nonce_roundtrip() {
        let n = generate_nonce();
        assert_eq!(n.len(), 16);
        assert_eq!(decode_b64(&encode_b64(&n)), Some(n));
        assert_eq!(decode_b64("nicht base64!!"), None);
    }
}
