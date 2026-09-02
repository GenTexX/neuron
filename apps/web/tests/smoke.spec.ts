import { expect, test } from '@playwright/test';
import { register, uniqueUser } from './helpers';

test('Startseite lädt und der Katalog zeigt alle zehn Spiele', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Neuron' }).first()).toBeVisible();

  await page.goto('/games');
  await expect(page.getByRole('heading', { name: 'Spiele' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(10);
});

test('Katalog lässt sich nach Kategorie filtern', async ({ page }) => {
  await page.goto('/games');
  await page.getByRole('button', { name: 'Aufmerksamkeit' }).click();
  const headings = page.getByRole('heading', { level: 3 });
  await expect(headings).toHaveCount(3); // stroop, go-nogo, schulte
  await expect(page.getByRole('heading', { name: 'Stroop' })).toBeVisible();
});

test('Registrieren, abmelden und wieder anmelden', async ({ page }) => {
  const user = uniqueUser('auth');
  await register(page, user);
  await expect(page.getByRole('link', { name: 'Profil' })).toBeVisible();

  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByRole('link', { name: 'Anmelden' })).toBeVisible();

  await page.getByRole('link', { name: 'Anmelden' }).click();
  await page.getByLabel('E-Mail').fill(user.email);
  await page.getByLabel('Passwort').fill(user.password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
});

test('Anmeldung mit falschem Passwort wird abgewiesen', async ({ page }) => {
  const user = uniqueUser('wrong');
  await register(page, user);
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByRole('link', { name: 'Anmelden' })).toBeVisible();

  await page.getByRole('link', { name: 'Anmelden' }).click();
  await page.getByLabel('E-Mail').fill(user.email);
  await page.getByLabel('Passwort').fill('falsches-passwort');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('alert')).toContainText('stimmt nicht');
});

test('Die Sitzung überlebt einen Reload (Refresh-Cookie)', async ({ page }) => {
  await register(page, uniqueUser('reload'));
  await page.reload();
  await expect(page.getByRole('link', { name: 'Profil' })).toBeVisible();
});

test('Ohne Anmeldung führt /play zur Anmeldung', async ({ page }) => {
  await page.goto('/play/stroop?mode=training');
  await expect(page).toHaveURL(/\/login/);
});
