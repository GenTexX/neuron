import { expect, test, type Page } from '@playwright/test';
import { register, uniqueUser } from './helpers';

/**
 * Mobile Passung. Diese Prüfungen fehlten, als die Spielansichten entstanden —
 * vier Spiele passten dadurch nicht auf ein 360×640-Display, und in Anagrammen
 * drückte das Textfeld den Bestätigen-Knopf aus dem Bild.
 *
 * Gemessen wird das, was der Nutzer merkt: Muss ich schieben? Kann ich
 * rauszoomen? Treffe ich die Knöpfe?
 */

const GAMES = [
  'stroop',
  'go-nogo',
  'n-back',
  'mental-chain',
  'number-sequence',
  'corsi',
  'schulte',
  'lights-out',
  'anagram',
  'mental-rotation',
] as const;

/** Untergrenze für Bedienelemente außerhalb der Antworteingaben. */
const MIN_TAP = 44;

type Overflow = { x: number; y: number; offenders: string[] };

async function overflow(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    const offenders: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > vw + 0.5 || r.left < -0.5) {
        const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
        offenders.push(
          `${el.tagName.toLowerCase()}.${cls} (${Math.round(r.left)}…${Math.round(r.right)})`,
        );
      }
    }
    return {
      x: Math.round(de.scrollWidth - vw),
      y: Math.round(de.scrollHeight - de.clientHeight),
      offenders: offenders.slice(0, 4),
    };
  });
}

async function smallTargets(page: Page, min: number): Promise<string[]> {
  return page.evaluate((limit) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('button, a[href], input, select')) {
      // Der Sprunglink ist absichtlich erst bei Tastaturfokus sichtbar.
      if (el.classList.contains('skip')) continue;
      // Bei Kästchen und Radios ist das umschließende Label die Trefferfläche –
      // ein Tipp darauf schaltet mit. Also dieses messen, nicht das Kästchen.
      const input = el as HTMLInputElement;
      const isBox = input.type === 'checkbox' || input.type === 'radio';
      const target = isBox ? (el.closest('label') ?? el) : el;
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < limit) {
        const label = (el.textContent || '').trim().slice(0, 24) || el.tagName.toLowerCase();
        out.push(`${label} (${Math.round(r.width)}×${Math.round(r.height)})`);
      }
    }
    return out;
  }, min);
}

async function startRun(page: Page, id: string) {
  await page.goto(`/play/${id}?mode=training`);
  await page.getByRole('button', { name: 'Start' }).click();
  // Countdown abwarten, dann steht die Spielansicht.
  await expect(page.getByText(/Aufgabe \d+ von|Suche|Züge/).first()).toBeVisible({
    timeout: 20_000,
  });
}

test.describe('Mobile Passung', () => {
  test.skip(({ isMobile }) => !isMobile, 'gilt nur für den Mobile-Viewport');

  test('keine Ansicht ist breiter als der Bildschirm', async ({ page }) => {
    await register(page, uniqueUser('mobw'));
    for (const path of ['/', '/games', '/games/anagram', '/games/stroop/leaderboard', '/me']) {
      await page.goto(path);
      await page.waitForTimeout(400);
      const o = await overflow(page);
      expect(o.x, `${path} ragt ${o.x}px heraus: ${o.offenders.join(', ')}`).toBeLessThanOrEqual(0);
    }
  });

  test('kein Bedienelement ist kleiner als 44px hoch', async ({ page }) => {
    await register(page, uniqueUser('mobt'));
    for (const path of ['/', '/games', '/games/anagram', '/me']) {
      await page.goto(path);
      await page.waitForTimeout(400);
      const small = await smallTargets(page, MIN_TAP);
      expect(small, `${path}: zu klein — ${small.join(', ')}`).toEqual([]);
    }
  });

  for (const id of GAMES) {
    test(`${id}: passt ohne Scrollen auf den Bildschirm`, async ({ page }) => {
      await register(page, uniqueUser(`m${id.replace(/-/g, '')}`.slice(0, 14)));
      await startRun(page, id);

      const o = await overflow(page);
      expect(o.x, `${id} ragt ${o.x}px nach rechts: ${o.offenders.join(', ')}`).toBeLessThanOrEqual(
        0,
      );
      // Während eines Runs darf nicht gescrollt werden müssen: der Stimulus
      // wäre sonst beim Antworten aus dem Bild.
      expect(o.y, `${id} ist ${o.y}px zu hoch`).toBeLessThanOrEqual(0);
    });
  }

  test('Anagramme: Buchstaben bleiben sichtbar, wenn die Tastatur aufgeht', async ({ page }) => {
    await register(page, uniqueUser('mobkb'));
    await startRun(page, 'anagram');

    // interactive-widget=resizes-content verkleinert das Layout-Viewport,
    // sobald die Tastatur erscheint – genau das bildet setViewportSize ab.
    await page.setViewportSize({ width: 360, height: 300 });
    await page.locator('input[type="text"]').focus();
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => {
      const vh = document.documentElement.clientHeight;
      const inside = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.top >= -1 && r.bottom <= vh + 1;
      };
      return {
        stage: inside('.stage'),
        input: inside('input[type="text"]'),
        overflowY: Math.round(document.documentElement.scrollHeight - vh),
      };
    });

    expect(state.stage, 'die Buchstaben sind aus dem Bild gescrollt').toBe(true);
    expect(state.input, 'das Eingabefeld liegt unter der Tastatur').toBe(true);
    expect(state.overflowY, 'die Seite muss gescrollt werden').toBeLessThanOrEqual(0);
  });
});
