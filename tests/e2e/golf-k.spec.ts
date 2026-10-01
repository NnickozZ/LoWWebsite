import { expect, test, type Page } from '@playwright/test';
import { openNewEntry, signIn } from './helpers';

/**
 * Golf K — Nicks drie punten van 29 september en de open eindjes van golf J.
 *
 * Wat dit vasthoudt (de omslag op de telefoon en de pagina in het midden
 * staan in `ronde-67-de-leeskamer` L5 en `golf-h1-schil` D5):
 *
 *  1. **De tabrij op de voorpagina van de wiki** is die van elke wikipagina:
 *     elke tab is een pagina, en er is geen tab die alleen naar beneden
 *     springt (*De soorten* lichtte op en deed op een computer niets).
 *  2. **Het huisraadblad op een telefoon**: *Aanmaken* staat onderaan het blad
 *     in beeld, zonder veeg (rij 20 van de meting, 8,5 → 8).
 *  3. **De namen op een landkaart** (M3): namen die elkaar zouden raken,
 *     wijken uit of zijn weg; er liggen er geen twee over elkaar.
 *  4. **Een lange naam op de tijdlijn** (M2) staat op twee regels.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;
const SHOTS = 'test-results/golf-k';

test('1: de tabrij op /wiki is die van elke wikipagina, zonder sprong naar beneden', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, ...KEEPER);
  await page.goto('/wiki');
  const tabs = page.getByRole('navigation', { name: 'Soorten' });
  await expect(tabs.getByRole('link', { name: 'Start' })).toHaveAttribute('aria-current', 'page');
  await expect(tabs.locator('a[href^="#"]')).toHaveCount(0);
  // Golf N: geen *Meer soorten* meer; elke soort staat in de rij.
  await expect(tabs.getByTestId('meer-soorten')).toHaveCount(0);
  // De eerste soort in de rij (na Start, Alles en sinds golf O Wiki geschiedenis) gaat naar haar eigen lijst.
  const soort = tabs.locator('a.type-tab').nth(3);
  await expect(soort).toBeVisible();
  const href = await soort.getAttribute('href');
  expect(href).toMatch(/^\/wiki\/[^/?#]+/);
  await soort.click();
  await page.waitForURL((url) => url.pathname === href!.split('?')[0]);
  await expect(page.getByRole('navigation', { name: 'Soorten' }).locator('[aria-current="page"]')).toHaveAttribute(
    'href',
    href!,
  );
});

test('2: op een telefoon staat Aanmaken van het huisraadblad onderaan in beeld', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'het blad past op een computer');
  test.setTimeout(120_000);
  await signIn(page, ...KEEPER);
  await page.goto('/');
  const sheet = await openNewEntry(page);
  const actions = sheet.getByTestId('new-entry-actions');
  // Een gewoon artikel: het blad past, niets plakt.
  await expect(actions).not.toHaveClass(/sheet-actions-stick/);

  await sheet.getByRole('radio', { name: 'Huisraad', exact: true }).click();
  await expect(sheet.getByTestId('new-entry-winkel')).toBeVisible();
  await expect(actions).toHaveClass(/sheet-actions-stick/);
  // Wat de lengte van het blad ook is: Aanmaken staat zonder veeg in beeld, boven de onderrand.
  const create = sheet.getByRole('button', { name: 'Aanmaken', exact: true });
  const box = (await create.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThan(viewport.height / 2);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  const hit = await create.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  expect(hit, 'niets ligt over Aanmaken').toBe(true);
  await page.screenshot({ path: `${SHOTS}/huisraadblad-phone.png` });
});

async function picture(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#d9d2b8' } })
    .png()
    .toBuffer();
}

type Box = { left: number; top: number; right: number; bottom: number };
const overlap = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function labelBoxes(page: Page) {
  return page.locator('.map-pin-label').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        spot: el.getAttribute('data-label'),
        opacity: Number(getComputedStyle(el).opacity),
        box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      };
    }),
  );
}

test('3: namen op een landkaart liggen niet over elkaar', async ({ page }, info) => {
  test.setTimeout(150_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  const made = await page.request.post('/api/maps', {
    multipart: { name: `K kaart ${stamp}`, file: { name: 'k.png', mimeType: 'image/png', buffer: await picture() } },
  });
  expect(made.ok()).toBe(true);
  const { map } = (await made.json()) as { map: { id: string; slug: string } };
  // Zes spelden op één rij, dicht genoeg dat hun namen elkaar raken maar niet
  // zo dicht dat `clusterPins` ze samenneemt.
  const names = ['Het oude veer', 'De vuurtoren van Westkapelle', 'Molen De Hoop', 'Het Sloe', 'Arnemuiden haven', 'De Nolle'];
  for (const [i, name] of names.entries()) {
    const pin = await page.request.post(`/api/maps/${map.id}/pins`, {
      data: { kind: 'note', name, x: 0.2 + i * 0.12, y: 0.5 },
    });
    expect(pin.ok()).toBe(true);
  }
  await page.goto(`/maps/${map.slug}`);
  await expect(page.locator('.map-pin')).toHaveCount(names.length, { timeout: 20_000 });
  // De plaatser heeft de namen gemeten en gekozen.
  await expect(page.locator('.map-pins')).toHaveAttribute('data-labels', 'gemeten', { timeout: 10_000 });
  await page.waitForTimeout(300);
  const labels = await labelBoxes(page);
  const shown = labels.filter((label) => label.spot !== 'weg');
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      expect(overlap(shown[i].box, shown[j].box), `${JSON.stringify(shown[i])} × ${JSON.stringify(shown[j])}`).toBe(false);
    }
  }
  for (const hidden of labels.filter((label) => label.spot === 'weg')) expect(hidden.opacity).toBe(0);
  await page.screenshot({ path: `${SHOTS}/kaartnamen-${info.project.name}.png` });

  // Een verborgen naam komt terug als de speld gekozen is.
  const weg = page.locator('.map-pin:has(.map-pin-label[data-label="weg"])').first();
  if (await weg.count()) {
    await weg.locator('.map-pin-head').click();
    await expect(page.locator('.map-pin-selected .map-pin-label')).not.toHaveAttribute('data-label', 'weg');
  }
});

test('4: een lange naam op de tijdlijn staat op twee regels', async ({ page }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  const made = await page.request.post('/api/timelines', { data: { name: `K tijdlijn ${stamp}`, scale: 'day' } });
  expect(made.ok()).toBe(true);
  const { timeline } = (await made.json()) as { timeline: { id: string; slug: string } };
  const long = 'De nacht dat de dijk bij Westkapelle het begaf';
  const ev = await page.request.post(`/api/timelines/${timeline.id}/events`, {
    data: { kind: 'note', name: long, text: '', at: Math.floor(Date.UTC(1931, 2, 12) / 1000) },
  });
  expect(ev.ok()).toBe(true);
  await page.goto(`/timelines/${timeline.slug}`);
  const tag = page.locator('.timeline-tag').filter({ hasText: 'De nacht dat' });
  await expect(tag).toBeVisible({ timeout: 20_000 });
  await expect(tag).toHaveClass(/timeline-tag-2/);
  const name = tag.locator('.timeline-tag-name');
  // Twee regels van 18 px, en het einde van de naam is te lezen (niets afgekapt).
  const lines = await name.evaluate((el) => Math.round(el.getBoundingClientRect().height / 18));
  expect(lines).toBe(2);
  expect(await name.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/tijdlijn-${info.project.name}.png` });
});
