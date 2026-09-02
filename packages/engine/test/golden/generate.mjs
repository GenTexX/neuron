// Unabhängiger Golden-Generator (plain JS + node:crypto), damit die
// TS-Implementierungen (Rng, sha256, canonicalJson) gegen eine zweite
// Quelle geprüft werden. Aufruf: node test/golden/generate.mjs
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const seeds = [0, 1, 42, 2147483647, 4294967295];
const rng = {};
for (const seed of seeds) {
  const next = mulberry32(seed);
  rng[String(seed)] = Array.from({ length: 32 }, () => next());
}
writeFileSync(join(here, 'rng.json'), JSON.stringify(rng, null, 2) + '\n');

function canonical(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

const hashCases = [
  { name: 'empty-object', config: {} },
  { name: 'stroop-l1', config: { colors: 3, congruentRate: 0.57, deadlineMs: 2110, switchRule: false, trials: 30 } },
  { name: 'key-order', config: { z: 1, a: 2, m: { y: true, b: [3, 2, 1] } } },
  { name: 'float-int', config: { a: 1.0, b: 2.5, c: 0.3, d: 0, e: -7, f: 1e6 } },
  { name: 'strings', config: { ops: ['add', 'sub', 'mul'], s: 'Umlaut äöü ß', q: 'quote " and \\ backslash', n: 'new\nline' } },
  { name: 'nested', config: { angles: [90, 180, 270], ruleKinds: ['arith', 'geom'], deadlineMs: null } },
  { name: 'n-back-ranked', config: { n: 2, length: 40, isiMs: 2500, alphabet: 8, targetRate: 0.3 } },
];
const hashes = hashCases.map(({ name, config }) => {
  const canon = canonical(config);
  const hash = createHash('sha256').update(canon, 'utf8').digest('hex').slice(0, 16);
  return { name, config, canonical: canon, hash };
});
writeFileSync(join(here, 'config-hash.json'), JSON.stringify(hashes, null, 2) + '\n');

function fnv1a32(str) {
  const bytes = new TextEncoder().encode(str);
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
const fnv = ['', 'a', 'stroop:2026-09-02', 'n-back:2026-01-01', 'lights-out:2030-12-31'].map((s) => ({
  input: s,
  hash: fnv1a32(s),
}));
writeFileSync(join(here, 'fnv1a32.json'), JSON.stringify(fnv, null, 2) + '\n');

// SHA-256-Vektoren für die reine TS-Implementierung
const shaVectors = ['', 'abc', 'The quick brown fox jumps over the lazy dog', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000)].map((s) => ({
  input: s,
  hex: createHash('sha256').update(s, 'utf8').digest('hex'),
}));
writeFileSync(join(here, 'sha256.json'), JSON.stringify(shaVectors, null, 2) + '\n');
console.log('golden files written');
