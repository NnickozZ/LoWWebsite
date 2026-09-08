/**
 * `npm run seed-wereld` — een gevuld archief om op te testen.
 *
 * Waarom dit naast `seed-demo` staat en niet in plaats daarvan: `seed-demo` is
 * geen demo meer maar een fixture. `tests/e2e/prepare.mjs` draait hem als
 * eerste stap van elke Playwright-run, en drie specs klikken op de namen die
 * erin staan ("Westkapelle Lighthouse", "The Unwound Light",
 * "Jacob den Hollander"). Wie die inhoud vervangt maakt de suite rood op een
 * manier die pas na twintig minuten zichtbaar is. Dus: `seed-demo` blijft de
 * kleine, vaste fixture, en dit is de grote vulling ernaast.
 *
 *   npm run seed-wereld                 # ~15 per soort, bovenop wat er staat
 *   npm run seed-wereld -- --per 25     # meer per soort (de potten in
 *                                       #   seed-wereld.data.mjs zijn de bovengrens)
 *   npm run seed-wereld -- --seed 7     # een andere, maar even herhaalbare, wereld
 *   npm run seed-wereld -- --clean      # alleen wat deze vulling maakte weer weg
 *                                       #   (daarna gewoon opnieuw draaien)
 *   npm run seed-wereld -- --no-images  # zonder omslagen en landkaartplaten
 *
 * Wat het neerzet: artikelen van elke soort, met een infobox die naar echte
 * andere artikelen wijst, een lopende tekst met chips erin, secties (waarvan
 * een deel Keeper-only), omslagen, zes spelersaccounts met karakters,
 * dossiers met tabbladen en werknotities, prikborden met kaarten en touwtjes,
 * tijdlijnen met gebeurtenissen, landkaarten met spelden, voorstellen,
 * activiteit en versies. Alles wat er is, met andere woorden, zodat "Genoemd
 * in", het web (§43) en de zichtbaarheidsregels iets te doen hebben.
 *
 * Twee dingen die het met opzet níét doet:
 *
 *  - het schrijft niets over wat er al staat. Elk artikel krijgt een eigen id
 *    en een eigen slug (met achtervoegsel als die bezet is), en een bestaande
 *    Keeper, soort of instelling wordt niet aangeraakt.
 *  - het rekent `entry_mentions` zelf uit in plaats van op de opstart-backfill
 *    te leunen. `ensureMentionsBackfilled()` vult die tabel exact één keer per
 *    archief — is dat al gebeurd, dan zou alles wat hier gemaakt wordt nooit
 *    onder "Genoemd in" verschijnen. De regels hieronder zijn dezelfde die
 *    `lib/entries/mentions.ts` schrijft, met de hand nagerekend omdat een
 *    `.mjs`-script geen TypeScript kan importeren (regel 4).
 *
 * Alles wat het maakt staat in `data/seed-wereld.json`. Dat bestand is wat
 * `--clean` leest; gooi je het weg, dan is de vulling niet meer als zodanig
 * te herkennen en moet je met `make reset` opnieuw beginnen.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from './ensure-env.mjs';

loadEnv();

const { openDb, dataDir, assetsDir } = await import('../lib/db/open.mjs');
const { seedBaseline } = await import('../lib/db/seed.mjs');
const { hashPassword, encryptPassword } = await import('../lib/auth/password.mjs');
const { usernameKey } = await import('../lib/auth/username.mjs');
const DATA = await import('./seed-wereld.data.mjs');

/* ------------------------------------------------------------ argumenten */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1];
};

const PER = Math.max(1, Number(value('per', 15)) || 15);
const SEED = Number(value('seed', 1934)) || 1934;
const CLEAN = flag('clean');
const IMAGES = !flag('no-images');
const MANIFEST = join(dataDir(), 'seed-wereld.json');

/* ------------------------------------------------------------ gereedschap */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
function newId() {
  let out = '';
  for (const b of randomBytes(16)) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Herhaalbaar toeval: dezelfde `--seed` geeft dezelfde wereld. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(SEED);
const pick = (list) => list[Math.floor(random() * list.length)];
const chance = (p) => random() < p;
const some = (list, n) => {
  const copy = [...list];
  const out = [];
  while (copy.length && out.length < n) out.push(copy.splice(Math.floor(random() * copy.length), 1)[0]);
  return out;
};

function slugify(input) {
  return (
    input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'artikel'
  );
}

/** Tiptap-document uit alinea's, waarbij `%A`/`%B` al vervangen zijn door refs. */
function doc(paragraphs) {
  const alinea = (parts) => {
    const content = (Array.isArray(parts) ? parts : [parts])
        .flatMap((part) =>
          typeof part === 'string'
            ? part
              ? [{ type: 'text', text: part }]
              : []
            : [
                {
                  type: 'entryLink',
                  attrs: {
                    id: part.id,
                    label: part.name,
                    slug: part.slug,
                    icon: part.icon,
                    colour: part.colour,
                  },
                },
              ],
      );
    /* Een lege alinea heeft géén `content`-sleutel — een lege array is niet
       wat ProseMirror voor "witregel" leest. */
    return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
  };
  const content = paragraphs.map(alinea);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function docToText(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'text') out.push(node.text ?? '');
  else if (node.type === 'entryLink') out.push(node.attrs?.label ?? '');
  else if (Array.isArray(node.content)) {
    for (const child of node.content) docToText(child, out);
    if (node.type === 'paragraph') out.push('\n');
  }
  return out;
}
const textOf = (d) => docToText(d).join('').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();

/** Ids die een document noemt — de bron van `entry_links`, precies als `extractEntryLinks`. */
function linksIn(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'entryLink' && typeof node.attrs?.id === 'string') out.add(node.attrs.id);
  else if (Array.isArray(node.content)) for (const child of node.content) linksIn(child, out);
  return out;
}

/** Een zin met `%A` / `%B` wordt een alinea: stukken tekst met chips ertussen. */
function sentence(template, a, b) {
  const parts = [];
  let rest = template;
  for (;;) {
    const at = rest.search(/%[AB]/);
    if (at === -1) break;
    if (at > 0) parts.push(rest.slice(0, at));
    parts.push(rest[at + 1] === 'A' ? a : b);
    rest = rest.slice(at + 2);
  }
  if (rest) parts.push(rest);
  return parts;
}

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const at = (y, m, d, h = 0, min = 0) => Math.floor(Date.UTC(y, m - 1, d, h, min, 0) / 1000);
const dutchDate = (y, m, d, precision = 'day') =>
  precision === 'year' ? String(y) : precision === 'month' ? `${MAANDEN[m - 1]} ${y}` : `${d} ${MAANDEN[m - 1]} ${y}`;

/* ------------------------------------------------------------------- db */

const db = openDb();
seedBaseline(db);

/* --------------------------------------------------------------- opruimen */

function readManifest() {
  if (!existsSync(MANIFEST)) return null;
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch {
    return null;
  }
}

if (CLEAN) {
  const old = readManifest();
  if (!old) {
    console.log('Geen data/seed-wereld.json — er is niets van deze vulling te vinden om weg te halen.');
  } else {
    const drop = db.transaction(() => {
      const del = (sql, ids) => {
        const stmt = db.prepare(sql);
        for (const id of ids ?? []) stmt.run(id);
      };
      del('DELETE FROM entries WHERE id = ?', old.entries);
      del('DELETE FROM entries_fts WHERE entry_id = ?', old.entries);
      for (const id of old.entries ?? []) {
        db.prepare('DELETE FROM entry_links WHERE from_entry_id = ? OR to_entry_id = ?').run(id, id);
        db.prepare('DELETE FROM entry_mentions WHERE to_entry_id = ? OR from_id = ?').run(id, id);
        db.prepare('DELETE FROM entry_sections WHERE entry_id = ?').run(id);
        db.prepare('DELETE FROM entry_revisions WHERE entry_id = ?').run(id);
        db.prepare('DELETE FROM pending_edits WHERE entry_id = ?').run(id);
        db.prepare('DELETE FROM case_entries WHERE entry_id = ?').run(id);
        db.prepare('DELETE FROM user_characters WHERE entry_id = ?').run(id);
        db.prepare('DELETE FROM activity WHERE entry_id = ?').run(id);
        db.prepare('DELETE FROM access_grants WHERE target_id = ?').run(id);
      }
      for (const id of old.cases ?? []) {
        db.prepare('DELETE FROM cases WHERE id = ?').run(id);
        db.prepare('DELETE FROM case_entries WHERE case_id = ?').run(id);
        db.prepare('DELETE FROM case_members WHERE case_id = ?').run(id);
        db.prepare('DELETE FROM activity WHERE case_id = ?').run(id);
        db.prepare('DELETE FROM entry_mentions WHERE from_id = ?').run(id);
      }
      for (const id of old.boards ?? []) {
        db.prepare('DELETE FROM boards WHERE id = ?').run(id);
        db.prepare('DELETE FROM activity WHERE board_id = ?').run(id);
        db.prepare('DELETE FROM entry_mentions WHERE from_id = ?').run(id);
      }
      for (const id of old.timelines ?? []) {
        db.prepare('DELETE FROM timelines WHERE id = ?').run(id);
        db.prepare('DELETE FROM timeline_events WHERE timeline_id = ?').run(id);
        db.prepare('DELETE FROM entry_mentions WHERE from_id = ?').run(id);
      }
      for (const id of old.maps ?? []) {
        db.prepare('DELETE FROM maps WHERE id = ?').run(id);
        db.prepare('DELETE FROM map_pins WHERE map_id = ?').run(id);
        db.prepare('DELETE FROM entry_mentions WHERE from_id = ?').run(id);
      }
      del('DELETE FROM assets WHERE id = ?', old.assets);
      del('DELETE FROM activity WHERE id = ?', old.activity);
      for (const id of old.users ?? []) {
        db.prepare('UPDATE users SET active_character_id = NULL WHERE id = ?').run(id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM case_members WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM access_grants WHERE user_id = ?').run(id);
      }
    });
    drop();
    for (const id of old.assets ?? []) {
      for (const suffix of ['', '_900', '_400']) {
        const file = join(assetsDir(), `${id}${suffix}.webp`);
        if (existsSync(file)) unlinkSync(file);
      }
    }
    unlinkSync(MANIFEST);
    console.log(
      `Weggehaald: ${old.entries?.length ?? 0} artikelen, ${old.cases?.length ?? 0} dossiers, ` +
        `${old.boards?.length ?? 0} prikborden, ${old.timelines?.length ?? 0} tijdlijnen, ` +
        `${old.maps?.length ?? 0} landkaarten, ${old.users?.length ?? 0} accounts.`,
    );
  }
  process.exit(0);
}

if (existsSync(MANIFEST)) {
  console.log('Er staat al een gevulde wereld in dit archief (data/seed-wereld.json).');
  console.log('Draai `npm run seed-wereld -- --clean` eerst, of gooi dat bestand weg om er nog een overheen te zetten.');
  process.exit(0);
}

/* ------------------------------------------------------------ het gezelschap */

const keeper = db.prepare('SELECT id, username FROM users WHERE is_keeper = 1 ORDER BY created_at LIMIT 1').get();
if (!keeper) {
  console.error('Er is nog geen Keeper. Draai eerst `npm run bootstrap`, anders heeft niets een auteur.');
  process.exit(1);
}

const manifest = { entries: [], cases: [], boards: [], timelines: [], maps: [], assets: [], users: [], activity: [], seed: SEED, per: PER, at: new Date().toISOString() };

/**
 * Een landkaart en een tijdlijn hangen hun activiteitsregel aan `meta`, niet
 * aan een kolom (`lib/maps/service.ts`, `lib/timelines/service.ts`), dus die
 * rijen zijn bij het opruimen nergens aan te herkennen. Vandaar dat hun ids
 * apart worden onthouden.
 */
function logLos(verb, meta, caseId = null) {
  const id = newId();
  db.prepare('INSERT INTO activity (id, actor_id, verb, case_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, keeper.id, verb, caseId, JSON.stringify(meta), moment());
  manifest.activity.push(id);
}

const SPELERS = [
  ['Kees', 'Cornelis Vermeulen'],
  ['Elsje', 'Dr. Elsje Kramer'],
  ['Bram', 'Bram Ossewaarde'],
  ['Nel', 'Nel Provoost'],
  ['Truus', 'Truus Haaij'],
  ['Machteld', 'Machteld van Ostade'],
];
const WACHTWOORD = 'wereld1934';

const users = [];
for (const [naam] of SPELERS) {
  const key = usernameKey(naam);
  const bestaat = db.prepare('SELECT id, username FROM users WHERE username_lower = ?').get(key);
  if (bestaat) {
    users.push({ ...bestaat, nieuw: false });
    continue;
  }
  const id = newId();
  db.prepare(
    `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper)
     VALUES (?, ?, ?, ?, ?, 0)`,
  ).run(id, naam, key, await hashPassword(WACHTWOORD), encryptPassword(WACHTWOORD));
  users.push({ id, username: naam, nieuw: true });
  manifest.users.push(id);
}

/* ------------------------------------------------------------------ soorten */

const typeRows = db.prepare('SELECT id, slug, label, icon, colour, fields FROM entry_types').all();
/**
 * Een Keeper mag een soort tot in zijn adres hernoemen (§11), dus `object` kan
 * `relieken` heten. Eerst op slug zoeken, dan op het label dat de seed erbij
 * gaf — en anders wordt die soort simpelweg overgeslagen in plaats van dat er
 * een tweede naast wordt gezet.
 */
function typeFor(slug, label) {
  return typeRows.find((t) => t.slug === slug) ?? typeRows.find((t) => t.label === label) ?? null;
}

const SOORTEN = [
  { slug: 'location', label: 'Locaties', pot: DATA.LOCATIES, zinnen: 'location' },
  { slug: 'character', label: 'Personen', pot: DATA.PERSONEN, zinnen: 'character' },
  { slug: 'investigator', label: 'Onderzoekers', pot: DATA.ONDERZOEKERS, zinnen: 'investigator' },
  { slug: 'faction', label: 'Facties', pot: DATA.FACTIES, zinnen: 'faction' },
  { slug: 'family', label: 'Families', pot: DATA.FAMILIES, zinnen: 'family' },
  { slug: 'object', label: 'Relieken', pot: DATA.RELIEKEN, zinnen: 'object' },
  { slug: 'item', label: 'Voorwerpen', pot: DATA.VOORWERPEN, zinnen: 'item' },
  { slug: 'clue', label: 'Clues', pot: DATA.CLUES, zinnen: 'clue' },
  { slug: 'abnormality', label: 'Abnormaliteiten', pot: DATA.ABNORMALITEITEN, zinnen: 'abnormality' },
  { slug: 'event', label: 'Gebeurtenissen', pot: DATA.GEBEURTENISSEN, zinnen: 'event' },
  { slug: 'lore', label: 'Overlevering en folklore', pot: DATA.OVERLEVERING, zinnen: 'lore' },
  { slug: 'session', label: 'Sessierapporten', pot: DATA.SESSIES, zinnen: 'session' },
];

/* ------------------------------------------------------- artikelen, ronde 1 */
/* Eerst alleen de rijen — namen, ids, slugs — zodat ronde twee naar elkaar
   kan wijzen zonder dat de volgorde uitmaakt. */

const bezetteSlugs = new Set(db.prepare('SELECT slug FROM entries').all().map((r) => r.slug));
function vrijeSlug(naam) {
  const basis = slugify(naam);
  let slug = basis;
  let n = 2;
  while (bezetteSlugs.has(slug)) slug = `${basis}-${n++}`;
  bezetteSlugs.add(slug);
  return slug;
}

const perSoort = new Map();
const alle = [];

for (const soort of SOORTEN) {
  const type = typeFor(soort.slug, soort.label);
  if (!type) {
    console.log(`  (soort "${soort.label}" bestaat niet in dit archief — overgeslagen)`);
    continue;
  }
  const gekozen = soort.pot.slice(0, Math.min(PER, soort.pot.length));
  const rijen = gekozen.map((bron) => ({
    id: newId(),
    name: bron[0],
    slug: vrijeSlug(bron[0]),
    icon: type.icon,
    colour: type.colour,
    typeId: type.id,
    soort: soort.slug,
    zinnen: soort.zinnen,
    short: bron[1],
    velden: typeof bron[2] === 'object' && bron[2] !== null ? { ...bron[2] } : {},
    bron,
  }));
  perSoort.set(soort.slug, rijen);
  alle.push(...rijen);
  if (gekozen.length < PER) {
    console.log(`  (${soort.label}: de pot heeft er ${soort.pot.length}, dus ${gekozen.length} in plaats van ${PER})`);
  }
}

const van = (slug) => perSoort.get(slug) ?? [];
/** Wat er van een artikel in een infobox terechtkomt (`StoredEntryRef`). */
const ref = (row) => ({ id: row.id, name: row.name, slug: row.slug, icon: row.icon, colour: row.colour });

/**
 * Bij toerbeurt kiezen in plaats van bij toeval.
 *
 * Vijftien clues die elk één van vijftien locaties trekken laat er bij toeval
 * een stuk of zes leeg — en juist die velden voeden de afgeleide blokken
 * ("Hier gevonden", "Laatst hier gezien", "Leden"), dus dan staat de helft van
 * de locatiepagina's met een lege lijst waar het hele punt van die pagina in
 * zit. Een beurtrol met een willekeurig beginpunt geeft elke locatie er ten
 * minste één, en ziet er nog steeds ongelijk uit.
 */
function beurt(list) {
  let i = Math.floor(random() * Math.max(1, list.length));
  return () => list[i++ % list.length];
}
const beurten = new Map();
const omDeBeurt = (sleutel, list) => {
  if (!list.length) return null;
  /* Zuivere beurtrol geeft elke locatie precies evenveel, en dát ziet er ook
     weer nep uit: een echt archief heeft knooppunten. Een kwart van de keren
     dus gewoon grabbelen, zodat er hobbels in komen zonder gaten. */
  if (chance(0.25)) return pick(list);
  if (!beurten.has(sleutel)) beurten.set(sleutel, beurt(list));
  return beurten.get(sleutel)();
};

/* ------------------------------------------------------------- afbeeldingen */

let sharp = null;
if (IMAGES) {
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('  (sharp is niet te laden — er komen geen omslagen en geen landkaartplaten)');
  }
}

const PAPIER = ['#e9e0cd', '#e4dac4', '#efe7d6', '#ded3ba'];

/** Een omslag: papier, een band in de kleur van de soort, en de naam erop. */
async function maakOmslag(naam, kleur, breedte = 900, hoogte = 1200) {
  if (!sharp) return null;
  const papier = pick(PAPIER);
  const woorden = naam.split(' ');
  const regels = [];
  let regel = '';
  for (const woord of woorden) {
    if ((regel + ' ' + woord).trim().length > 16) {
      regels.push(regel.trim());
      regel = woord;
    } else regel += ` ${woord}`;
  }
  if (regel.trim()) regels.push(regel.trim());
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const vlekken = Array.from({ length: 9 }, () => {
    const cx = Math.floor(random() * breedte);
    const cy = Math.floor(random() * hoogte);
    const r = 40 + Math.floor(random() * 160);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#8a7a58" opacity="0.05"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${breedte}" height="${hoogte}">
    <rect width="100%" height="100%" fill="${papier}"/>
    ${vlekken}
    <rect x="0" y="${Math.round(hoogte * 0.62)}" width="100%" height="${Math.round(hoogte * 0.03)}" fill="${kleur}" opacity="0.85"/>
    <rect x="${Math.round(breedte * 0.06)}" y="${Math.round(hoogte * 0.06)}" width="${Math.round(breedte * 0.88)}" height="${Math.round(hoogte * 0.88)}" fill="none" stroke="${kleur}" stroke-width="4" opacity="0.5"/>
    ${regels
      .map(
        (r, i) =>
          `<text x="${breedte / 2}" y="${Math.round(hoogte * 0.7) + i * 74}" font-family="Georgia,serif" font-size="58" fill="#2a2118" text-anchor="middle">${esc(r)}</text>`,
      )
      .join('')}
  </svg>`;
  return Buffer.from(svg);
}

/** Een landkaartplaat: perkament, water, een kustlijn en een raster. */
async function maakKaart(naam, breedte = 2000, hoogte = 1400) {
  if (!sharp) return null;
  const punten = [];
  for (let i = 0; i <= 20; i++) {
    const x = (breedte / 20) * i;
    const y = hoogte * (0.35 + 0.22 * Math.sin(i / 2.4 + SEED) + 0.08 * random());
    punten.push(`${Math.round(x)},${Math.round(y)}`);
  }
  const raster = Array.from({ length: 21 }, (_, i) => {
    const x = Math.round((breedte / 20) * i);
    const y = Math.round((hoogte / 14) * i);
    return `<line x1="${x}" y1="0" x2="${x}" y2="${hoogte}" stroke="#9a8c6a" stroke-width="1" opacity="0.18"/><line x1="0" y1="${y}" x2="${breedte}" y2="${y}" stroke="#9a8c6a" stroke-width="1" opacity="0.18"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${breedte}" height="${hoogte}">
    <rect width="100%" height="100%" fill="#dcd0ae"/>
    <polygon points="0,${hoogte} ${punten.join(' ')} ${breedte},${hoogte}" fill="#cfc39d"/>
    <polyline points="${punten.join(' ')}" fill="none" stroke="#31556b" stroke-width="5" opacity="0.7"/>
    <polyline points="${punten.join(' ')}" fill="none" stroke="#31556b" stroke-width="18" opacity="0.12"/>
    ${raster}
    <text x="60" y="90" font-family="Georgia,serif" font-size="64" fill="#2a2118">${naam.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
    <text x="60" y="${hoogte - 50}" font-family="Georgia,serif" font-size="34" fill="#4a4a4a">Opgemeten na de Drift — schaal onbekend</text>
  </svg>`;
  return Buffer.from(svg);
}

/** Slaat een plaat op zoals `lib/assets.ts` dat doet: drie webp's en een rij. */
async function bewaar(svg, bestandsnaam, maxEdge = 1600) {
  if (!sharp || !svg) return null;
  const pipeline = sharp(svg, { density: 96 });
  const full = await pipeline.clone().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const card = await pipeline.clone().resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const thumb = await pipeline.clone().resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  const id = newId();
  writeFileSync(join(assetsDir(), `${id}.webp`), full.data);
  writeFileSync(join(assetsDir(), `${id}_900.webp`), card);
  writeFileSync(join(assetsDir(), `${id}_400.webp`), thumb);
  db.prepare(
    `INSERT INTO assets (id, kind, filename, mime, bytes, width, height, uploaded_by)
     VALUES (?, 'image', ?, 'image/webp', ?, ?, ?, ?)`,
  ).run(id, bestandsnaam, full.data.byteLength, full.info.width, full.info.height, keeper.id);
  manifest.assets.push(id);
  return { id, width: full.info.width, height: full.info.height };
}

/* ------------------------------------------------ artikelen, ronde 2: bedrading */

const zichtbaar = (row) => row.visibility !== 'keeper';

for (const row of alle) {
  const locaties = van('location');
  const personen = van('character');
  const onderzoekers = van('investigator');
  const facties = van('faction');
  const sessies = van('session');
  const clues = van('clue');
  const abnormaal = van('abnormality');
  const relieken = van('object');
  const families = van('family');

  const velden = row.velden;

  switch (row.soort) {
    case 'character': {
      if (facties.length && chance(0.7)) velden.faction = ref(omDeBeurt('lid-van', facties));
      if (locaties.length) velden.last_seen_at = ref(omDeBeurt('gezien-bij', locaties));
      // §51: de andere kant van Families → Leden. Niet iedereen heeft een
      // familie in het archief, dus lang niet elke persoon krijgt er een.
      if (families.length && chance(0.6)) velden.familie = ref(omDeBeurt('familie', families));
      break;
    }
    case 'investigator': {
      const speler = users[alle.filter((r) => r.soort === 'investigator').indexOf(row) % users.length];
      if (speler) velden.player = { id: speler.id, username: speler.username };
      if (chance(0.5)) velden.sanity_note = pick([
        'Slaapt slecht. Houdt vol dat dat aan het zout ligt.',
        'Sinds april één keer per week naar het gasthuis, op eigen verzoek.',
        'Rustig, tot iemand over de tweede begrafenis begint.',
        'Telt hardop. Merkt het zelf niet.',
      ]);
      break;
    }
    case 'family': {
      // §51: de ledenbox neemt personen, onderzoekers én abnormaliteiten.
      const leden = some([...personen, ...onderzoekers, ...abnormaal], 2 + Math.floor(random() * 4));
      if (leden.length) velden.leden = leden.map(ref);
      const hoofden = [...personen, ...onderzoekers];
      if (hoofden.length) velden.hoofd = ref(omDeBeurt('familiehoofd', hoofden));
      if (locaties.length) velden.thuisbasis = ref(omDeBeurt('thuisbasis', locaties));
      break;
    }
    case 'faction': {
      if (personen.length) velden.leader = ref(omDeBeurt('leider', personen));
      if (locaties.length) velden.base = ref(omDeBeurt('basis', locaties));
      break;
    }
    case 'object': {
      const houders = [...personen, ...onderzoekers];
      if (houders.length && chance(0.75)) velden.current_holder = ref(omDeBeurt('houder', houders));
      if (locaties.length) velden.current_location = ref(omDeBeurt('ligt-in', locaties));
      break;
    }
    case 'item': {
      if (locaties.length) velden.found_at = ref(omDeBeurt('gevonden-bij', locaties));
      if (onderzoekers.length) velden.found_by = ref(omDeBeurt('gevonden-door', onderzoekers));
      if (personen.length && chance(0.5)) velden.current_holder = ref(omDeBeurt('houder', personen));
      break;
    }
    case 'clue': {
      if (locaties.length) velden.found_at = ref(omDeBeurt('gevonden-bij', locaties));
      if (onderzoekers.length) velden.found_by = ref(omDeBeurt('gevonden-door', onderzoekers));
      if (sessies.length && chance(0.8)) velden.found_on = ref(omDeBeurt('gevonden-tijdens', sessies));
      const doelen = some([...abnormaal, ...personen, ...relieken], 1 + Math.floor(random() * 3));
      if (doelen.length) velden.points_to = doelen.map(ref);
      break;
    }
    case 'abnormality': {
      if (locaties.length) velden.first_sighting = ref(omDeBeurt('eerste-waarneming', locaties));
      break;
    }
    case 'event': {
      const [, , jaar, maand, dag, precisie] = row.bron;
      velden.date = dutchDate(jaar, maand, dag, precisie);
      row.moment = { at: at(jaar, maand, dag), precision: precisie };
      if (locaties.length) velden.location = ref(omDeBeurt('speelt-in', locaties));
      const betrokken = some([...personen, ...onderzoekers, ...facties], 2 + Math.floor(random() * 3));
      if (betrokken.length) velden.involved = betrokken.map(ref);
      break;
    }
    case 'session': {
      const [, , nummer, jaar, maand, dag] = row.bron;
      velden.session_number = String(nummer);
      velden.date_played = dutchDate(jaar, maand, dag);
      row.moment = { at: at(jaar, maand, dag), precision: 'day' };
      const aanwezig = some(onderzoekers, 3 + Math.floor(random() * 3));
      if (aanwezig.length) velden.investigators_present = aanwezig.map(ref);
      break;
    }
    default:
      break;
  }

  /* De lopende tekst. Één opening, twee tot vier zinnen, elk met echte chips. */
  const pool = alle.filter((r) => r.id !== row.id);
  const zinnen = DATA.ZINNEN[row.zinnen] ?? [];
  /* Bij toeval gekozen staat dezelfde opening twee artikelen na elkaar; bij
     toerbeurt komt hij pas na drie terug. */
  const openingen = DATA.OPENINGEN[row.zinnen] ?? [];
  const alinea1 = [openingen.length ? openingen[van(row.soort).indexOf(row) % openingen.length] : ''];
  const gekozenZinnen = some(zinnen, 2 + Math.floor(random() * 3));
  const alineas = [];
  let huidig = [alinea1[0] ? `${alinea1[0]} ` : ''];
  /**
   * Een chip komt uit de soort die de zin noemt. Bestaat die soort niet in dit
   * archief, of is hij leeg op dit artikel na, dan de hele pot — een vreemde
   * zin is minder erg dan een alinea die halverwege ophoudt.
   */
  const uit = (soorten) => {
    const lijst = [soorten ?? []].flat().flatMap((s) => van(s));
    const bruikbaar = lijst.filter((r) => r.id !== row.id);
    return ref(bruikbaar.length ? pick(bruikbaar) : pick(pool));
  };
  for (const [i, zin] of gekozenZinnen.entries()) {
    const a = uit(zin.a);
    const b = uit(zin.b);
    huidig = huidig.concat(sentence(zin.t, a, b));
    huidig.push(' ');
    if (i === 1 && gekozenZinnen.length > 2) {
      alineas.push(huidig);
      huidig = [];
    }
  }
  alineas.push(huidig);
  row.body = doc(alineas.filter((p) => p.length));
  row.bodyText = textOf(row.body);
  row.tags = some(DATA.TAGS[row.zinnen] ?? [], 2 + Math.floor(random() * 2));

  /* Zichtbaarheid: het meeste staat open, en een handvol niet. */
  row.visibility = chance(0.07) ? 'keeper' : 'all';
  row.isLocked = chance(0.06) ? 1 : 0;
  row.viewMode = row.visibility === 'all' && chance(0.05) ? 'some' : 'all';
  row.editMode = chance(0.08) ? 'some' : 'all';
  row.keeperNotes = chance(0.2)
    ? pick([
        'Nog niet aan de spelers laten zien. Eerst de tijdlijn rechttrekken.',
        'Dit is de haak voor sessie 17.',
        'Klopt niet met wat Neerhoff zei. Bewust.',
        'Als ze hier doorheen prikken: het antwoord staat bij het Holle Tij.',
      ])
    : '';
}

/* ------------------------------------------------------------ wegschrijven */

const insertEntry = db.prepare(
  `INSERT INTO entries (id, type_id, name, slug, short_description, body, body_text, fields, tags,
                        visibility, is_locked, view_mode, edit_mode, keeper_notes,
                        cover_asset_id, created_by, updated_by, created_at, updated_at)
   VALUES (@id, @type_id, @name, @slug, @short, @body, @body_text, @fields, @tags,
           @visibility, @is_locked, @view_mode, @edit_mode, @keeper_notes,
           @cover, @author, @author, @created, @updated)`,
);
const insertFts = db.prepare('INSERT INTO entries_fts (entry_id, name, short_description, body_text, tags) VALUES (?, ?, ?, ?, ?)');
const insertLink = db.prepare("INSERT OR IGNORE INTO entry_links (from_entry_id, to_entry_id, kind, label) VALUES (?, ?, 'mention', '')");
const insertMention = db.prepare('INSERT OR IGNORE INTO entry_mentions (to_entry_id, from_kind, from_id, detail) VALUES (?, ?, ?, ?)');
const insertActivity = db.prepare('INSERT INTO activity (id, actor_id, verb, entry_id, case_id, board_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const insertRevision = db.prepare('INSERT INTO entry_revisions (id, entry_id, snapshot, edited_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?)');
const insertSection = db.prepare('INSERT INTO entry_sections (id, entry_id, title, body, body_text, visibility, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');

/** De klok loopt van februari tot september, zodat "laatst bewerkt" ergens op slaat. */
const START = Math.floor(Date.UTC(2026, 1, 14) / 1000);
const EIND = Math.floor(Date.now() / 1000);
const moment = () => START + Math.floor(random() * (EIND - START));

/* Omslagen — een op de drie artikelen, want een archief waar alles een plaat
   heeft ziet er even nep uit als een archief waar niets er een heeft. */
if (sharp) {
  process.stdout.write('  omslagen tekenen');
  for (const row of alle) {
    if (!chance(0.34)) continue;
    const svg = await maakOmslag(row.name, row.colour);
    const asset = await bewaar(svg, `${row.slug}.webp`);
    if (asset) row.cover = asset.id;
    process.stdout.write('.');
  }
  process.stdout.write('\n');
}

const SECTIETITELS = [
  ['Wat er in het rapport staat', 'all'],
  ['Wat de Keeper weet', 'keeper'],
  ['Nagekomen', 'all'],
  ['Niet vrijgegeven', 'keeper'],
  ['Bronnen', 'all'],
];

const schrijf = db.transaction(() => {
  for (const row of alle) {
    const gemaakt = moment();
    insertEntry.run({
      id: row.id,
      type_id: row.typeId,
      name: row.name,
      slug: row.slug,
      short: row.short,
      body: JSON.stringify(row.body),
      body_text: row.bodyText,
      fields: JSON.stringify(row.velden),
      tags: JSON.stringify(row.tags),
      visibility: row.visibility,
      is_locked: row.isLocked,
      view_mode: row.viewMode,
      edit_mode: row.editMode,
      keeper_notes: row.keeperNotes,
      cover: row.cover ?? null,
      author: keeper.id,
      created: gemaakt,
      updated: Math.min(EIND, gemaakt + Math.floor(random() * 1_000_000)),
    });
    manifest.entries.push(row.id);
    insertFts.run(row.id, row.name, row.short, row.bodyText, row.tags.join(' '));
    insertActivity.run(newId(), keeper.id, 'entry.created', row.id, null, null, gemaakt);
    if (chance(0.4)) insertActivity.run(newId(), pick(users).id, 'entry.edited', row.id, null, null, moment());
    insertRevision.run(
      newId(),
      row.id,
      JSON.stringify({
        name: row.name,
        shortDescription: row.short,
        body: row.body,
        bodyText: row.bodyText,
        fields: row.velden,
        tags: row.tags,
        typeId: row.typeId,
      }),
      keeper.id,
      'aangemaakt',
      gemaakt,
    );

    for (const id of linksIn(row.body)) if (id !== row.id) insertLink.run(row.id, id);

    /* §27: wat de infobox noemt, is een vermelding van soort 'field'. Dezelfde
       rij die `recomputeFieldMentions` zou schrijven, met het label van het
       veld erachter. */
    const typeVelden = JSON.parse(typeRows.find((t) => t.id === row.typeId)?.fields ?? '[]');
    for (const def of typeVelden) {
      if (def.kind !== 'entry_link' && def.kind !== 'entry_links') continue;
      const waarde = row.velden[def.key];
      const lijst = Array.isArray(waarde) ? waarde : waarde ? [waarde] : [];
      for (const item of lijst) {
        if (item?.id && item.id !== row.id) insertMention.run(item.id, 'field', row.id, def.label ?? '');
      }
    }
  }

  /* Secties, waarvan een deel alleen voor de Keeper. */
  for (const row of alle) {
    if (!chance(0.3)) continue;
    const hoeveel = 1 + Math.floor(random() * 2);
    for (const [i, [titel, zicht]] of some(SECTIETITELS, hoeveel).entries()) {
      const doel = pick(alle.filter((r) => r.id !== row.id));
      const body = doc([sentence(pick(['Zie ook %A, waar hetzelfde gemeld is.', 'Dit is nagegaan bij %A en klopt.', 'De verwijzing naar %A is later toegevoegd.']), ref(doel), ref(doel))]);
      const id = newId();
      insertSection.run(id, row.id, titel, JSON.stringify(body), textOf(body), zicht, (i + 1) * 10);
      insertMention.run(doel.id, 'section', row.id, titel);
    }
  }

  /* Een paar rechten die niet 'iedereen' zijn, zodat §17 iets te doen heeft. */
  for (const row of alle) {
    if (row.viewMode !== 'some' && row.editMode !== 'some') continue;
    for (const gebruiker of some(users, 2)) {
      db.prepare(
        `INSERT OR IGNORE INTO access_grants (target_type, target_id, user_id, can_view, can_edit)
         VALUES ('entry', ?, ?, 1, ?)`,
      ).run(row.id, gebruiker.id, row.editMode === 'some' ? 1 : 0);
    }
  }
});
schrijf();

/* ---------------------------------------------------------------- karakters */
/* §18: een speler draagt een onderzoeker. Zonder dit mag niemand iets schrijven. */

const onderzoekers = van('investigator').filter(zichtbaar);
const karakterVan = new Map();
db.transaction(() => {
  for (const [i, gebruiker] of users.entries()) {
    const eigen = onderzoekers.filter((_, n) => n % users.length === i).slice(0, 2);
    for (const [n, artikel] of eigen.entries()) {
      db.prepare('INSERT OR IGNORE INTO user_characters (user_id, entry_id, sort_order) VALUES (?, ?, ?)').run(gebruiker.id, artikel.id, n * 10);
      db.prepare("INSERT INTO activity (id, actor_id, verb, entry_id, created_at) VALUES (?, ?, 'character.added', ?, ?)").run(newId(), gebruiker.id, artikel.id, moment());
    }
    if (eigen[0]) {
      db.prepare('UPDATE users SET active_character_id = ? WHERE id = ?').run(eigen[0].id, gebruiker.id);
      karakterVan.set(gebruiker.id, eigen[0].id);
    }
  }
})();

/* ----------------------------------------------------------------- dossiers */

const DOSSIERS = [
  ['Het ongewonden licht', 'Waarom draait de lamp van Westkapelle elf weken zonder dat iemand hem heeft opgewonden?', 'open'],
  ['De jongen uit de Oosterschelde', 'Eenendertig graden aan de kade, tweemaal begraven, en niemand die hem opeist.', 'open'],
  ['De heren met de apparatuur', 'Wie zijn de vier Duitsers, wat kopen ze op, en van wiens geld?', 'open'],
  ['Lijn vier', 'Wat er tussen twee en vier ’s nachts over een lijn gaat die geen abonnee heeft.', 'open'],
  ['Het Holle Tij', 'Negen uur droge zeebodem, tweemaal per maand, en de sporen die de bodem op lopen.', 'open'],
  ['De Verdronken Polder', 'Zeventienhonderd hectare, één nacht, geen dijkbreuk. En wat de ploeg van Bogaert eruit haalde.', 'gesloten'],
];

const cases = [];
db.transaction(() => {
  for (const [naam, samenvatting, status] of DOSSIERS.slice(0, Math.max(3, Math.min(6, Math.ceil(PER / 3))))) {
    const id = newId();
    const inhoud = some(alle.filter(zichtbaar), 8 + Math.floor(random() * 10));
    const notitieDoelen = some(inhoud, 3);
    const notities = doc([
      sentence('Losse eindjes: %A is nagegaan, %B nog niet.', ref(notitieDoelen[0] ?? alle[0]), ref(notitieDoelen[1] ?? alle[1])),
      sentence('Afspraak: niemand praat met %A zonder dat er iemand meegaat.', ref(notitieDoelen[2] ?? alle[2]), ref(notitieDoelen[2] ?? alle[2])),
    ]);
    const gemaakt = moment();
    db.prepare(
      `INSERT INTO cases (id, name, slug, summary, notes, notes_text, keeper_notes, status, visibility, tab_types, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'all', ?, ?, ?, ?)`,
    ).run(
      id,
      naam,
      vrijeSlugDossier(naam),
      samenvatting,
      JSON.stringify(notities),
      textOf(notities),
      chance(0.5) ? 'De echte reden staat in het reliekdossier.' : '',
      status,
      chance(0.5) ? JSON.stringify(['clue', 'item', 'character', 'location']) : null,
      keeper.id,
      gemaakt,
      gemaakt,
    );
    manifest.cases.push(id);
    db.prepare("INSERT INTO activity (id, actor_id, verb, case_id, created_at) VALUES (?, ?, 'case.created', ?, ?)").run(newId(), keeper.id, id, gemaakt);
    db.prepare('INSERT OR IGNORE INTO case_members (case_id, user_id) VALUES (?, ?)').run(id, keeper.id);
    for (const gebruiker of some(users, 3 + Math.floor(random() * 3))) {
      db.prepare('INSERT OR IGNORE INTO case_members (case_id, user_id) VALUES (?, ?)').run(id, gebruiker.id);
    }
    for (const artikel of inhoud) {
      db.prepare('INSERT OR IGNORE INTO case_entries (case_id, entry_id, added_by, note) VALUES (?, ?, ?, ?)').run(id, artikel.id, keeper.id, chance(0.3) ? 'Nog niet nagegaan.' : '');
      /* §24: een clue of voorwerp hoort in het dossier waar hij gevonden is. */
      if ((artikel.soort === 'clue' || artikel.soort === 'item') && !artikel.origineel) {
        db.prepare('UPDATE entries SET origin_case_id = ? WHERE id = ?').run(id, artikel.id);
        artikel.origineel = id;
      }
    }
    for (const doel of linksIn(notities)) insertMention.run(doel, 'case', id, '');
    cases.push({ id, naam, inhoud });
  }
})();

function vrijeSlugDossier(naam) {
  const basis = slugify(naam);
  let slug = basis;
  let n = 2;
  while (db.prepare('SELECT id FROM cases WHERE slug = ?').get(slug)) slug = `${basis}-${n++}`;
  return slug;
}

/* --------------------------------------------------------------- landkaarten */

const maps = [];
if (sharp) {
  const platen = [
    ['Walcheren na de Drift', 'Opgemeten in maart, en op vier plaatsen al achterhaald.'],
    ['Het Sloe en de Oosterschelde', 'Dieptes volgens de laatste peiling. De tweede peiling staat er niet op.'],
  ];
  for (const [naam, omschrijving] of platen) {
    const svg = await maakKaart(naam);
    const asset = await bewaar(svg, `${slugify(naam)}.webp`, 3200);
    if (!asset) continue;
    const id = newId();
    let slug = slugify(naam);
    let n = 2;
    while (db.prepare('SELECT id FROM maps WHERE slug = ?').get(slug)) slug = `${slugify(naam)}-${n++}`;
    db.prepare(
      `INSERT INTO maps (id, name, slug, asset_id, width, height, description, sort_order, created_by, entry_id, view_mode, edit_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'all', 'all', ?, ?)`,
    ).run(id, naam, slug, asset.id, asset.width, asset.height, omschrijving, maps.length * 10, keeper.id, van('location')[maps.length]?.id ?? null, moment(), moment());
    manifest.maps.push(id);
    logLos('map.created', { mapId: id, name: naam });
    maps.push({ id, naam });
  }

  db.transaction(() => {
    for (const [i, kaart] of maps.entries()) {
      const doelen = some(van('location').filter(zichtbaar), 8);
      for (const artikel of doelen) {
        const pinId = newId();
        db.prepare(
          `INSERT INTO map_pins (id, map_id, kind, entry_id, name, text, x, y, created_by, character_id, created_at, updated_at)
           VALUES (?, ?, 'entry', ?, ?, '', ?, ?, ?, ?, ?, ?)`,
        ).run(pinId, kaart.id, artikel.id, artikel.name, 0.1 + random() * 0.8, 0.1 + random() * 0.8, keeper.id, null, moment(), moment());
        insertMention.run(artikel.id, 'map', kaart.id, '');
      }
      /* Notitie-spelden, met een naam in de tekst — die telt ook als vermelding. */
      for (let n = 0; n < 3; n++) {
        const genoemd = pick(alle.filter(zichtbaar));
        const naam = pick(['Hier gezien', 'Niet doorlopen', 'Vraag Boone', 'Sporen', 'Afgezet']);
        db.prepare(
          `INSERT INTO map_pins (id, map_id, kind, name, text, x, y, created_by, created_at, updated_at)
           VALUES (?, ?, 'note', ?, ?, ?, ?, ?, ?, ?)`,
        ).run(newId(), kaart.id, naam, `Volgens [[${genoemd.name}]] klopt dit niet met het rapport.`, 0.1 + random() * 0.8, 0.1 + random() * 0.8, pick(users).id, moment(), moment());
        insertMention.run(genoemd.id, 'map', kaart.id, naam);
      }
      /* §39: een speld die naar een andere landkaart wijst. */
      const ander = maps[(i + 1) % maps.length];
      if (ander && ander.id !== kaart.id) {
        db.prepare(
          `INSERT INTO map_pins (id, map_id, kind, name, text, x, y, target_map_id, created_by, created_at, updated_at)
           VALUES (?, ?, 'map', ?, '', ?, ?, ?, ?, ?, ?)`,
        ).run(newId(), kaart.id, ander.naam, 0.5 + random() * 0.3, 0.5 + random() * 0.3, ander.id, keeper.id, moment(), moment());
      }
    }
  })();
}

/* ---------------------------------------------------------------- tijdlijnen */

const timelines = [];
db.transaction(() => {
  const assen = [
    ['De eerste zes maanden', 'Van de nacht van de Drift tot de veiling in de abdijkelder.', 'day', null],
    ['De nacht van 9 februari', 'Uur voor uur, voor zover iemand het heeft opgeschreven.', 'hour', cases[0]?.id ?? null],
    ['Wat er vóór ons gebeurde', 'De watersnood, het verbod, en de eerste vermelding van de Broederschap.', 'year', null],
  ];
  for (const [naam, omschrijving, schaal, caseId] of assen) {
    const id = newId();
    let slug = slugify(naam);
    let n = 2;
    while (db.prepare('SELECT id FROM timelines WHERE slug = ?').get(slug)) slug = `${slugify(naam)}-${n++}`;
    db.prepare(
      `INSERT INTO timelines (id, name, slug, description, case_id, scale, view_mode, edit_mode, created_by, created_at, updated_at, anchor_at, anchor_unit)
       VALUES (?, ?, ?, ?, ?, ?, 'all', 'all', ?, ?, ?, ?, ?)`,
    ).run(id, naam, slug, omschrijving, caseId, schaal, keeper.id, moment(), moment(), schaal === 'hour' ? at(1934, 2, 9) : null, schaal === 'hour' ? 'day' : null);
    manifest.timelines.push(id);
    logLos('timeline.created', { timelineId: id, name: naam }, caseId);

    const opDeAs = van('event').filter((r) => zichtbaar(r) && r.moment);
    const gekozen = schaal === 'year' ? opDeAs.filter((r) => r.moment.at < at(1900, 1, 1)) : opDeAs.filter((r) => r.moment.at >= at(1900, 1, 1));
    for (const artikel of (gekozen.length ? gekozen : opDeAs).slice(0, 12)) {
      const seconden = schaal === 'hour' ? at(1934, 2, 9, 1 + Math.floor(random() * 20), Math.floor(random() * 60)) : artikel.moment.at;
      db.prepare(
        `INSERT INTO timeline_events (id, timeline_id, kind, entry_id, name, text, at, precision, created_by, created_at, updated_at)
         VALUES (?, ?, 'entry', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(newId(), id, artikel.id, artikel.name, chance(0.4) ? 'Volgens twee getuigen; de derde spreekt het tegen.' : '', seconden, schaal === 'hour' ? 'minute' : artikel.moment.precision, keeper.id, moment(), moment());
      insertMention.run(artikel.id, 'timeline', id, '');
      db.prepare("INSERT INTO activity (id, actor_id, verb, entry_id, created_at) VALUES (?, ?, 'timeline.event_added', ?, ?)").run(newId(), keeper.id, artikel.id, moment());
    }
    /* Losse notities op de as, met een naam erin, zodat "Genoemd in" ook die kant kent. */
    for (let n = 0; n < 3; n++) {
      const genoemd = pick(alle.filter(zichtbaar));
      const naamNotitie = pick(['Onbevestigd', 'Volgens de krant', 'Gerucht', 'Nagekomen bericht']);
      db.prepare(
        `INSERT INTO timeline_events (id, timeline_id, kind, name, text, at, precision, created_by, created_at, updated_at)
         VALUES (?, ?, 'note', ?, ?, ?, 'day', ?, ?, ?)`,
      ).run(newId(), id, naamNotitie, `Iemand meldt [[${genoemd.name}]], maar het staat in geen enkel rapport.`, at(1934, 2 + Math.floor(random() * 6), 1 + Math.floor(random() * 27)), pick(users).id, moment(), moment());
      insertMention.run(genoemd.id, 'timeline', id, naamNotitie);
    }
    timelines.push({ id, naam, caseId });
  }
})();

/* ---------------------------------------------------------------- prikborden */

const KLEUREN = ['red', 'ink', 'blue', 'green', 'gold', 'violet'];
const STIJLEN = ['solid', 'dashed', 'dotted', 'double', 'dashdot'];

db.transaction(() => {
  const wanden = [
    ['De muur van Westkapelle', cases[0]?.id ?? null],
    ['Wie kent wie', cases[1]?.id ?? null],
    ['Het Duitse gezelschap', cases[2]?.id ?? null],
    ['Losse einden', null],
    ['Alles wat warm is', cases[4]?.id ?? null],
  ];
  for (const [naam, caseId] of wanden) {
    const id = newId();
    const bron = caseId ? cases.find((c) => c.id === caseId)?.inhoud ?? alle : alle.filter(zichtbaar);
    const kaarten = [];

    for (const [i, artikel] of some(bron.filter(zichtbaar), 7).entries()) {
      kaarten.push({
        id: newId(),
        kind: 'entry',
        entryId: artikel.id,
        assetId: artikel.cover ?? null,
        crop: null,
        showImage: Boolean(artikel.cover),
        name: artikel.name,
        text: '',
        x: 140 + (i % 4) * 300,
        y: 140 + Math.floor(i / 4) * 360,
        rotation: Math.round((random() * 4 - 2) * 10) / 10,
        scale: chance(0.2) ? 1.5 : 1,
      });
      insertMention.run(artikel.id, 'board', id, '');
    }
    /* Notitiekaarten (§14: een geplakte foto is óók een notitie, geen eigen soort). */
    for (let n = 0; n < 3; n++) {
      const genoemd = pick(alle.filter(zichtbaar));
      const naamKaart = pick(['Vraag', 'Tegenspraak', 'Te doen', 'Van Boone gehoord']);
      kaarten.push({
        id: newId(),
        kind: 'note',
        entryId: null,
        assetId: null,
        crop: null,
        showImage: false,
        name: naamKaart,
        text: `Nagaan bij [[${genoemd.name}]] — dit klopt niet met het rapport.`,
        x: 160 + n * 320,
        y: 900,
        rotation: Math.round((random() * 4 - 2) * 10) / 10,
        scale: 1,
      });
      insertMention.run(genoemd.id, 'board', id, naamKaart);
    }
    /* Verwijzingen naar andere dingen dan artikelen, waar het web (§43) op leunt. */
    if (maps[0]) kaarten.push({ id: newId(), kind: 'map', mapId: maps[0].id, entryId: null, assetId: null, crop: null, showImage: false, name: maps[0].naam, text: '', x: 1300, y: 900, rotation: 1.1, scale: 1 });
    if (timelines[0]) kaarten.push({ id: newId(), kind: 'timeline', timelineId: timelines[0].id, entryId: null, assetId: null, crop: null, showImage: false, name: timelines[0].naam, text: '', x: 1300, y: 500, rotation: -0.8, scale: 1 });
    if (cases[1]) kaarten.push({ id: newId(), kind: 'case', caseId: cases[1].id, entryId: null, assetId: null, crop: null, showImage: false, name: cases[1].naam, text: '', x: 1300, y: 140, rotation: 0.4, scale: 1 });

    const touwtjes = [];
    for (let n = 0; n < Math.min(8, kaarten.length - 1); n++) {
      const a = kaarten[Math.floor(random() * kaarten.length)];
      const b = kaarten[Math.floor(random() * kaarten.length)];
      if (a.id === b.id) continue;
      touwtjes.push({
        id: newId(),
        from: { card: a.id },
        to: { card: b.id },
        label: pick(['kent', 'was erbij', 'zelfde nacht', 'betaalt', 'liegt hierover', 'ontkent', 'zelfde handschrift', '']),
        colour: pick(KLEUREN),
        width: pick([1.5, 2, 2, 4, 6.5]),
        style: pick(STIJLEN),
      });
    }
    /* Eén los eind, want dat is precies waar een prikbord voor is. */
    if (kaarten[0]) {
      touwtjes.push({ id: newId(), from: { card: kaarten[0].id }, to: { x: 1750, y: 720 }, label: 'nog niet benoemd', colour: 'red', width: 2, style: 'dashed' });
    }

    const gemaakt = moment();
    db.prepare(
      `INSERT INTO boards (id, name, case_id, state, created_by, created_at, updated_at, view_mode, edit_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'all', 'all')`,
    ).run(id, naam, caseId, JSON.stringify({ cards: kaarten, strings: touwtjes, viewport: { x: 0, y: 0, zoom: 0.8 } }), keeper.id, gemaakt, gemaakt);
    manifest.boards.push(id);
    db.prepare("INSERT INTO activity (id, actor_id, verb, board_id, case_id, created_at) VALUES (?, ?, 'board.created', ?, ?, ?)").run(newId(), keeper.id, id, caseId, gemaakt);
  }
})();

/* ------------------------------------------------------------- voorstellen */
/* §20: iemand die een artikel mag zien maar niet bewerken, dient een voorstel in. */

db.transaction(() => {
  for (const artikel of some(alle.filter(zichtbaar), 6)) {
    const speler = pick(users);
    const nieuweTekst = doc([[`${artikel.short} `, 'Aangevuld na de laatste sessie: dit klopt niet met wat er in het rapport staat.']]);
    db.prepare(
      `INSERT INTO pending_edits (id, entry_id, proposed_snapshot, proposed_by, status, character_id, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    ).run(
      newId(),
      artikel.id,
      JSON.stringify({
        name: artikel.name,
        shortDescription: artikel.short,
        body: nieuweTekst,
        bodyText: textOf(nieuweTekst),
        fields: artikel.velden,
        tags: artikel.tags,
        typeId: artikel.typeId,
      }),
      speler.id,
      karakterVan.get(speler.id) ?? null,
      moment(),
    );
  }
})();

/* -------------------------------------------------------------------- klaar */

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');

const tel = (sql, ...args) => db.prepare(sql).get(...args).n;
console.log('');
console.log(`Klaar. ${manifest.entries.length} artikelen over ${perSoort.size} soorten:`);
for (const soort of SOORTEN) {
  const rijen = perSoort.get(soort.slug);
  if (rijen?.length) console.log(`  ${String(rijen.length).padStart(3)}  ${soort.label}`);
}
console.log('');
console.log(`  ${manifest.cases.length} dossiers, ${manifest.boards.length} prikborden, ${manifest.timelines.length} tijdlijnen, ${manifest.maps.length} landkaarten, ${manifest.assets.length} platen`);
console.log(`  ${tel('SELECT COUNT(*) AS n FROM entry_links')} tekstverwijzingen, ${tel('SELECT COUNT(*) AS n FROM entry_mentions')} vermeldingen, ${tel('SELECT COUNT(*) AS n FROM pending_edits')} voorstellen`);
if (manifest.users.length) {
  console.log('');
  console.log(`  ${manifest.users.length} spelersaccounts, alle met wachtwoord "${WACHTWOORD}": ${SPELERS.map(([n]) => n).join(', ')}`);
}
console.log('');
console.log('  Opruimen kan met `npm run seed-wereld -- --clean`.');
console.log('  Draai `npm run dev` en open http://localhost:3000');
