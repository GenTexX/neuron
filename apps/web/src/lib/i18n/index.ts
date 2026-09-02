import { de, type TranslationKey } from './de';

/**
 * Übersetzt einen Schlüssel und ersetzt `{platzhalter}` durch die übergebenen
 * Werte. Unbekannte Schlüssel geben den Schlüssel selbst zurück, damit ein
 * fehlender String sichtbar, aber nicht fatal ist.
 */
export function t(key: TranslationKey | string, params?: Record<string, string | number>): string {
  const raw = (de as Record<string, string>)[key];
  if (raw === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] fehlender Schlüssel: ${key}`);
    return key;
  }
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function gameName(id: string): string {
  return t(`game.${id}.name`);
}

export function categoryName(category: string): string {
  return t(`category.${category}`);
}

export type { TranslationKey };
