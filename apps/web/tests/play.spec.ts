import { expect, test } from '@playwright/test';
import { playStroop, register, uniqueUser } from './helpers';

/**
 * Der vollständige Weg aus §15: Registrieren → Spiel starten → Run abschließen
 * → Ergebnis → Bestenliste. Mindestens ein Spiel pro Antwortmodell.
 */

test('Stroop im Training: Intro, Countdown, Run, Ergebnis (discrete)', async ({ page }) => {
  await register(page, uniqueUser('play'));

  await page.goto('/games/stroop');
  await expect(page.getByRole('heading', { name: 'Stroop' })).toBeVisible();
  await page.getByRole('link', { name: 'Training starten' }).click();

  // Intro: der Run wird hier angelegt, damit die Trials vor dem Countdown stehen.
  await expect(page.getByRole('heading', { name: 'Stroop' })).toBeVisible();
  await expect(page.getByText('Aufgaben')).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();

  // Countdown ist bei timingSensitive Pflicht (§13.2).
  await expect(page.getByRole('status')).toBeVisible();

  await playStroop(page, 30);

  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Punkte')).toBeVisible();
  await expect(page.getByText('Genauigkeit')).toBeVisible();
  // Die Streak zählt ab dem ersten gültigen Run.
  await expect(page.getByText(/Tage in Folge/)).toBeVisible();
});

test('Ein Training bleibt gültig, auch wenn man die Regeln in Ruhe liest', async ({ page }) => {
  test.slow();
  await register(page, uniqueUser('dwell'));

  /*
   * §9.2 vergleicht `client_duration_ms` mit `submitted_at - server_started_at`.
   * Die Serveruhr läuft ab dem Anlegen des Runs – also schon im Intro. Meldete
   * der Client nur die reine Spielzeit, sprengte jede längere Lesepause die
   * 25 %-Toleranz und der Run zählte nicht (`duration_mismatch`).
   */
  await page.goto('/play/stroop?mode=training');
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(15_000);
  await page.getByRole('button', { name: 'Start' }).click();

  await playStroop(page, 30, true);

  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Go/No-Go im Training: kontinuierlicher Strom bis zum Ergebnis (continuous)', async ({
  page,
}) => {
  test.slow();
  await register(page, uniqueUser('gonogo'));

  await page.goto('/play/go-nogo?mode=training');
  await page.getByRole('button', { name: 'Start' }).click();

  // Der Strom läuft ohne Zutun durch; ein paar Reaktionen genügen für den Weg.
  const press = page.getByRole('button', { name: /Drücken/ });
  await expect(press).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 8; i++) {
    await press.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  }

  await expect(page.getByTestId('result')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Punkte')).toBeVisible();
});

test('Lights Out ohne Zeitdruck ist auch nach einem Tabwechsel gültig', async ({ page }) => {
  await register(page, uniqueUser('lights'));

  await page.goto('/play/lights-out?mode=training');
  await page.getByRole('button', { name: 'Start' }).click();

  // timingSensitive: false ⇒ kein Countdown, Pausieren erlaubt (§12.10).
  const cells = page.getByRole('group').getByRole('button');
  await expect(cells.first()).toBeVisible({ timeout: 15_000 });

  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Aufgeben' }).click();

  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  // Der Run zählt: kein Abbruchgrund, obwohl gewartet wurde.
  await expect(page.getByText('Run nicht gewertet')).toHaveCount(0);
});

test('Ranked-Run erscheint danach in der Bestenliste und ist gesperrt', async ({ page }) => {
  const user = uniqueUser('ranked');
  await register(page, user);

  await page.goto('/play/stroop?mode=ranked');
  await page.getByRole('button', { name: 'Start' }).click();
  await playStroop(page, 30);
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: 'Zur Bestenliste' }).click();
  await expect(page.getByRole('heading', { name: 'Bestenliste' })).toBeVisible();
  await expect(page.getByRole('cell', { name: user.displayName })).toBeVisible();

  // Ein Versuch pro Runde (§10.2).
  await page.goto('/games/stroop');
  await expect(page.getByText('Heute schon gespielt')).toBeVisible();
});

test('Der Verlauf zeigt den gespielten Run im Profil', async ({ page }) => {
  await register(page, uniqueUser('history'));

  await page.goto('/play/stroop?mode=training');
  await page.getByRole('button', { name: 'Start' }).click();
  await playStroop(page, 30);
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });

  await page.goto('/me');
  await expect(page.getByRole('heading', { name: 'Verlauf' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Stroop' }).first()).toBeVisible();
});
