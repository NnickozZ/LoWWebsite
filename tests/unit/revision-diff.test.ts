import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  bodyChange,
  bodyEdit,
  bodyLines,
  bodyPhrase,
  changeSummary,
  describeRevision,
  revisionFacts,
  revisionFactsFromRow,
  type RevisionFacts,
} from '@/lib/entries/revisionDiff';
import type { FieldDef } from '@/lib/db/schema';

/**
 * §65: the geschiedenis says what changed.
 *
 * Two halves, and they pin two different claims.
 *
 * The **pure** half is `describeRevision` on snapshots built by hand: that every
 * kind of change gets a sentence, that a koppeling is counted and never named
 * (rule 7), and that zichtbaarheid and Keeper-aantekeningen are silent for
 * anyone but a Keeper. If a future round adds a key to a snapshot, the test that
 * should fail is in here.
 *
 * The **archive** half runs the real thing: make an artikel, change it three
 * ways, and read the history back through `listRevisions` — because the ten
 * `json_extract` columns, the `rowid` tiebreak and the step-from-the-row-below
 * reading are exactly the parts that no amount of hand-built JSON can check.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-revdiff-'));
process.env.DATA_DIR = dir;

const FIELDS: FieldDef[] = [
  { key: 'beroep', label: 'Beroep', kind: 'text' },
  { key: 'leeftijd', label: 'Leeftijd', kind: 'number' },
  { key: 'dood', label: 'Dood', kind: 'boolean' },
  { key: 'notities', label: 'Notities', kind: 'longtext' },
  { key: 'faction', label: 'Factie', kind: 'entry_link' },
  { key: 'kennissen', label: 'Kennissen', kind: 'entry_links' },
];

function facts(over: Partial<RevisionFacts> = {}): RevisionFacts {
  return revisionFacts({
    name: 'Jacob den Hollander',
    shortDescription: 'Een havenmeester.',
    bodyText: 'Eerste regel.\nTweede regel.',
    fields: {},
    tags: [],
    typeId: 'character',
    coverAssetId: null,
    coverCrop: null,
    visibility: 'all',
    keeperNotes: '',
    ...over,
  });
}

/** The detail of the one change with this label, for short assertions below. */
function detailFor(changes: ReturnType<typeof describeRevision>, label: string): string | undefined {
  return changes.find((change) => change.label === label)?.detail;
}

describe('describeRevision — the nouns and their sentences', () => {
  it('calls the first revision aangelegd, and nothing else', () => {
    const changes = describeRevision(null, facts());
    expect(changes).toEqual([{ kind: 'created', label: 'Aangelegd' }]);
    expect(changeSummary(changes)).toBe('aangelegd');
  });

  it('says nothing when two snapshots are the same, and says it silently', () => {
    expect(describeRevision(facts(), facts())).toEqual([]);
    // An empty summary is printed as nothing at all. A row reading "geen
    // zichtbare wijziging" would be the tell that a Keeper moved the
    // zichtbaarheid dial, which is the one change a speler is not shown.
    expect(changeSummary([])).toBe('');
  });

  it('quotes the old and the new name', () => {
    const changes = describeRevision(facts(), facts({ name: 'J. den Hollander' }), { fields: FIELDS });
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('name');
    expect(changes[0].detail).toBe('“Jacob den Hollander” → “J. den Hollander”');
  });

  it('names the soort an artikel moved to', () => {
    const changes = describeRevision(facts(), facts({ typeId: 'clue' }), {
      typeLabels: { character: 'Personen', clue: 'Clues' },
    });
    expect(detailFor(changes, 'Soort')).toBe('Personen → Clues');
  });

  it('counts what happened to the prose', () => {
    const changes = describeRevision(
      facts(),
      facts({ bodyText: 'Eerste regel.\nTweede regel.\nDerde regel.' }),
    );
    expect(detailFor(changes, 'Tekst')).toBe('1 regel erbij');
  });

  it('§68: hangs the lines themselves on the Tekst change', () => {
    const changes = describeRevision(facts(), facts({ bodyText: 'Eerste regel.\nDerde regel.' }));
    const body = changes.find((change) => change.kind === 'body');
    expect(body?.detail).toBe('1 regel erbij, 1 regel eraf');
    expect(body?.lines).toEqual({ added: ['Derde regel.'], removed: ['Tweede regel.'], clipped: false });
  });

  it('§68: carries no lines for a step where only the order moved', () => {
    // The box under the row would be an empty box, which reads as a broken one.
    const changes = describeRevision(facts(), facts({ bodyText: 'Tweede regel.\nEerste regel.' }));
    const body = changes.find((change) => change.kind === 'body');
    expect(body?.detail).toBe('regels verplaatst');
    expect(body?.lines).toBeUndefined();
  });

  describe('the infobox', () => {
    it('distinguishes filled in, changed and emptied', () => {
      const filled = describeRevision(facts(), facts({ fields: { beroep: 'Havenmeester' } }), {
        fields: FIELDS,
      });
      expect(detailFor(filled, 'Beroep')).toBe('ingevuld: “Havenmeester”');

      const changed = describeRevision(
        facts({ fields: { beroep: 'Havenmeester' } }),
        facts({ fields: { beroep: 'Sleepbootkapitein' } }),
        { fields: FIELDS },
      );
      expect(detailFor(changed, 'Beroep')).toBe('“Havenmeester” → “Sleepbootkapitein”');

      const emptied = describeRevision(facts({ fields: { beroep: 'Havenmeester' } }), facts(), {
        fields: FIELDS,
      });
      expect(detailFor(emptied, 'Beroep')).toBe('leeggemaakt');
    });

    it('reads a Ja/nee as ja and nee, and a Getal as itself', () => {
      const changes = describeRevision(facts(), facts({ fields: { dood: true, leeftijd: 51 } }), {
        fields: FIELDS,
      });
      expect(detailFor(changes, 'Dood')).toBe('ingevuld: “ja”');
      expect(detailFor(changes, 'Leeftijd')).toBe('ingevuld: “51”');
    });

    it('treats absent, null and the empty string as the same unfilled answer', () => {
      // A dozen rounds of this app have written all three for "no answer", and a
      // history that cried "leeggemaakt" over the difference would cry on rows
      // where nobody touched the field at all.
      expect(describeRevision(facts({ fields: {} }), facts({ fields: { beroep: '' } }), { fields: FIELDS })).toEqual([]);
      expect(
        describeRevision(facts({ fields: { beroep: null } }), facts({ fields: {} }), { fields: FIELDS }),
      ).toEqual([]);
      expect(
        describeRevision(facts({ fields: { kennissen: [] } }), facts({ fields: {} }), { fields: FIELDS }),
      ).toEqual([]);
    });

    it('counts a koppeling and never names it', () => {
      const before = facts({ fields: { kennissen: ['e-1', 'e-2'], faction: 'e-9' } });
      const after = facts({ fields: { kennissen: ['e-2', 'e-3'], faction: 'e-8' } });
      const changes = describeRevision(before, after, { fields: FIELDS });
      expect(detailFor(changes, 'Kennissen')).toBe('1 erbij, 1 eraf');
      expect(detailFor(changes, 'Factie')).toBe('1 erbij, 1 eraf');
      // Rule 7: an id the reader may not be allowed to resolve never travels.
      const printed = JSON.stringify(changes);
      for (const id of ['e-1', 'e-2', 'e-3', 'e-8', 'e-9']) expect(printed).not.toContain(id);
    });

    it('does not quote a Lange tekst back at the reader', () => {
      const changes = describeRevision(
        facts({ fields: { notities: 'Een hele alinea over de haven.' } }),
        facts({ fields: { notities: 'Een hele andere alinea over de haven.' } }),
        { fields: FIELDS },
      );
      expect(detailFor(changes, 'Notities')).toBe('bijgewerkt');
    });

    it('keeps a value under a key the soort has since dropped, under its bare key', () => {
      const changes = describeRevision(facts({ fields: { oud_veld: 'iets' } }), facts({ fields: {} }), {
        fields: FIELDS,
      });
      expect(detailFor(changes, 'oud_veld')).toBe('leeggemaakt');
    });

    it('reads the infobox in the soort’s own order', () => {
      const changes = describeRevision(
        facts(),
        facts({ fields: { kennissen: ['e-1'], beroep: 'Havenmeester', leeftijd: 51 } }),
        { fields: FIELDS },
      );
      expect(changes.map((change) => change.label)).toEqual(['Beroep', 'Leeftijd', 'Kennissen']);
    });
  });

  it('lists tags that came and went', () => {
    const changes = describeRevision(facts({ tags: ['haven', 'dood'] }), facts({ tags: ['haven', 'spion'] }));
    expect(detailFor(changes, 'Tags')).toBe('+ spion · − dood');
  });

  it('tells an omslag added from one replaced from one taken away', () => {
    expect(detailFor(describeRevision(facts(), facts({ coverAssetId: 'a-1' })), 'Omslag')).toBe('toegevoegd');
    expect(
      detailFor(describeRevision(facts({ coverAssetId: 'a-1' }), facts({ coverAssetId: 'a-2' })), 'Omslag'),
    ).toBe('vervangen');
    expect(detailFor(describeRevision(facts({ coverAssetId: 'a-1' }), facts()), 'Omslag')).toBe('weggehaald');
  });

  it('mentions a new uitsnede only while the omslag itself stayed put', () => {
    const recropped = describeRevision(
      facts({ coverAssetId: 'a-1', coverCrop: { portrait: { x: 0.2, y: 0.5, zoom: 1 } } }),
      facts({ coverAssetId: 'a-1', coverCrop: { portrait: { x: 0.7, y: 0.5, zoom: 1 } } }),
    );
    expect(detailFor(recropped, 'Uitsnede')).toBe('bijgesneden');
    // A replaced picture brings its own uitsnede; saying both would be noise.
    const replaced = describeRevision(
      facts({ coverAssetId: 'a-1', coverCrop: { portrait: { x: 0.2, y: 0.5, zoom: 1 } } }),
      facts({ coverAssetId: 'a-2', coverCrop: { portrait: { x: 0.7, y: 0.5, zoom: 1 } } }),
    );
    expect(replaced.map((change) => change.label)).toEqual(['Omslag']);
  });

  describe('what a speler is not told', () => {
    const before = facts({ visibility: 'keeper', keeperNotes: 'Hij liegt over de vuurtoren.' });
    const after = facts({ visibility: 'all', keeperNotes: '' });

    it('says nothing about zichtbaarheid or Keeper-aantekeningen', () => {
      expect(describeRevision(before, after)).toEqual([]);
      expect(describeRevision(before, after, { showKeeper: false })).toEqual([]);
    });

    it('does not leave "geen zichtbare wijziging" standing as a tell', () => {
      expect(changeSummary(describeRevision(before, after))).toBe('');
    });

    it('tells a Keeper both, and never the words of the notes', () => {
      const changes = describeRevision(before, after, { showKeeper: true });
      expect(detailFor(changes, 'Zichtbaar voor')).toBe('alleen de Keeper → iedereen');
      expect(detailFor(changes, 'Keeper-aantekeningen')).toBe('gewist');
      expect(JSON.stringify(changes)).not.toContain('vuurtoren');
    });
  });

  describe('an epoch the archive kept shut', () => {
    // Written while the artikel stood on the Keeperkant, emptied again, and the
    // artikel opened up afterwards. The *nouns* still stand in the history —
    // that an edit happened is what the row says by existing — but not one
    // answer from behind that door is read out loud.
    const shut = facts({ visibility: 'keeper', name: 'De moordenaar', fields: { beroep: 'de moordenaar' }, tags: ['dader'] });
    const open = facts({ visibility: 'all', name: 'Jacob den Hollander', fields: {}, tags: [] });

    it('names what moved and quotes nothing', () => {
      const changes = describeRevision(shut, open, { fields: FIELDS });
      expect(detailFor(changes, 'Naam')).toBe('gewijzigd');
      expect(detailFor(changes, 'Beroep')).toBe('leeggemaakt');
      expect(detailFor(changes, 'Tags')).toBe('1 eraf');
      expect(JSON.stringify(changes)).not.toContain('moordenaar');
      expect(JSON.stringify(changes)).not.toContain('dader');
    });

    it('stays shut when only the *other* side of the step was shut', () => {
      // Either side is enough: a value typed in the open and hidden a moment
      // later is as much the Keeper's as one typed behind the door.
      const changes = describeRevision(open, shut, { fields: FIELDS });
      expect(detailFor(changes, 'Beroep')).toBe('ingevuld');
      expect(JSON.stringify(changes)).not.toContain('moordenaar');
    });

    it('§68: counts the prose and quotes not one line of it', () => {
      const changes = describeRevision(
        facts({ visibility: 'keeper', bodyText: 'Hij heeft het gedaan.' }),
        facts({ visibility: 'all', bodyText: 'Een havenmeester.' }),
        { fields: FIELDS },
      );
      const body = changes.find((change) => change.kind === 'body');
      // The count stays: a count is not a quotation, and the row already says
      // by existing that somebody wrote something.
      expect(body?.detail).toBe('1 regel erbij, 1 regel eraf');
      expect(body?.lines).toBeUndefined();
      expect(JSON.stringify(changes)).not.toContain('gedaan');
    });

    it('§68: reads the lines of a shut epoch to a Keeper', () => {
      const changes = describeRevision(
        facts({ visibility: 'keeper', bodyText: 'Hij heeft het gedaan.' }),
        facts({ visibility: 'all', bodyText: 'Een havenmeester.' }),
        { fields: FIELDS, showKeeper: true },
      );
      expect(changes.find((change) => change.kind === 'body')?.lines?.removed).toEqual([
        'Hij heeft het gedaan.',
      ]);
    });

    it('reads it all to a Keeper', () => {
      const changes = describeRevision(shut, open, { fields: FIELDS, showKeeper: true });
      expect(detailFor(changes, 'Naam')).toBe('“De moordenaar” → “Jacob den Hollander”');
      expect(detailFor(changes, 'Tags')).toBe('− dader');
    });

    it('says nothing different about a step between two open epochs', () => {
      const changes = describeRevision(
        facts({ visibility: 'players', fields: { beroep: 'Havenmeester' } }),
        facts({ visibility: 'all', fields: { beroep: 'Sleepbootkapitein' } }),
        { fields: FIELDS },
      );
      expect(detailFor(changes, 'Beroep')).toBe('“Havenmeester” → “Sleepbootkapitein”');
    });
  });

  it('does not cry bijgesneden over a pre-round-19 crop beside a round-19 one', () => {
    // A legacy snapshot holds a bare `{x, y, zoom}`; `entries.coverCrop` comes
    // out of drizzle already normalised to `{portrait: {…}}`. Compared raw, the
    // two are different JSON and every old revision claimed a new uitsnede.
    const legacy = facts({ coverAssetId: 'a-1', coverCrop: { x: 0.5, y: 0.5, zoom: 1 } });
    const modern = facts({ coverAssetId: 'a-1', coverCrop: { portrait: { x: 0.5, y: 0.5, zoom: 1 } } });
    expect(describeRevision(legacy, modern)).toEqual([]);
  });

  it('summarises the nouns and counts the rest', () => {
    const many = describeRevision(
      facts(),
      facts({
        name: 'Anders',
        shortDescription: 'Anders.',
        bodyText: 'Iets anders.',
        tags: ['nieuw'],
        fields: { beroep: 'Havenmeester', leeftijd: 51 },
      }),
      { fields: FIELDS },
    );
    expect(changeSummary(many)).toBe('naam, eerste regel, tekst, beroep en 2 meer');
  });
});

describe('bodyChange', () => {
  it('counts lines both ways', () => {
    expect(bodyChange('een\ntwee', 'een\ntwee\ndrie')).toBe('1 regel erbij');
    expect(bodyChange('een\ntwee\ndrie', 'een')).toBe('2 regels eraf');
    expect(bodyChange('een\ntwee', 'een\ndrie\nvier')).toBe('2 regels erbij, 1 regel eraf');
  });

  it('falls back to words when every line is new but the count is not', () => {
    expect(bodyChange('een twee', 'een twee drie vier')).toBe('1 regel erbij, 1 regel eraf');
    expect(bodyChange('een twee', 'een twee drie')).toBe('1 regel erbij, 1 regel eraf');
  });

  it('says moved when the same lines come back in another order', () => {
    expect(bodyChange('een\ntwee', 'twee\neen')).toBe('regels verplaatst');
  });

  it('ignores blank lines, which a document gains and loses on its own', () => {
    expect(bodyChange('een\n\ntwee', 'een\ntwee')).toBe('regels verplaatst');
  });
});

/**
 * §68: the same pass, read the other way — not how many lines moved but which.
 * The claim worth pinning is that it *is* the same pass: the sentence on a
 * history row and the box under it must never be able to disagree.
 */
describe('bodyEdit', () => {
  it('gives the lines that came and went, in the order they stand', () => {
    const edit = bodyEdit('een\ntwee\ndrie', 'een\nvier\ndrie\nvijf');
    expect(edit.added).toEqual(['vier', 'vijf']);
    expect(edit.removed).toEqual(['twee']);
  });

  it('says the same thing as the sentence on the row', () => {
    for (const [before, after] of [
      ['een\ntwee', 'een\ndrie\nvier'],
      ['een\ntwee\ndrie', 'een'],
      ['een\ntwee', 'twee\neen'],
      ['een twee', 'een twee drie'],
    ]) {
      expect(bodyPhrase(bodyEdit(before, after))).toBe(bodyChange(before, after));
    }
  });

  it('spends a repeated line once, so three copies against two is one surplus', () => {
    const edit = bodyEdit('x\nx', 'x\nx\nx');
    expect(edit.added).toEqual(['x']);
    expect(edit.removed).toEqual([]);
  });

  it('has nothing to show for lines that only moved', () => {
    const edit = bodyEdit('een\ntwee', 'twee\neen');
    expect(edit.added).toEqual([]);
    expect(edit.removed).toEqual([]);
  });
});

describe('bodyLines', () => {
  it('carries ten lines a side and says when it cut', () => {
    const after = Array.from({ length: 14 }, (_, i) => `regel ${i}`).join('\n');
    const lines = bodyLines(bodyEdit('', after));
    expect(lines.added).toHaveLength(10);
    expect(lines.removed).toEqual([]);
    expect(lines.clipped).toBe(true);
  });

  it('shortens one very long line at a word rather than in the middle of one', () => {
    const long = 'woord '.repeat(80).trim();
    const lines = bodyLines(bodyEdit('', long));
    expect(lines.added[0].length).toBeLessThanOrEqual(240);
    expect(lines.added[0].endsWith('…')).toBe(true);
    expect(lines.added[0]).not.toContain('woor…');
    expect(lines.clipped).toBe(false);
  });
});

describe('revisionFactsFromRow', () => {
  it('parses the three columns json_extract hands back as text', () => {
    const row = revisionFactsFromRow({
      snapName: 'Jacob',
      snapBodyText: 'Regel.',
      snapFields: '{"beroep":"Havenmeester"}',
      snapTags: '["haven"]',
      snapCoverCrop: '{"portrait":{"x":0.2,"y":0.5,"zoom":1}}',
      snapTypeId: 'character',
    });
    expect(row.fields).toEqual({ beroep: 'Havenmeester' });
    expect(row.tags).toEqual(['haven']);
    // Through `normaliseCrops`, like the other side of every comparison.
    expect(row.coverCrop).toEqual({ portrait: { x: 0.2, y: 0.5, zoom: 1 } });
  });

  it('treats an unreadable or absent column as nothing rather than throwing', () => {
    const row = revisionFactsFromRow({ snapFields: 'not json at all', snapTags: null });
    expect(row.fields).toEqual({});
    expect(row.tags).toEqual([]);
    expect(row.name).toBe('');
  });
});

/* ------------------------------------------------------- the real archive */

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  /** Plain JS (rule 4), so it is typed here by what the test does with it. */
  seedBaseline: (sqlite: unknown) => void;
  createEntry: typeof import('@/lib/entries/service').createEntry;
  updateEntry: typeof import('@/lib/entries/service').updateEntry;
  listRevisions: typeof import('@/lib/entries/service').listRevisions;
  restoreRevision: typeof import('@/lib/entries/service').restoreRevision;
  writeRevision: typeof import('@/lib/entries/service').writeRevision;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };

/**
 * Pushes every revision of this artikel ten minutes into the past, so the next
 * save cannot coalesce with it.
 *
 * `writeRevision` replaces the newest snapshot instead of adding one when the
 * same person saves again inside five minutes — which is right (autosave would
 * otherwise write a revision per keystroke pause) and which means a test doing
 * three saves in three milliseconds gets *one* revision unless it says
 * otherwise. Real saves are minutes apart; this is how a test is.
 */
function age(entryId: string) {
  deps.sqlite
    .prepare('UPDATE entry_revisions SET created_at = created_at - 600 WHERE entry_id = ?')
    .run(entryId);
}

/** The history as the artikel page reads it: newest first, each row's changes. */
function historyOf(entryId: string) {
  const rows = deps.listRevisions(entryId);
  const all = rows.map((row) => revisionFactsFromRow(row));
  return rows.map((row, i) => ({
    note: row.note,
    summary: changeSummary(
      describeRevision(i + 1 < all.length ? all[i + 1] : null, all[i], { fields: FIELDS, showKeeper: true }),
    ),
  }));
}

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const seed = await import('@/lib/db/seed.mjs');
  const entries = await import('@/lib/entries/service');
  deps = {
    sqlite: dbModule.sqlite,
    seedBaseline: seed.seedBaseline,
    createEntry: entries.createEntry,
    updateEntry: entries.updateEntry,
    listRevisions: entries.listRevisions,
    restoreRevision: entries.restoreRevision,
    writeRevision: entries.writeRevision,
  };
  deps.seedBaseline(deps.sqlite);
  deps.sqlite
    .prepare(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper)
       VALUES ('keeper-1', 'Keeper', 'keeper', 'x', 'x', 1)`,
    )
    .run();
  // The soort this test's FIELDS describe, so a save is allowed to keep them.
  deps.sqlite
    .prepare("UPDATE entry_types SET fields = ? WHERE slug = 'character'")
    .run(JSON.stringify(FIELDS));
});

describe('the history of a real artikel', () => {
  it('reads each row as the step from the row below it', () => {
    const made = deps.createEntry({
      typeSlug: 'character',
      name: 'Jacob den Hollander',
      createdBy: KEEPER.id,
    });

    // Three saves, far enough apart that each gets its own revision.
    age(made.id);
    deps.updateEntry(made.id, { name: 'J. den Hollander' }, KEEPER);
    age(made.id);
    deps.updateEntry(made.id, { fields: { beroep: 'Havenmeester', leeftijd: 51 } }, KEEPER);
    age(made.id);
    deps.updateEntry(made.id, { tags: ['haven'] }, KEEPER);

    const history = historyOf(made.id);
    expect(history).toHaveLength(4);
    // Newest first, so the list reads backwards through the work that was done.
    expect(history.map((row) => row.summary)).toEqual(['tags', 'beroep, leeftijd', 'naam', 'aangelegd']);
  });

  it('keeps two revisions written in the same second in the order they were written', () => {
    // A restore writes two, and `created_at` is whole seconds. Without the
    // rowid tiebreak on `listRevisions` the history could read the pair
    // backwards and describe every row wrongly from there down.
    const made = deps.createEntry({ typeSlug: 'character', name: 'Eerste naam', createdBy: KEEPER.id });
    // Written back to back, on purpose: all three land in one second, which is
    // all `created_at` records.
    deps.writeRevision(made.id, KEEPER.id, 'tweede');
    deps.writeRevision(made.id, KEEPER.id, 'derde');

    const rows = deps.listRevisions(made.id);
    const notes = rows.map((row) => row.note);
    expect(new Set(rows.map((row) => row.createdAt)).size).toBe(1);
    expect(notes).toEqual(['derde', 'tweede', 'aangemaakt']);
  });

  it('snapshots the state a restore produced, not only the one it replaced', () => {
    const made = deps.createEntry({ typeSlug: 'character', name: 'Oude naam', createdBy: KEEPER.id });
    const first = deps.listRevisions(made.id)[0];
    age(made.id);
    deps.updateEntry(made.id, { name: 'Nieuwe naam' }, KEEPER);

    deps.restoreRevision(first.id, KEEPER);

    const rows = deps.listRevisions(made.id);
    // Newest first: the restored state, then the state it replaced.
    expect(rows[0].note).toBe('teruggezet');
    expect(rows[1].note).toBe('voor het terugzetten');
    expect(rows[0].snapName).toBe('Oude naam');
    expect(rows[1].snapName).toBe('Nieuwe naam');
    // And the row the reader sees on top says what the restore actually did.
    expect(historyOf(made.id)[0].summary).toBe('naam');
  });
});
