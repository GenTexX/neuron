const STORAGE_KEY = 'neuron:settings';

export type Settings = {
  /** Zusätzlich zu `prefers-reduced-motion`; überschreibt es nie nach unten. */
  reducedMotion: boolean;
  sound: boolean;
  haptics: boolean;
};

const DEFAULTS: Settings = { reducedMotion: false, sound: false, haptics: true };

/** Reduzierte Bewegung, Ton, Haptik (§13.3). */
class SettingsStore {
  reducedMotion = $state(DEFAULTS.reducedMotion);
  sound = $state(DEFAULTS.sound);
  haptics = $state(DEFAULTS.haptics);

  init() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Settings>;
      this.reducedMotion = parsed.reducedMotion ?? DEFAULTS.reducedMotion;
      this.sound = parsed.sound ?? DEFAULTS.sound;
      this.haptics = parsed.haptics ?? DEFAULTS.haptics;
    } catch {
      // Ungültige Daten: bei den Standardwerten bleiben.
    }
  }

  update(patch: Partial<Settings>) {
    if (patch.reducedMotion !== undefined) this.reducedMotion = patch.reducedMotion;
    if (patch.sound !== undefined) this.sound = patch.sound;
    if (patch.haptics !== undefined) this.haptics = patch.haptics;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          reducedMotion: this.reducedMotion,
          sound: this.sound,
          haptics: this.haptics,
        }),
      );
    } catch {
      // Speichern ist optional.
    }
  }

  /** true, wenn Animationen unterdrückt werden sollen. */
  get suppressMotion(): boolean {
    if (this.reducedMotion) return true;
    return typeof matchMedia !== 'undefined'
      ? matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  }

  vibrate(pattern: number | number[]) {
    if (!this.haptics) return;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  }
}

export const settings = new SettingsStore();
