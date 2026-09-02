import { sha256, toHex } from './sha256';
import { utf8Encode } from './utf8';

/**
 * Kanonische JSON-Repräsentation (§10.2):
 * - Objektschlüssel alphabetisch (Code-Unit-Reihenfolge) sortiert, rekursiv
 * - keine Whitespaces
 * - Zahlen ohne führende Nullen; ganzzahlige Werte ohne Dezimalpunkt (1.0 → "1")
 * - `undefined`-Werte werden wie in JSON.stringify ausgelassen
 *
 * Einschränkung (dokumentiert in docs/CONTEXT.md): Zahlen müssen endlich sein
 * und dürfen keine Exponentialschreibweise erfordern (|x| < 1e21, |x| >= 1e-6
 * oder 0), damit TS und Rust identisch formatieren.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number': {
      if (!Number.isFinite(value)) throw new Error('canonicalJson: non-finite number');
      if (Object.is(value, -0)) return '0';
      const abs = Math.abs(value);
      if (abs !== 0 && (abs >= 1e21 || abs < 1e-6)) {
        throw new Error('canonicalJson: number requires exponent notation, not canonicalizable');
      }
      return String(value);
    }
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return '[' + value.map((v) => canonicalJson(v === undefined ? null : v)).join(',') + ']';
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
    }
    default:
      throw new Error(`canonicalJson: unsupported type ${typeof value}`);
  }
}

/** SHA-256 der kanonischen JSON-Form, gekürzt auf 16 Hex-Zeichen (§10.2). */
export function configHash(config: unknown): string {
  const bytes = utf8Encode(canonicalJson(config));
  return toHex(sha256(bytes)).slice(0, 16);
}
