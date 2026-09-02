import { describe, expect, it } from 'vitest';
import { canonicalJson, configHash } from '../src/config-hash';
import { sha256, toHex } from '../src/sha256';
import { utf8Encode } from '../src/utf8';
import golden from './golden/config-hash.json';
import shaGolden from './golden/sha256.json';

describe('sha256 (reine TS-Implementierung)', () => {
  for (const { input, hex } of shaGolden as { input: string; hex: string }[]) {
    it(`sha256 von ${input.length} Zeichen`, () => {
      expect(toHex(sha256(utf8Encode(input)))).toBe(hex);
    });
  }
});

describe('Config-Hash – Golden-File (§10.2)', () => {
  for (const c of golden as { name: string; config: unknown; canonical: string; hash: string }[]) {
    it(`${c.name}: kanonische Form`, () => {
      expect(canonicalJson(c.config)).toBe(c.canonical);
    });
    it(`${c.name}: Hash`, () => {
      expect(configHash(c.config)).toBe(c.hash);
    });
  }

  it('ist unabhängig von der Schlüsselreihenfolge', () => {
    expect(configHash({ a: 1, b: 2 })).toBe(configHash({ b: 2, a: 1 }));
  });

  it('lässt undefined-Felder aus', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('formatiert ganzzahlige Floats ohne Dezimalpunkt', () => {
    expect(canonicalJson({ x: 2.0 })).toBe('{"x":2}');
    expect(canonicalJson(-0)).toBe('0');
  });

  it('lehnt nicht kanonisierbare Zahlen ab', () => {
    expect(() => canonicalJson(1e21)).toThrow();
    expect(() => canonicalJson(1e-7)).toThrow();
    expect(() => canonicalJson(Number.NaN)).toThrow();
  });
});
