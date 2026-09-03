import { expect, type Page } from '@playwright/test';

/** Eindeutige Testidentität, damit Läufe sich nicht gegenseitig stören. */
export function uniqueUser(prefix: string) {
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  return {
    email: `${prefix}-${id}@example.org`,
    password: 'einsicheres-passwort',
    displayName: `${prefix}-${id}`.slice(0, 32),
  };
}

export async function register(page: Page, user: ReturnType<typeof uniqueUser>) {
  await page.goto('/register');
  await page.getByLabel('E-Mail').fill(user.email);
  await page.getByLabel('Passwort').fill(user.password);
  await page.getByLabel('Anzeigename').fill(user.displayName);
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
}

/**
 * Spielt einen Stroop-Run zu Ende: wartet je Trial auf das Farbwort und tippt
 * eine Antwort. Die Richtigkeit ist für die Suite unerheblich — geprüft wird
 * der Weg bis zum Ergebnis.
 */
export async function playStroop(page: Page, trials: number, humanLike = false) {
  const buttons = page.getByRole('group', { name: 'Antwort wählen' }).getByRole('button');
  for (let i = 1; i <= trials; i++) {
    // Auf genau diesen Trial warten, statt auf feste Zeiten zu setzen.
    await expect(page.getByText(`Aufgabe ${i} von ${trials}`)).toBeVisible({ timeout: 20_000 });
    await expect(buttons.first()).toBeEnabled({ timeout: 20_000 });
    /*
     * `humanLike` wartet vor dem Tippen. Ohne das liegen die Reaktionszeiten
     * unter 120 ms und der Server verwirft den Run als `superhuman_rt` – für
     * die reinen Wegtests egal, für Prüfungen auf `valid` nicht.
     */
    if (humanLike) await page.waitForTimeout(300 + Math.floor(Math.random() * 400));
    await buttons.first().click();
  }
}
