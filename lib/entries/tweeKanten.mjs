/**
 * Golf O (Nick, 1 oktober): twee kanten van één feit.
 *
 * *"Lets say Sjaantje worships 'God' then 'God' should also get 'is worshipped
 * by' Sjaantje. In the details page. This is a two-sided connection, so if it
 * is removed then it is removed on both sides. Find what other ones also exist
 * in the page and link those up."*
 *
 * Het mechanisme is §66's spiegel (`lib/families/mirror.ts` +
 * `applyMirror` in `lib/entries/service.ts`), uitgebreid met `FieldDef.inverse`:
 * twee koppelingsvelden die elkaars sleutel noemen, zijn één feit. Dit bestand
 * is de *lijst* van die paren in het meegeleverde archief, en de eenmalige stap
 * die een bestaand archief erop zet (`seed:golf-o-twee-kanten` in
 * `lib/db/seed.mjs`). Een `.mjs`, omdat de seed het leest en geen TypeScript
 * mag openen (CLAUDE.md §5, de `run`-regel); puur behalve `applyTwoSides`, die
 * de database krijgt.
 *
 * Wat hier niet staat, met opzet: *Wijst naar*, *Betrokkenen* en *Toont of
 * beweert* wijzen naar elke soort, en een "andere kant" daarvan zou op elke
 * pagina van het archief een veld zetten. Daarvoor is *Genoemd in*.
 */

const GODEN = ['kosmische-goden', 'aardse-goden', 'eldritch-entiteiten', 'bovennatuurlijke-wezens'];
const MACHTEN = ['abnormality', ...GODEN];
const MENSEN = ['character', 'investigator'];

/**
 * Elk paar: twee kanten, elk een sleutel op een rij soorten. Bestaat het veld
 * al, dan krijgt het alleen `inverse`; staat er `make` bij en ontbreekt het, dan
 * komt het erbij (achteraan, met dat label en die doelsoorten).
 *
 * @type {{ a: Side, b: Side }[]}
 * @typedef {{ key: string, types: string[], make?: { label: string, kind: 'entry_link' | 'entry_links', ofType: string[] } }} Side
 */
export const TWO_SIDED = [
  // Vereert ↔ Vereerd door. Een abnormaliteit kan vereerd worden (Vereert mag
  // ernaar wijzen) maar had de andere kant niet.
  {
    a: { key: 'vereert', types: [...MENSEN, 'faction'] },
    b: {
      key: 'vereerd_door',
      types: MACHTEN,
      make: { label: 'Vereerd door', kind: 'entry_links', ofType: ['faction', ...MENSEN] },
    },
  },
  {
    a: { key: 'dienaar_van', types: MACHTEN },
    b: { key: 'dienaren', types: MACHTEN, make: { label: 'Dienaren', kind: 'entry_links', ofType: MACHTEN } },
  },
  {
    a: { key: 'faction', types: ['character'] },
    b: { key: 'leden', types: ['faction'], make: { label: 'Leden', kind: 'entry_links', ofType: ['character'] } },
  },
  // De familie had haar *Leden* al, en een Persoon zijn *Familie*: alleen nog
  // de twee sleutels die elkaar noemen.
  { a: { key: 'familie', types: [...MENSEN, 'abnormality'] }, b: { key: 'leden', types: ['family'] } },
  {
    a: { key: 'leader', types: ['faction'] },
    b: { key: 'leidt', types: ['character'], make: { label: 'Leidt', kind: 'entry_links', ofType: ['faction'] } },
  },
  {
    a: { key: 'hoofd', types: ['family'] },
    b: { key: 'hoofd_van', types: MENSEN, make: { label: 'Hoofd van', kind: 'entry_links', ofType: ['family'] } },
  },
  {
    a: { key: 'current_holder', types: ['object', 'item'] },
    b: { key: 'in_bezit', types: MENSEN, make: { label: 'In bezit', kind: 'entry_links', ofType: ['object', 'item'] } },
  },
  {
    a: { key: 'found_by', types: ['item', 'clue'] },
    b: { key: 'gevonden', types: ['investigator'], make: { label: 'Gevonden', kind: 'entry_links', ofType: ['clue', 'item'] } },
  },
  {
    a: { key: 'maker', types: ['werken'] },
    b: { key: 'maakte', types: [...MENSEN, 'faction'], make: { label: 'Maakte', kind: 'entry_links', ofType: ['werken'] } },
  },
  // De plekken: wat er over een locatie gezegd wordt, staat op de locatie.
  {
    a: { key: 'found_at', types: ['item', 'clue'] },
    b: { key: 'hier_gevonden', types: ['location'], make: { label: 'Hier gevonden', kind: 'entry_links', ofType: ['clue', 'item'] } },
  },
  {
    a: { key: 'last_seen_at', types: ['character'] },
    b: {
      key: 'laatst_hier_gezien',
      types: ['location'],
      make: { label: 'Laatst hier gezien', kind: 'entry_links', ofType: ['character'] },
    },
  },
  {
    a: { key: 'current_location', types: ['object'] },
    b: { key: 'hier_bewaard', types: ['location'], make: { label: 'Hier bewaard', kind: 'entry_links', ofType: ['object'] } },
  },
  {
    a: { key: 'base', types: ['faction'] },
    b: { key: 'basis_van', types: ['location'], make: { label: 'Basis van', kind: 'entry_links', ofType: ['faction'] } },
  },
  {
    a: { key: 'thuisbasis', types: ['family'] },
    b: { key: 'thuisbasis_van', types: ['location'], make: { label: 'Thuisbasis van', kind: 'entry_links', ofType: ['family'] } },
  },
  {
    a: { key: 'standplaats', types: ['aardse-goden'] },
    b: {
      key: 'standplaats_van',
      types: ['location'],
      make: { label: 'Standplaats van', kind: 'entry_links', ofType: ['aardse-goden'] },
    },
  },
  {
    a: { key: 'leefgebied', types: ['bovennatuurlijke-wezens'] },
    b: {
      key: 'leefgebied_van',
      types: ['location'],
      make: { label: 'Leefgebied van', kind: 'entry_links', ofType: ['bovennatuurlijke-wezens'] },
    },
  },
  {
    a: { key: 'first_sighting', types: ['abnormality'] },
    b: {
      key: 'eerst_gezien_hier',
      types: ['location'],
      make: { label: 'Hier voor het eerst gezien', kind: 'entry_links', ofType: ['abnormality'] },
    },
  },
  {
    a: { key: 'location', types: ['event'] },
    b: {
      key: 'gebeurtenissen_hier',
      types: ['location'],
      make: { label: 'Gebeurtenissen hier', kind: 'entry_links', ofType: ['event'] },
    },
  },
  {
    a: { key: 'bevindt_zich', types: ['werken'] },
    b: { key: 'werken_hier', types: ['location'], make: { label: 'Werken hier', kind: 'entry_links', ofType: ['werken'] } },
  },
  {
    a: { key: 'gebied', types: ['language'] },
    b: { key: 'talen_hier', types: ['location'], make: { label: 'Gesproken talen', kind: 'entry_links', ofType: ['language'] } },
  },
  // Talen ↔ wie haar spreekt en waar zij geschreven staat.
  {
    a: { key: 'talen', types: [...MENSEN, 'object', 'abnormality', ...GODEN, 'faction', 'werken'] },
    b: {
      key: 'sprekers',
      types: ['language'],
      make: {
        label: 'Sprekers en geschriften',
        kind: 'entry_links',
        ofType: [...MENSEN, 'object', 'abnormality', ...GODEN, 'faction', 'werken'],
      },
    },
  },
  // Een taal die verwant is aan een andere: van beide kanten hetzelfde woord.
  { a: { key: 'verwant_aan', types: ['language'] }, b: { key: 'verwant_aan', types: ['language'] } },
  {
    a: { key: 'found_on', types: ['clue'] },
    b: { key: 'clues', types: ['session'], make: { label: 'Gevonden clues', kind: 'entry_links', ofType: ['clue'] } },
  },
  {
    a: { key: 'investigators_present', types: ['session'] },
    b: { key: 'sessies', types: ['investigator'], make: { label: 'Sessies', kind: 'entry_links', ofType: ['session'] } },
  },
];

/**
 * De lijsten onder de tekst die nu in *Meer info* staan: een soort, het id van
 * het blok, en het veld waarlangs het zich vulde (alleen ons eigen blok, niet
 * één dat een Keeper zelf zo noemde).
 */
export const NOW_IN_THE_INFOBOX = [
  ...GODEN.map((slug) => [slug, 'vereerders', 'vereert']),
  ...GODEN.map((slug) => [slug, 'dienaren', 'dienaar_van']),
  ['faction', 'leden', 'faction'],
  ['family', 'leden', 'familie'],
  ['location', 'hier-gevonden', 'found_at'],
  ['location', 'laatst-hier-gezien', 'last_seen_at'],
  ['investigator', 'gevonden-aanwijzingen', 'found_by'],
  ['language', 'sprekers', 'talen'],
];

/** Hooguit zoveel velden houdt `cleanFields` (lib/fieldKinds.ts); meer zou bij de volgende opslag in Beheer wegvallen. */
const MAX_FIELDS = 20;

const isLink = (field) => field && (field.kind === 'entry_link' || field.kind === 'entry_links');

/**
 * Zet de paren op de velden van één soort: `inverse` waar het veld er is (een
 * koppelingsveld zonder rol, met die sleutel), het veld erbij waar het
 * ontbreekt en `make` het zegt. Puur.
 *
 * @param {string} slug
 * @param {any[]} fields
 * @returns {{ fields: any[], changed: boolean }}
 */
export function pairFieldsOf(slug, fields) {
  const out = fields.map((field) => ({ ...field }));
  let changed = false;
  for (const { a, b } of TWO_SIDED) {
    for (const [side, other] of [
      [a, b],
      [b, a],
    ]) {
      if (!side.types.includes(slug)) continue;
      const found = out.find((field) => field && field.key === side.key);
      if (found) {
        // Een veld dat een rol heeft of geen koppeling is, is van iemand anders (§11).
        if (!isLink(found) || found.role) continue;
        if (found.inverse === other.key) continue;
        if (found.inverse) continue; // de Keeper koos al een andere kant
        found.inverse = other.key;
        changed = true;
      } else if (side.make && out.length < MAX_FIELDS) {
        out.push({ key: side.key, label: side.make.label, kind: side.make.kind, ofType: [...side.make.ofType], inverse: other.key });
        changed = true;
      }
    }
  }
  return { fields: out, changed };
}

/** Verberg de lijsten die *Meer info* nu zegt, alleen als ze nog de onze zijn. Puur. */
export function hideRepeatedBlocks(slug, blocks) {
  let changed = false;
  const out = blocks.map((block) => {
    const hit = NOW_IN_THE_INFOBOX.find(
      ([type, id, via]) => type === slug && block && block.id === id && block.kind === 'derived' && block.viaField === via,
    );
    if (!hit || block.hidden) return block;
    changed = true;
    return { ...block, hidden: true };
  });
  return { blocks: out, changed };
}

/** Een koppelingswaarde, vergevingsgezind gelezen: ids, in volgorde. */
function idsOf(value) {
  const one = (item) =>
    typeof item === 'string' ? item || null : item && typeof item === 'object' && typeof item.id === 'string' ? item.id : null;
  const out = [];
  for (const item of Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value]) {
    const id = one(item);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Vul de andere kant in van wat er al ingevuld is. Alleen erbij, nooit weg: een
 * archief dat al "Vereert: God" zei, krijgt op God "Vereerd door: Sjaantje";
 * wat op beide pagina's al stond, blijft staan. Een vak voor één artikel dat al
 * iemand anders noemt, blijft van die ander (geen gok wie gelijk heeft). Geen
 * versie, geen feed: dit is de spiegel die er altijd had moeten zijn. Puur over
 * rijen; geeft terug welke rijen veranderden.
 *
 * @param {{ id: string, typeSlug: string, fields: Record<string, unknown> }[]} entries
 * @param {Map<string, any[]>} defsBySlug
 * @param {(id: string) => object | null} refOf  de chip van een artikel: { id, name, slug, icon, colour }
 * @returns {Map<string, Record<string, unknown>>} id → nieuwe velden
 */
export function fillOtherSides(entries, defsBySlug, refOf) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const fieldsOf = new Map(entries.map((entry) => [entry.id, { ...(entry.fields ?? {}) }]));
  const changed = new Set();
  for (const entry of entries) {
    const defs = defsBySlug.get(entry.typeSlug) ?? [];
    for (const def of defs) {
      if (!isLink(def) || def.role || !def.inverse) continue;
      for (const targetId of idsOf(entry.fields?.[def.key])) {
        if (targetId === entry.id) continue;
        const target = byId.get(targetId);
        if (!target) continue;
        const other = (defsBySlug.get(target.typeSlug) ?? []).find(
          (field) => isLink(field) && !field.role && field.key === def.inverse && field.inverse === def.key,
        );
        if (!other) continue;
        const fields = fieldsOf.get(targetId);
        const held = idsOf(fields[other.key]);
        if (held.includes(entry.id)) continue;
        const ref = refOf(entry.id);
        if (!ref) continue;
        if (other.kind === 'entry_link') {
          if (held.length) continue;
          fields[other.key] = ref;
        } else {
          const raw = fields[other.key];
          const list = Array.isArray(raw) ? raw : raw === null || raw === undefined || raw === '' ? [] : [raw];
          fields[other.key] = [...list, ref];
        }
        changed.add(targetId);
      }
    }
  }
  const out = new Map();
  for (const id of changed) out.set(id, fieldsOf.get(id));
  return out;
}

/**
 * De eenmalige stap op een bestaand archief (en op een vers, na de seed): de
 * paren op de soorten, de herhaalde lijsten verborgen, en de andere kant van
 * elke koppeling die er al stond. Leegt `entry_mentions` als er iets bijkwam,
 * zodat de start het opnieuw opbouwt (`ensureMentionsBackfilled`), zoals 0036.
 */
export function applyTwoSides(sqlite) {
  const types = sqlite.prepare('SELECT slug, icon, colour, fields, blocks FROM entry_types').all();
  const setType = sqlite.prepare('UPDATE entry_types SET fields = ?, blocks = ? WHERE slug = ?');
  const defsBySlug = new Map();
  const typeBySlug = new Map();
  for (const type of types) {
    let fields = [];
    let blocks = [];
    try {
      fields = JSON.parse(type.fields || '[]');
      blocks = JSON.parse(type.blocks || '[]');
    } catch {
      continue; // a hand-edited row is the Keeper's, and stays theirs
    }
    if (!Array.isArray(fields) || !Array.isArray(blocks)) continue;
    const paired = pairFieldsOf(type.slug, fields);
    const hidden = hideRepeatedBlocks(type.slug, blocks);
    if (paired.changed || hidden.changed) {
      setType.run(JSON.stringify(paired.fields), JSON.stringify(hidden.blocks), type.slug);
    }
    defsBySlug.set(type.slug, paired.fields);
    typeBySlug.set(type.slug, type);
  }

  const rows = sqlite
    .prepare(
      `SELECT e.id, e.name, e.slug, e.fields, t.slug AS typeSlug
         FROM entries e JOIN entry_types t ON t.id = e.type_id
        WHERE e.deleted_at IS NULL`,
    )
    .all();
  const entries = [];
  const info = new Map();
  for (const row of rows) {
    let fields = {};
    try {
      fields = JSON.parse(row.fields || '{}') ?? {};
    } catch {
      continue;
    }
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
    entries.push({ id: row.id, typeSlug: row.typeSlug, fields });
    info.set(row.id, row);
  }
  const refOf = (id) => {
    const row = info.get(id);
    if (!row) return null;
    const type = typeBySlug.get(row.typeSlug);
    return { id: row.id, name: row.name, slug: row.slug, icon: type?.icon ?? 'file', colour: type?.colour ?? '' };
  };
  const filled = fillOtherSides(entries, defsBySlug, refOf);
  const setFields = sqlite.prepare('UPDATE entries SET fields = ? WHERE id = ?');
  for (const [id, fields] of filled) setFields.run(JSON.stringify(fields), id);
  if (filled.size) sqlite.prepare('DELETE FROM entry_mentions').run();
  return { types: types.length, filled: filled.size };
}

/**
 * Golf O: *"Also there is a 'Famillie' field and a 'Achternaam' field. The
 * achternaam field is useless, remove it."* Ronde 33 haalde het al weg waar het
 * leeg was (`seed:round-33-drop-achternaam`); nu ook waar iets in staat, op
 * Nicks woord. De waarden blijven in `entries.fields` staan: een Keeper die het
 * veld terugzet, ziet ze weer. Alleen een Tekst-veld met die sleutel of dat label.
 */
export function dropAchternaam(sqlite) {
  const setFields = sqlite.prepare('UPDATE entry_types SET fields = ? WHERE slug = ?');
  let dropped = 0;
  for (const slug of MENSEN) {
    const row = sqlite.prepare('SELECT fields FROM entry_types WHERE slug = ?').get(slug);
    if (!row) continue;
    try {
      const fields = JSON.parse(row.fields || '[]');
      if (!Array.isArray(fields)) continue;
      const isIt = (field) =>
        field &&
        (field.kind === 'text' || field.kind === 'longtext') &&
        (field.key === 'achternaam' || String(field.label ?? '').trim().toLowerCase() === 'achternaam');
      if (!fields.some(isIt)) continue;
      setFields.run(JSON.stringify(fields.filter((field) => !isIt(field))), slug);
      dropped += 1;
    } catch {
      /* een rij die met de hand gezet is, blijft van de Keeper */
    }
  }
  return dropped;
}
