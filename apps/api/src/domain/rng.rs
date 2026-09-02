//! mulberry32 – bitidentisch zu `packages/engine/src/rng.ts` (§5.1).

pub struct Rng {
    s: u32,
}

impl Rng {
    pub fn new(seed: u32) -> Self {
        Self { s: seed }
    }

    pub fn next_u32(&mut self) -> u32 {
        self.s = self.s.wrapping_add(0x6d2b_79f5);
        let mut t = self.s;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    pub fn next_below(&mut self, n: u32) -> u32 {
        assert!(n > 0);
        let threshold = ((1u64 << 32) % n as u64) as u32;
        loop {
            let r = self.next_u32();
            if r >= threshold {
                return r % n;
            }
        }
    }
}

/// FNV-1a 32 Bit über UTF-8-Bytes; für den Ranked-Seed (§10.3).
pub fn fnv1a32(input: &str) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for b in input.as_bytes() {
        h ^= *b as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    const RNG_GOLDEN: &str = include_str!("../../../../packages/engine/test/golden/rng.json");
    const FNV_GOLDEN: &str = include_str!("../../../../packages/engine/test/golden/fnv1a32.json");

    #[test]
    fn golden_file_matches_ts() {
        let golden: BTreeMap<String, Vec<u32>> = serde_json::from_str(RNG_GOLDEN).unwrap();
        assert_eq!(golden.len(), 5);
        for (seed, expected) in golden {
            let mut rng = Rng::new(seed.parse().unwrap());
            let got: Vec<u32> = (0..32).map(|_| rng.next_u32()).collect();
            assert_eq!(got, expected, "seed {seed}");
        }
    }

    #[test]
    fn fnv_golden_matches_ts() {
        #[derive(serde::Deserialize)]
        struct Case {
            input: String,
            hash: u32,
        }
        let cases: Vec<Case> = serde_json::from_str(FNV_GOLDEN).unwrap();
        for c in cases {
            assert_eq!(fnv1a32(&c.input), c.hash, "{}", c.input);
        }
    }

    #[test]
    fn next_below_in_range() {
        let mut rng = Rng::new(7);
        for i in 0..1000u32 {
            let n = 1 + (i % 17);
            assert!(rng.next_below(n) < n);
        }
    }
}
