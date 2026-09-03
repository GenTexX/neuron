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

test('Schulte: das Ergebnis zeigt Fehltipps statt einer nichtssagenden Quote', async ({ page }) => {
  await register(page, uniqueUser('schulte'));

  /*
   * Ein Schulte-Run besteht aus einer einzigen Aufgabe (§12.6). Die Genauigkeit
   * `correctCount / trialCount` ist damit immer 0 % oder 100 % – nach drei
   * Fehltipps stand trotzdem „100 %“. Richtig gerechnet, aber nichtssagend.
   */
  await page.goto('/play/schulte?mode=training');
  // §7.4 steht jetzt im Intro, damit das Level nicht willkürlich wirkt.
  await expect(page.getByText(/Drei Runs in Folge/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Start' }).click();

  const cells = page.getByRole('group').getByRole('button');
  await expect(cells.first()).toBeVisible({ timeout: 20_000 });
  const count = await cells.count();
  const labels: string[] = [];
  for (let i = 0; i < count; i++) labels.push(((await cells.nth(i).innerText()) ?? '').trim());

  // Zwei bewusste Fehltipps, dann die Tabelle korrekt zu Ende.
  let wrong = 0;
  for (let n = 1; n <= count; n++) {
    const want = String(n);
    if (wrong < 2) {
      await cells.nth(labels.findIndex((l) => l !== want)).click();
      wrong++;
      await page.waitForTimeout(120);
    }
    await cells.nth(labels.indexOf(want)).click();
    await page.waitForTimeout(120);
  }

  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Genauigkeit')).toHaveCount(0);
  await expect(page.getByText('Geschafft')).toBeVisible();
  await expect(page.getByText('Fehltipps')).toBeVisible();
  // §7.4: der Weg zum nächsten Level muss sichtbar sein.
  await expect(page.getByText(/Noch 2 Runs mit mindestens 80 %/)).toBeVisible();
  await page.goto('/games/schulte');
  await expect(page.getByText(/Noch 2 Runs mit mindestens 80 %/)).toBeVisible({ timeout: 20_000 });
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
