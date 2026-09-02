export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'neuron:theme';

function read(): ThemeChoice {
  if (typeof localStorage === 'undefined') return 'system';
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/** Hell/Dunkel/System (§13.3). Einziger Ort, der `data-theme` setzt. */
class ThemeStore {
  choice = $state<ThemeChoice>('system');
  /** Tatsächlich angewandtes Theme, nach Auflösung von `system`. */
  resolved = $state<'light' | 'dark'>('light');

  init() {
    this.choice = read();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      this.resolved = this.choice === 'system' ? (media.matches ? 'dark' : 'light') : this.choice;
      document.documentElement.dataset.theme = this.resolved;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }

  set(choice: ThemeChoice) {
    this.choice = choice;
    try {
      if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Privater Modus o. Ä. – das Theme gilt dann nur für diese Sitzung.
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    this.resolved = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice;
    document.documentElement.dataset.theme = this.resolved;
  }
}

export const theme = new ThemeStore();
