import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * §63: the front door.
 *
 * Two claims, and both of them are about a thing React does on purpose, so
 * neither can be checked anywhere but in a browser:
 *
 *  1. A form action **resets the form** once it settles. So the spec that
 *     matters is: type a password that is too short, submit, and see the
 *     invitation code and the name *still standing*. Before round 30 they were
 *     blank, and the sentence that explained why was about neither of them.
 *  2. The road to an account is findable. It used to be eight grey words under
 *     the login form; it is a panel with a button now, and a button is something
 *     a spec can insist on by its accessible name.
 */

const inviteCode = () =>
  readFileSync(join(__dirname, '..', '..', 'data-e2e', 'invite.txt'), 'utf8').trim();

/** A name nobody else in this archive has, so the archive never refuses it. */
const freshName = () => `Nieuwkomer ${Math.random().toString(36).slice(2, 8)}`;

test.describe('de voordeur', () => {
  test('de inlogpagina wijst een nieuwkomer de weg', async ({ page }) => {
    await page.goto('/login');
    const join = page.getByRole('link', { name: /Registreer je nu/i });
    await expect(join).toBeVisible();
    // And it says what you need before you get there, not after.
    await expect(page.getByText(/uitnodigingscode van je Keeper/i)).toBeVisible();
    await join.click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test('een te kort wachtwoord laat de andere velden staan', async ({ page }) => {
    const code = inviteCode();
    const name = freshName();

    await page.goto('/signup');
    await page.getByLabel('Uitnodigingscode').fill(code);
    await page.getByLabel('Naam').fill(name);
    await page.getByLabel('Wachtwoord', { exact: true }).fill('kort');
    await page.getByLabel('Wachtwoord nogmaals').fill('kort');
    // Enter from inside a box, which is how the bug was reported.
    await page.getByLabel('Wachtwoord nogmaals').press('Enter');

    // The sentence, in Dutch, naming the rule.
    await expect(page.locator('p.error-note')).toContainText('minstens 8 tekens');
    // And — the whole point — nothing else was thrown away.
    await expect(page.getByLabel('Uitnodigingscode')).toHaveValue(code);
    await expect(page.getByLabel('Naam')).toHaveValue(name);
    // The caret is in the box the sentence is about.
    await expect(page.getByLabel('Wachtwoord', { exact: true })).toBeFocused();
    // Still on the signup page: the browser answered, the archive was not asked.
    await expect(page).toHaveURL(/\/signup$/);
  });

  test('een leeg vak krijgt dezelfde Nederlandse regel, niet een bel van de browser', async ({ page }) => {
    // `noValidate` is on the form on purpose (§63): `required` stays for a
    // screen reader, but the sentence a person reads is ours, in Dutch, under
    // the box it is about — not a bubble in the browser's own language.
    const name = freshName();
    await page.goto('/signup');
    await page.getByLabel('Uitnodigingscode').fill(inviteCode());
    await page.getByLabel('Naam').fill(name);
    await page.getByLabel('Wachtwoord', { exact: true }).fill('abbeytower34');
    await page.getByRole('button', { name: 'Account aanmaken' }).click();

    await expect(page.locator('p.error-note')).toContainText('niet hetzelfde');
    await expect(page.getByLabel('Naam')).toHaveValue(name);
  });

  test('twee wachtwoorden die niet gelijk zijn wijzen het tweede vak aan', async ({ page }) => {
    const name = freshName();
    await page.goto('/signup');
    await page.getByLabel('Uitnodigingscode').fill(inviteCode());
    await page.getByLabel('Naam').fill(name);
    await page.getByLabel('Wachtwoord', { exact: true }).fill('abbeytower34');
    await page.getByLabel('Wachtwoord nogmaals').fill('abbeytower43');
    await page.getByRole('button', { name: 'Account aanmaken' }).click();

    await expect(page.locator('p.error-note')).toContainText('niet hetzelfde');
    await expect(page.getByLabel('Naam')).toHaveValue(name);
    // Both wachtwoorden are kept here, unlike at login: the repair is to compare
    // them, and a blank pair cannot be compared.
    await expect(page.getByLabel('Wachtwoord', { exact: true })).toHaveValue('abbeytower34');
    await expect(page.getByLabel('Wachtwoord nogmaals')).toBeFocused();
  });

  test('een verkeerde uitnodigingscode komt van het archief en houdt de naam vast', async ({ page }) => {
    const name = freshName();
    await page.goto('/signup');
    await page.getByLabel('Uitnodigingscode').fill('NIET-DE-CODE');
    await page.getByLabel('Naam').fill(name);
    await page.getByLabel('Wachtwoord', { exact: true }).fill('abbeytower34');
    await page.getByLabel('Wachtwoord nogmaals').fill('abbeytower34');
    await page.getByRole('button', { name: 'Account aanmaken' }).click();

    // This one *is* a round trip — only the archive knows the code — so it is
    // the case where React's reset actually fires. The boxes survive it.
    await expect(page.locator('p.error-note')).toContainText('uitnodigingscode klopt niet');
    await expect(page.getByLabel('Naam')).toHaveValue(name);
    await expect(page.getByLabel('Wachtwoord', { exact: true })).toHaveValue('abbeytower34');
    await expect(page.getByLabel('Uitnodigingscode')).toBeFocused();
  });

  test('inloggen met een verkeerd wachtwoord houdt de naam en wist het wachtwoord', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Naam').fill('Keeper');
    await page.getByLabel('Wachtwoord').fill('nietmijnwachtwoord');
    await page.getByRole('button', { name: 'Inloggen' }).click();

    await expect(page.locator('p.error-note')).toContainText('Naam of wachtwoord klopt niet');
    await expect(page.getByLabel('Naam')).toHaveValue('Keeper');
    await expect(page.getByLabel('Wachtwoord')).toHaveValue('');
  });

  test('en de voordeur gaat open', async ({ page }) => {
    const code = inviteCode();
    const name = freshName();
    await page.goto('/signup');
    await page.getByLabel('Uitnodigingscode').fill(code);
    await page.getByLabel('Naam').fill(name);
    await page.getByLabel('Wachtwoord', { exact: true }).fill('abbeytower34');
    await page.getByLabel('Wachtwoord nogmaals').fill('abbeytower34');
    await page.getByRole('button', { name: 'Account aanmaken' }).click();
    // The redirect still travels through the client wrapper: a successful signup
    // lands in the archive, it does not sit on the form.
    await expect(page).not.toHaveURL(/\/signup/);
  });
});
