//! HS256-Access-Token, 15 Minuten Gültigkeit (§8).

use chrono::Utc;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::ACCESS_TTL_SECONDS;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: i64,
    pub iat: i64,
    pub role: String,
}

pub struct JwtKeys {
    encoding: EncodingKey,
    decoding: DecodingKey,
}

impl JwtKeys {
    pub fn new(secret: &str) -> Self {
        Self {
            encoding: EncodingKey::from_secret(secret.as_bytes()),
            decoding: DecodingKey::from_secret(secret.as_bytes()),
        }
    }

    pub fn issue(&self, user_id: Uuid, role: &str) -> anyhow::Result<String> {
        let now = Utc::now().timestamp();
        let claims = Claims {
            sub: user_id.to_string(),
            exp: now + ACCESS_TTL_SECONDS,
            iat: now,
            role: role.to_string(),
        };
        Ok(jsonwebtoken::encode(
            &Header::default(),
            &claims,
            &self.encoding,
        )?)
    }

    pub fn verify(&self, token: &str) -> Option<Claims> {
        jsonwebtoken::decode::<Claims>(token, &self.decoding, &Validation::default())
            .ok()
            .map(|d| d.claims)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_and_verify() {
        let keys = JwtKeys::new("test-secret-mit-mindestens-32-zeichen!!");
        let id = Uuid::from_u128(42);
        let token = keys.issue(id, "user").unwrap();
        let claims = keys.verify(&token).expect("gültig");
        assert_eq!(claims.sub, id.to_string());
        assert_eq!(claims.role, "user");
        assert!(claims.exp > claims.iat);
        assert_eq!(claims.exp - claims.iat, ACCESS_TTL_SECONDS);
    }

    #[test]
    fn rejects_other_secret_and_garbage() {
        let a = JwtKeys::new("test-secret-mit-mindestens-32-zeichen!!");
        let b = JwtKeys::new("anderes-secret-mit-mindestens-32-zeich");
        let token = a.issue(Uuid::from_u128(1), "user").unwrap();
        assert!(b.verify(&token).is_none());
        assert!(a.verify("kein.jwt.hier").is_none());
    }
}
