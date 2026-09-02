import { expect, test } from '@playwright/test';
import { register, uniqueUser } from './helpers';

test('Stroop ist vollständig mit der Tastatur bedienbar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Tastaturkürzel gelten für Desktop');
  await register(page, uniqueUser('kbd'));

  await page.goto('/play/stroop?mode=training');
  await page.getByRole('button', { name: 'Start' }).click();

  const buttons = page.getByRole('group', { name: 'Antwort wählen' }).getByRole('button');
  await expect(buttons.first()).toBeEnabled({ timeout: 15_000 });

  // §7.2: Ziffern 1…n bei n Optionen. Auf jeden Trial warten statt auf Zeiten.
  for (let i = 1; i <= 30; i++) {
    await expect(page.getByText(`Aufgabe ${i} von 30`)).toBeVisible({ timeout: 20_000 });
    await expect(buttons.first()).toBeEnabled({ timeout: 20_000 });
    await page.keyboard.press('1');
  }
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
});

test('Eingabeflächen erfüllen die Mindestgröße', async ({ page }) => {
  await register(page, uniqueUser('hit'));
  await page.goto('/play/stroop?mode=training');
  await page.getByRole('button', { name: 'Start' }).click();

  const button = page.getByRole('group', { name: 'Antwort wählen' }).getByRole('button').first();
  await expect(button).toBeEnabled({ timeout: 15_000 });
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  // §7.2: mindestens 56 × 56 px Trefferfläche.
  expect(box!.height).toBeGreaterThanOrEqual(56);
  expect(box!.width).toBeGreaterThanOrEqual(56);
});

test('Die Seite hat einen Sprunglink und eine Hauptregion', async ({ page }) => {
  await page.goto('/games');
  await expect(page.getByRole('link', { name: 'Zum Inhalt springen' })).toBeAttached();
  await expect(page.getByRole('main')).toBeVisible();
});

test('Das Manifest ist erreichbar und installierbar konfiguriert', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    /manifest\.webmanifest/,
  );
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as {
    display: string;
    icons: { sizes: string; purpose?: string }[];
  };
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
});
