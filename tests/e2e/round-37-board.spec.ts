import { expect, test, type Page } from '@playwright/test';
import { editCanvas, newBoard, signIn } from './helpers';

/**
 * §73, round 37: the prikbord's half of lezen en bewerken.
 *
 * Nick: *"Moving things accidentally is very easy."* So a wall opens in
 * Bewerken on a desk and in Lezen on a phone, nothing about the choice is
 * remembered, and in Lezen a thumb that lands on a kaartje and slides moves the
 * paper, never the card.
 *
 * Both tests reload before they look: `newBoard` already presses Bewerken
 * (§73's helper), so only a fresh visit shows what a wall opens in.
 *
 * The drag is `page.mouse`, not a synthetic touch: the wall's card handlers do
 * not read `pointerType`, the phone project is a 390 px viewport where
 * `useIsPhone` is true, and Playwright's touchscreen can only tap (see the
 * note in `canvas-contract.spec.ts`).
 */

const KEEPER = ['Keeper', 'abbeytower34'] as const;

/** A wall with one notitie on it, saved, and the page freshly reloaded. */
async function wallWithANote(page: Page) {
  await signIn(page, ...KEEPER);
  await page.goto('/boards');
  await newBoard(page);
  await page.waitForURL('**/b/**');

  // In Bewerken (the helper put us there) the button that makes a notitie is
  // there — which is also what proves the locator the phone test counts.
  const make = page.getByRole('button', { name: 'Nieuwe notitie', exact: true });
  await expect(make).toBeVisible();
  await make.click();
  await expect(page.locator('.board-card')).toHaveCount(1);
  await expect(page.locator('.save-state')).toHaveText('Opgeslagen', { timeout: 15_000 });

  await page.reload();
  await expect(page.locator('.board-card')).toHaveCount(1);
}

/** Where a card is on the cork — the stored place, not where the camera shows it. */
async function placeOf(page: Page) {
  return page
    .locator('.board-card')
    .first()
    .evaluate((node) => ({
      left: (node as HTMLElement).style.left,
      top: (node as HTMLElement).style.top,
    }));
}

async function dragCard(page: Page, dx: number, dy: number) {
  const box = (await page.locator('.board-card').first().boundingBox())!;
  const x = box.x + box.width / 2;
  // The upper half: the words below are a double-tap target, the frame is not there on a notitie.
  const y = box.y + Math.min(40, box.height / 3);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

test('§73 desktop: een prikbord opent in Bewerken', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'dit gaat over een bureau');
  await wallWithANote(page);

  const group = page.getByTestId('canvas-mode');
  await expect(group).toBeVisible();
  await expect(group.getByRole('radio', { name: 'Bewerken', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(group.getByRole('radio', { name: 'Lezen', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.getByRole('button', { name: 'Nieuwe notitie', exact: true })).toBeVisible();
});

test('§73 telefoon: een prikbord opent in Lezen, en een sleep op een kaartje verschuift het niet', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'dit gaat over 390 px');
  test.setTimeout(90_000);
  await wallWithANote(page);

  // The server renders a desk; the phone turns to Lezen on its first client
  // render. Waiting for that is also waiting for the wall to be listening.
  const group = page.getByTestId('canvas-mode');
  const read = group.getByRole('radio', { name: 'Lezen', exact: true });
  await expect(read).toHaveAttribute('aria-checked', 'true');
  await expect(group.getByRole('radio', { name: 'Bewerken', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );

  // Making is Bewerken's: the row of buttons is not there at all.
  await expect(page.getByRole('button', { name: 'Nieuwe notitie', exact: true })).toHaveCount(0);
  // Nor is the hint about moving things, which only means something in Bewerken.
  await expect(page.getByText('Verschuiven werkt het best op een tablet of computer.')).toHaveCount(0);

  // A drag that starts on the card: the card stays where it is on the cork…
  const before = await placeOf(page);
  const screenBefore = (await page.locator('.board-card').first().boundingBox())!;
  await dragCard(page, -50, -40);
  expect(await placeOf(page), 'in Lezen blijft het kaartje op zijn plek').toEqual(before);
  // …and the paper went with the hand instead, so the camera is still reachable.
  const screenAfter = (await page.locator('.board-card').first().boundingBox())!;
  expect(Math.abs(screenAfter.x - screenBefore.x)).toBeGreaterThan(25);

  // In Bewerken the same drag carries the card.
  await editCanvas(page);
  await expect(page.getByRole('button', { name: 'Nieuwe notitie', exact: true })).toBeVisible();
  // The row came back above the wall and pushed it down: measured afresh inside.
  await dragCard(page, 60, 45);
  await expect.poll(() => placeOf(page), { timeout: 15_000 }).not.toEqual(before);
});
