import type { User } from '$lib/api/types';

/**
 * Nutzer und Access-Token (§13.3). Das Token lebt ausschließlich im Speicher —
 * niemals in localStorage (§8). Die Wiederherstellung nach einem Reload läuft
 * über das Refresh-Cookie.
 */
class SessionStore {
  user = $state<User | null>(null);
  accessToken = $state<string | null>(null);
  /** Unix-Zeit in ms, ab der das Token als abgelaufen gilt. */
  expiresAt = $state(0);
  /** true, solange die erste Wiederherstellung läuft. */
  loading = $state(true);

  get isAuthenticated(): boolean {
    return this.user !== null && this.accessToken !== null;
  }

  set(user: User, accessToken: string, expiresInSeconds: number) {
    this.user = user;
    this.accessToken = accessToken;
    this.expiresAt = Date.now() + expiresInSeconds * 1000;
    this.loading = false;
  }

  updateUser(user: User) {
    this.user = user;
  }

  clear() {
    this.user = null;
    this.accessToken = null;
    this.expiresAt = 0;
    this.loading = false;
  }
}

export const session = new SessionStore();
