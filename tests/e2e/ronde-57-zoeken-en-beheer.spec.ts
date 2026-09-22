import { expect, test, type Page } from '@playwright/test';
import { inviteCode, signIn } from './helpers';

/**
 * §96 (ronde 57): zoeken, Beheer en de losse eindjes.
 *
 *   zoeken   een speler vindt een dossier, tijdlijn, stamboom en prikbord van
 *            de tafel op naam — en van de Keeper-only tweeling van elk
 *            **niets**: geen naam in de pagina, geen rij in het antwoord;
 *   woorden  de groepen staan ingeklapt, het zoekvak klapt open wat past, de
 *            voet met Opslaan plakt in beeld;
 *   soorten  een nieuwe soort klapt open, in beeld, met de focus op
 *            *Veld toevoegen*; *Nieuwe soort* staat boven de lijst;
 *   /you     lettertype en kleuren staan boven de voorstellen en het
 *            wachtwoord, en de uitleg is één regel met *Waarom?*.
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

async function signUpAs(page: Page, name: string) {
  await page.goto('/signup');
  await page.getByLabel('Uitnodigingscode').fill(inviteCode());
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('onderzeeboot');
  await page.getByLabel('Wachtwoord nogmaals').fill('onderzeeboot');
  await page.getByRole('button', { name: 'Account aanmaken' }).click();
  await page.waitForURL('**/');
}

/** Maakt één ding van elk van vier soorten, als de Keeper, via de routes die het blad ook neemt. */
async function makeFour(page: Page, name: string, keeperOnly: boolean) {
  const results = await page.evaluate(
    async ({ name, keeperOnly }) => {
      const post = async (url: string, body: Record<string, unknown>) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        return response.status;
      };
      return [
        await post('/api/cases', { name: `${name} dossier`, keeperOnly }),
        await post('/api/timelines', { name: `${name} tijdlijn`, keeperOnly }),
        await post('/api/family-trees', { name: `${name} stamboom`, keeperOnly }),
        await post('/api/boards', { name: `${name} prikbord`, keeperOnly }),
      ];
    },
    { name, keeperOnly },
  );
  for (const status of results) expect(status).toBeLessThan(300);
}

test('zoeken vindt dossiers en vlakken — en van de Keeper niets', async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const stamp = `${testInfo.project.name}${Date.now().toString(36)}`.slice(-7);
  const open = `Holle Tij ${stamp}`;
  const dicht = `Zwarte Vloed ${stamp}`;

  const keeperContext = await browser.newContext();
  const keeper = await keeperContext.newPage();
  await signIn(keeper, ...KEEPER);
  await makeFour(keeper, open, false);
  await makeFour(keeper, dicht, true);
  // De Keeper op zijn eigen kant vindt ze wel — het bewijs dat ze bestaan.
  await keeper.goto('/api/keeper/flip?side=keeper&to=%2Fsearch');
  const keeperAnswer = await keeper.evaluate(
    async (q) => (await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json()) as { others: unknown[] },
    dicht,
  );
  expect(keeperAnswer.others).toHaveLength(4);
  await keeper.goto('/api/keeper/flip?side=player&to=%2F');
  await keeperContext.close();

  await signUpAs(page, `Zoeker ${stamp}`);

  // Via het zoekvak in de schil: op een computer de zijbalk, op een telefoon de tab.
  if (testInfo.project.name === 'phone') {
    await page.locator('.tabs').getByRole('link', { name: 'Zoeken' }).click();
    await page.waitForURL('**/search**');
    await page.locator('#search-input').fill(open);
  } else {
    await page.getByTestId('nav-search').fill(open);
    await page.getByTestId('nav-search').press('Enter');
    await page.waitForURL('**/search?q=**');
  }

  const others = page.getByRole('main').getByTestId('search-others');
  await expect(others).toBeVisible({ timeout: 20_000 });
  for (const kind of ['case', 'timeline', 'family_tree', 'board']) {
    await expect(others.locator(`[data-kind="${kind}"]`).filter({ hasText: open })).toHaveCount(1);
  }

  // En nu de Keeper-only tweeling: niets. Geen naam, geen rij, geen telling.
  await page.locator('#search-input').fill(dicht);
  await expect(page.getByTestId('search-none')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('search-other')).toHaveCount(0);
  // The only place the typed words may stand is the box and its own "'…' aanmaken".
  await expect(page.getByRole('main').getByRole('link').filter({ hasText: dicht })).toHaveCount(0);
  await expect(page.getByRole('main').locator('section').filter({ hasText: dicht })).toHaveCount(0);
  const answer = await page.evaluate(
    async (q) => await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).text(),
    dicht,
  );
  expect(answer).not.toContain('Zwarte Vloed');
  expect(JSON.parse(answer).others).toEqual([]);

  // Een hit is een deur.
  await page.locator('#search-input').fill(open);
  await others.locator('[data-kind="case"]').first().click();
  await page.waitForURL('**/c/**');
});

test('Beheer → Woorden: ingeklapt, een zoekvak, en Opslaan in beeld', async ({ page }) => {
  await signIn(page, ...KEEPER);
  await page.goto('/admin?tab=words');
  await page.getByRole('tab', { name: 'Woorden' }).click();

  const box = page.getByLabel('Meer prikborden', { exact: true });
  await expect(box).toBeHidden();
  const foot = page.getByTestId('words-foot');
  await expect(foot.getByRole('button', { name: 'Opslaan', exact: true })).toBeInViewport();

  await page.getByTestId('words-filter').fill('prikbord');
  await expect(box).toBeVisible();
  // Wat niet past is weg, maar blijft in het formulier (anders gaat het verloren bij opslaan).
  await expect(page.getByLabel('De spelleider', { exact: true })).toBeHidden();
  await expect(page.getByLabel('De spelleider', { exact: true })).toHaveCount(1);

  await box.fill('muren-test');
  await expect(foot).toContainText('1 niet opgeslagen');
  await box.fill('');
  await expect(foot).not.toContainText('niet opgeslagen');

  await page.getByTestId('words-filter').fill('qqqzzz');
  await expect(page.getByText('Geen woord past bij je zoekopdracht.')).toBeVisible();
});

test('Beheer → Soorten: een nieuwe soort klapt open, in beeld, klaar voor een veld', async ({
  page,
}, testInfo) => {
  const soort = `Schepen ${testInfo.project.name} ${Date.now().toString(36)}`;
  await signIn(page, ...KEEPER);
  await page.goto('/admin?tab=types');

  const nieuw = page.locator('#new-type');
  await expect(nieuw).toBeVisible({ timeout: 20_000 });
  // *Nieuwe soort* staat boven de eerste soort.
  const newBox = await nieuw.boundingBox();
  const firstType = await page.locator('details.admin-type').first().boundingBox();
  expect(newBox!.y).toBeLessThan(firstType!.y);

  await nieuw.fill(soort);
  await page.getByRole('button', { name: 'Soort aanmaken' }).click();
  const editor = page
    .locator('details.admin-type')
    .filter({ has: page.locator('summary', { hasText: soort }) });
  await expect(editor).toHaveAttribute('open', '', { timeout: 20_000 });
  const add = editor.getByRole('button', { name: 'Veld toevoegen' });
  await expect(add).toBeFocused({ timeout: 10_000 });
  await expect(add).toBeInViewport();

  // De caret gaat mee naar de naam van het nieuwe veld.
  await add.click();
  await expect(editor.getByLabel('Naam van veld 1')).toBeFocused();

  // Een koppelveld: de soorten staan achter één kiezer.
  await editor.getByLabel('Soort van veld 1').selectOption('entry_links');
  const picker = editor.getByTestId('veld-soorten');
  await expect(picker).toContainText('Elke soort');
  await expect(picker.getByRole('button', { name: 'Personen', exact: true })).toBeHidden();
  await picker.getByRole('button', { name: 'Kies soorten' }).click();
  await picker.getByRole('button', { name: 'Personen', exact: true }).click();
  await expect(picker.locator('.admin-oftype-chosen')).toHaveText('Personen');

  // Opslaan plakt onderaan in beeld.
  await expect(editor.getByRole('button', { name: 'Opslaan', exact: true })).toBeInViewport();
});

test('/you: lettertype en kleuren onder de karakters, de uitleg in één regel', async ({ page }, testInfo) => {
  await signUpAs(page, `Lezer ${testInfo.project.name.slice(0, 2)}${Date.now().toString(36).slice(-5)}`);
  await page.goto('/you');
  const main = page.getByRole('main');
  const font = main.getByRole('group', { name: 'Lettertype om in te lezen' });
  const light = main.getByRole('group', { name: 'Licht of donker' });
  await expect(font).toBeVisible();
  await expect(light).toBeVisible();
  const password = main.getByRole('heading', { name: 'Wachtwoord wijzigen' });
  expect((await light.boundingBox())!.y).toBeLessThan((await password.boundingBox())!.y);

  // Eén regel, en de rest achter *Waarom?*.
  const why = main.locator('.you-why');
  await expect(why).toHaveCount(1);
  await expect(main.locator('.you-why-body')).toBeHidden();
  await why.locator('summary').click();
  await expect(main.locator('.you-why-body')).toBeVisible();
});
