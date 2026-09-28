/**
 * `node scripts/meet-gevoel.mjs <poort> [naam] [wachtwoord]` — de gevoelsmeting G1.
 *
 * §102 (ronde 65·b): hoe lang staat het scherm stil na een klik op een link, en
 * hoe lang tot er een *teken* is dat de klik gehoord is? De review
 * `claude/review-ui-ux-het-gevoel.md` mat dit met `nav.mjs`
 * (`claude/review-gevoel-meetscripts.md`); dit is dat script, met het eerste
 * teken erbij, zodat elke volgende ronde vóór en na op dezelfde manier meet.
 *
 * Wat het doet:
 *
 *   - logt in (standaard `Kees` / `wereld1934` uit `seed-wereld`);
 *   - zet per ronde met CDP `Network.emulateNetworkConditions` een vaste
 *     vertraging per verzoek: 0, 150, 300 en 900 ms;
 *   - klikt vier soorten links: twee in de zijbalk (een route zonder skelet) en
 *     twee in de pagina (een dossier en een artikel, allebei met `loading.tsx`);
 *   - leest in de pagina zelf, met een `MutationObserver` en
 *     `performance.now()`, vier tijden vanaf de klik:
 *       · `teken` — het eerste van: een `[data-pending]` op een link, de streep
 *         (`.nav-progress[data-shown="1"]`) of een `.skeleton` in `main`;
 *       · `url` — het adres is gewisseld;
 *       · `pagina` — de `h1` is een andere (de nieuwe pagina staat er);
 *   - drukt een tabel af, één regel per klik.
 *
 * Wat het níét doet: het bouwt niets en start niets. Het draait tegen een
 * productiebuild die al luistert op `127.0.0.1:<poort>`, met `seed-wereld`
 * erin. Zo, bijvoorbeeld (en ruim het proces daarna op):
 *
 *   DATA_DIR=$(mktemp -d) sh -c 'npm run bootstrap -- --username Keeper \
 *     --password abbeytower34 && npm run seed-wereld && PORT=3122 npm start'
 *   node scripts/meet-gevoel.mjs 3122
 *
 * Het wordt door niets anders gebruikt: geen spec, geen build. Browsers staan
 * in `PLAYWRIGHT_BROWSERS_PATH` (in deze omgeving `/opt/pw-browsers`); installeer
 * niets.
 */
import { chromium } from '@playwright/test';

const port = Number(process.argv[2]);
if (!port) {
  console.error('Gebruik: node scripts/meet-gevoel.mjs <poort> [naam] [wachtwoord]');
  process.exit(2);
}
const naam = process.argv[3] ?? 'Kees';
const wachtwoord = process.argv[4] ?? 'wereld1934';
const B = `http://127.0.0.1:${port}`;
const LATENCIES = [0, 150, 300, 900];

/**
 * De klikken. `from` is waar je staat, `link` hoe de link gevonden wordt:
 * een zijbalkvakje op zijn `href`, of de eerste link in `main` met dat begin.
 */
const CLICKS = [
  { from: '/e/veere', link: 'nav a[href="/wiki"]', label: 'zijbalk → /wiki' },
  { from: '/wiki', link: 'nav a[href="/cases"]', label: 'zijbalk → /cases' },
  { from: '/cases', link: 'main a[href^="/c/"]', label: 'lijst → dossier' },
  { from: '/wiki/alles', link: 'main a[href^="/e/"]', label: 'lijst → artikel' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${B}/login`);
await page.getByLabel('Naam', { exact: true }).fill(naam);
await page.getByLabel('Wachtwoord').fill(wachtwoord);
await page.getByRole('button', { name: 'Inloggen' }).click();
await page.waitForURL(`${B}/`);

const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const lag = (latency) =>
  cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

/** In de pagina: één klik, vier tijden. Klaar zodra de `h1` een andere is. */
function arm() {
  const oldH1 = document.querySelector('main h1, h1')?.textContent ?? null;
  const oldUrl = location.href;
  const out = { t0: null, sign: null, signKind: null, url: null, page: null };
  window.__g1 = out;
  const since = () => Math.round(performance.now() - out.t0);
  const look = () => {
    if (out.t0 === null) return;
    if (out.sign === null) {
      const kind = document.querySelector('a[data-pending]')
        ? 'vakje'
        : document.querySelector('.nav-progress[data-shown="1"]')
          ? 'streep'
          : document.querySelector('main .skeleton')
            ? 'skelet'
            : null;
      if (kind) {
        out.sign = since();
        out.signKind = kind;
      }
    }
    if (out.url === null && location.href !== oldUrl) out.url = since();
    const h1 = document.querySelector('main h1, h1')?.textContent ?? null;
    if (out.page === null && h1 !== null && h1 !== oldH1 && !document.querySelector('main .skeleton')) {
      out.page = since();
    }
  };
  new MutationObserver(look).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  document.addEventListener('click', () => (out.t0 = performance.now()), { capture: true, once: true });
  const tick = () => {
    look();
    if (out.page === null) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const rows = [];
for (const latency of LATENCIES) {
  for (const click of CLICKS) {
    await lag(0);
    await page.goto(B + click.from);
    // Wat Next vooraf ophaalt, is binnen: een gebruiker leest eerst.
    await page.waitForTimeout(1500);
    await lag(latency);
    const link = page.locator(click.link).first();
    if (!(await link.count())) {
      rows.push({ latency, label: click.label, note: 'geen link' });
      continue;
    }
    await page.evaluate(arm);
    await link.click({ noWaitAfter: true });
    const result = await page
      .waitForFunction(() => window.__g1 && window.__g1.page !== null && window.__g1, null, { timeout: 20_000 })
      .then((handle) => handle.jsonValue())
      .catch(() => page.evaluate(() => window.__g1));
    rows.push({ latency, label: click.label, ...result });
  }
}
await lag(0);
await browser.close();

const pad = (value, width) => String(value ?? '—').padStart(width);
console.log(`G1 tegen ${B} als ${naam} — ms vanaf de klik`);
console.log(`${'vertraging'.padEnd(11)}${'klik'.padEnd(20)}${pad('teken', 7)}  ${'soort'.padEnd(7)}${pad('url', 6)}${pad('pagina', 8)}`);
for (const row of rows) {
  if (row.note) {
    console.log(`${`${row.latency} ms`.padEnd(11)}${row.label.padEnd(20)}${row.note}`);
    continue;
  }
  console.log(
    `${`${row.latency} ms`.padEnd(11)}${row.label.padEnd(20)}${pad(row.sign, 7)}  ${String(row.signKind ?? '—').padEnd(7)}${pad(row.url, 6)}${pad(row.page, 8)}`,
  );
}
