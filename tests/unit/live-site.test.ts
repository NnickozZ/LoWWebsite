import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

/**
 * §21: the site line against a real SQLite file.
 *
 * What has to hold: a write anywhere — through the service, or a bare
 * statement nobody wrapped — reaches exactly the tabs that watch its keys; a
 * key a viewer may not see is not watched, however politely they ask; the
 * presence roster is per place and forgets a line that left; and a record's
 * short texts are a room that ten tabs can type into and that writes itself
 * back to the archive as the last typist.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-site-'));
process.env.DATA_DIR = dir;

type Hub = typeof import('@/lib/live/hub');
type Changes = typeof import('@/lib/live/changes');
type Gate = typeof import('@/lib/live/gate');
type Docs = typeof import('@/lib/live/docs');
type Rooms = typeof import('@/lib/live/rooms');
let hub: Hub;
let changes: Changes;
let gate: Gate;
let docs: Docs;
let rooms: Rooms;
let sqlite: typeof import('@/lib/db').sqlite;
let entries: typeof import('@/lib/entries/service');
let cases: typeof import('@/lib/cases/service');

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

type Event = { event: string; data: unknown };

/** A pretend tab on the site line. */
function tab(clientId: string, userId: string) {
  const inbox: Event[] = [];
  const connection = hub.connect({
    id: `conn-${clientId}-${Math.random().toString(36).slice(2, 6)}`,
    clientId,
    userId,
    name: userId,
    send: (event) => inbox.push(event as Event),
  });
  const of = (name: string) => inbox.filter((e) => e.event === name);
  return { connection, inbox, of, clear: () => inbox.splice(0) };
}

const flush = () => changes.flushChanges();

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  sqlite = dbModule.sqlite;
  hub = await import('@/lib/live/hub');
  changes = await import('@/lib/live/changes');
  gate = await import('@/lib/live/gate');
  docs = await import('@/lib/live/docs');
  rooms = await import('@/lib/live/rooms');
  entries = await import('@/lib/entries/service');
  cases = await import('@/lib/cases/service');

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
  ] as const) {
    sqlite
      .prepare(`INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`)
      .run(id, name, name.toLowerCase(), keeper);
  }
  const para = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  const entry = (id: string, name: string, by: string, over: Record<string, unknown> = {}) =>
    sqlite
      .prepare(
        `INSERT INTO entries (id, type_id, name, slug, short_description, fields, body, body_text, visibility, created_by, view_mode, edit_mode, is_locked)
         VALUES (?, 'character', ?, ?, '', ?, ?, '', ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        name,
        id,
        JSON.stringify(over.fields ?? {}),
        JSON.stringify(para('tekst')),
        (over.visibility as string) ?? 'all',
        by,
        (over.viewMode as string) ?? 'all',
        (over.editMode as string) ?? 'all',
        (over.isLocked as number) ?? 0,
      );
  entry('open', 'Open fiche', 'bram', { fields: { beroep: 'visser', leeftijd: 40 } });
  entry('geheim', 'Geheime fiche', 'keeper-1', { visibility: 'keeper' });
  entry('vanbram', 'Van Bram', 'bram', { editMode: 'private' });
  sqlite
    .prepare(`INSERT INTO cases (id, name, slug, summary, notes, created_by, view_mode, edit_mode) VALUES ('zaak', 'De zaak', 'de-zaak', 'Eén regel', ?, 'bram', 'some', 'some')`)
    .run(JSON.stringify(para('Werktheorie')));
  sqlite
    .prepare(`INSERT INTO access_grants (target_type, target_id, user_id, can_view, can_edit) VALUES ('case', 'zaak', 'aagje', 1, 0)`)
    .run();
  // Anything the seeding above queued must not leak into the first test.
  flush();
});

afterAll(() => {
  hub.resetSiteHub();
  docs.resetDocHub();
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the gate', () => {
  it('lets a viewer watch what they may see, and nothing else', () => {
    expect(gate.canWatch('entries', BRAM)).toBe(true);
    expect(gate.canWatch('admin', BRAM)).toBe(false);
    expect(gate.canWatch('admin', KEEPER)).toBe(true);
    expect(gate.canWatch('entry:open', BRAM)).toBe(true);
    expect(gate.canWatch('entry:geheim', BRAM)).toBe(false);
    expect(gate.canWatch('entry:geheim', KEEPER)).toBe(true);
    expect(gate.canWatch('case:zaak', AAGJE)).toBe(true);
    expect(gate.canWatch('case:zaak', { id: 'nobody', isKeeper: false })).toBe(false);
    expect(gate.canWatch('page:/wiki', BRAM)).toBe(true);
    expect(gate.canWatch('page:/admin', BRAM)).toBe(false);
    expect(gate.canWatch('page:/wiki/character', BRAM)).toBe(true);
    expect(gate.canWatch('page:/etc/passwd', BRAM)).toBe(false);
    expect(gate.canWatch('entry:open', null)).toBe(false);
    expect(gate.canWatch('nonsense', BRAM)).toBe(false);
  });
});

describe('changed', () => {
  it('a service write reaches the tabs that watch its keys, once each, after the write', () => {
    const bram = tab('t-bram', 'bram');
    const aagje = tab('t-aagje', 'aagje');
    const elsewhere = tab('t-else', 'keeper-1');
    hub.setWatches(bram.connection, ['entry:open', 'entries']);
    hub.setWatches(aagje.connection, ['entries']);
    hub.setWatches(elsewhere.connection, ['cases']);
    bram.clear();
    aagje.clear();
    elsewhere.clear();

    entries.updateEntry('open', { name: 'Open fiche, hernoemd' }, BRAM);
    // Nothing yet: the queue empties on a timer, after the transaction.
    expect(bram.of('changed')).toHaveLength(0);
    flush();

    expect(bram.of('changed')).toHaveLength(1);
    const keys = (bram.of('changed')[0].data as { keys: string[] }).keys;
    expect(keys).toEqual(expect.arrayContaining(['entry:open', 'entries']));
    expect(aagje.of('changed')).toHaveLength(1);
    expect((aagje.of('changed')[0].data as { keys: string[] }).keys).toEqual(['entries']);
    expect(elsewhere.of('changed')).toHaveLength(0);

    hub.disconnect(bram.connection.id);
    hub.disconnect(aagje.connection.id);
    hub.disconnect(elsewhere.connection.id);
  });

  it('a bare statement nobody wrapped is heard too', () => {
    const watcher = tab('t-w', 'keeper-1');
    hub.setWatches(watcher.connection, ['case:zaak']);
    watcher.clear();
    // Through the ORM, as any service does — but no service function, no touch().
    cases.updateCase('zaak', { status: 'cold' }, KEEPER);
    flush();
    expect(watcher.of('changed').length).toBeGreaterThanOrEqual(1);
    expect((watcher.of('changed')[0].data as { keys: string[] }).keys).toContain('case:zaak');
    hub.disconnect(watcher.connection.id);
  });

  it('touch() is for what the parser cannot see', () => {
    const watcher = tab('t-t', 'bram');
    hub.setWatches(watcher.connection, ['site']);
    watcher.clear();
    changes.touch('site', 'words');
    flush();
    expect((watcher.of('changed')[0].data as { keys: string[] }).keys).toEqual(['site']);
    hub.disconnect(watcher.connection.id);
  });

  it('a gone line is not written to', () => {
    const watcher = tab('t-gone', 'bram');
    hub.setWatches(watcher.connection, ['entries']);
    hub.disconnect(watcher.connection.id);
    watcher.clear();
    changes.touch('entries');
    flush();
    expect(watcher.inbox).toHaveLength(0);
    expect(hub.watcherCount('entries')).toBe(0);
  });
});

describe('presence', () => {
  it('is per place, in arrival order, and forgets a line that left', () => {
    const a = tab('t-a', 'bram');
    const b = tab('t-b', 'aagje');
    const c = tab('t-c', 'keeper-1');
    hub.setPlace(a.connection, 'case:zaak');
    hub.setPlace(b.connection, 'case:zaak', ['card-1']);
    hub.setPlace(c.connection, 'page:/wiki');

    const roster = hub.peopleAt('case:zaak');
    expect(roster.map((p) => p.clientId)).toEqual(['t-a', 't-b']);
    expect(roster[1].holding).toEqual(['card-1']);
    // What goes on the wire has no account id in it.
    expect(Object.keys(roster[0]).sort()).toEqual(['clientId', 'colour', 'holding', 'name']);
    // Everyone at the place was told, the newcomer included; the wiki was not.
    expect(a.of('presence').length).toBeGreaterThanOrEqual(2);
    expect(c.of('presence').every((e) => (e.data as { place: string }).place === 'page:/wiki')).toBe(true);

    a.clear();
    hub.disconnect(b.connection.id);
    expect(hub.peopleAt('case:zaak').map((p) => p.clientId)).toEqual(['t-a']);
    expect(a.of('presence')).toHaveLength(1);

    // Moving place leaves the old one.
    hub.setPlace(a.connection, 'page:/wiki');
    expect(hub.peopleAt('case:zaak')).toEqual([]);
    expect(hub.peopleAt('page:/wiki').map((p) => p.clientId)).toEqual(['t-c', 't-a']);

    hub.disconnect(a.connection.id);
    hub.disconnect(c.connection.id);
  });

  it('a pointer frame goes to everyone else at the place and to nobody elsewhere', () => {
    const a = tab('t-pa', 'bram');
    const b = tab('t-pb', 'aagje');
    const c = tab('t-pc', 'keeper-1');
    hub.setPlace(a.connection, 'map:m1');
    hub.setPlace(b.connection, 'map:m1');
    hub.setPlace(c.connection, 'map:m2');
    a.clear();
    b.clear();
    c.clear();
    hub.publishPointer(a.connection, { c: 't-pa', x: 0.5, y: 0.25, m: { 'pin-1': [0.5, 0.25] } });
    expect(a.of('pointer')).toHaveLength(0);
    expect(b.of('pointer')).toHaveLength(1);
    expect(b.of('pointer')[0].data).toEqual({ place: 'map:m1', c: 't-pa', x: 0.5, y: 0.25, m: { 'pin-1': [0.5, 0.25] } });
    expect(c.of('pointer')).toHaveLength(0);
    for (const t of [a, b, c]) hub.disconnect(t.connection.id);
  });
});

describe('a fields room', () => {
  /** A tab in a fields room: its own Y.Doc, fed by what the room sends. */
  function fieldsTab(key: string, clientId: string, user: { id: string; isKeeper: boolean }) {
    const admission = rooms.admit(key, user);
    if (!admission) throw new Error(`no admission to ${key}`);
    const doc = new Y.Doc();
    const leave = docs.join(
      admission.spec,
      {
        clientId,
        userId: user.id,
        yClient: doc.clientID,
        send: (event) => {
          if (event.event === 'sync') Y.applyUpdate(doc, Buffer.from(event.data.state, 'base64'), 'remote');
          if (event.event === 'update') Y.applyUpdate(doc, Buffer.from(event.data.u, 'base64'), 'remote');
        },
      },
      admission.canEdit,
    );
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      docs.applyClientUpdate(key, clientId, Buffer.from(update).toString('base64'), user);
    });
    return { doc, leave, admission, text: (field: string) => doc.getText(field).toString() };
  }

  it('seeds every string of the record, and only the strings', () => {
    const t = fieldsTab('entry:open:fields', 'f1', BRAM);
    expect(t.text('name')).toBe('Open fiche, hernoemd');
    expect(t.text('shortDescription')).toBe('');
    expect(t.text('field.beroep')).toBe('visser');
    expect(t.doc.share.has('field.leeftijd')).toBe(false);
    t.leave();
  });

  it('two tabs typing in one name converge and the archive gets the merged name', () => {
    const a = fieldsTab('entry:open:fields', 'fa', BRAM);
    const b = fieldsTab('entry:open:fields', 'fb', AAGJE);
    const base = a.text('name');
    a.doc.getText('name').insert(0, 'Ⓐ ');
    b.doc.getText('name').insert(b.doc.getText('name').length, ' Ⓑ');
    expect(a.text('name')).toBe(`Ⓐ ${base} Ⓑ`);
    expect(b.text('name')).toBe(a.text('name'));
    a.doc.getText('field.beroep').insert(0, 'oud-');

    docs.persistAll();
    const row = sqlite.prepare('SELECT name, fields, updated_by FROM entries WHERE id = ?').get('open') as {
      name: string;
      fields: string;
      updated_by: string;
    };
    expect(row.name).toBe(`Ⓐ ${base} Ⓑ`);
    expect(JSON.parse(row.fields)).toMatchObject({ beroep: 'oud-visser', leeftijd: 40 });
    // The last typist is who the save is by.
    expect(row.updated_by).toBe('bram');
    a.leave();
    b.leave();
  });

  it('a plain write around the room brings the room into line, field by field', () => {
    const a = fieldsTab('entry:open:fields', 'fr', BRAM);
    a.doc.getText('shortDescription').insert(0, 'onderweg');
    entries.updateEntry('open', { name: 'Hernoemd om de kamer heen' }, KEEPER);
    expect(a.text('name')).toBe('Hernoemd om de kamer heen');
    // The field nobody rewrote keeps what was typed.
    expect(a.text('shortDescription')).toBe('onderweg');
    docs.persistAll();
    a.leave();
  });

  it('the gate is the record’s gate', () => {
    expect(rooms.admit('entry:geheim:fields', BRAM)).toBeNull();
    expect(rooms.admit('entry:geheim:fields', KEEPER)?.canEdit).toBe(true);
    expect(rooms.admit('entry:vanbram:fields', AAGJE)?.canEdit).toBe(false);
    expect(rooms.admit('entry:vanbram:fields', BRAM)?.canEdit).toBe(true);
    expect(rooms.admit('case:zaak:fields', AAGJE)?.canEdit).toBe(false);
    expect(rooms.admit('case:zaak:fields', { id: 'nobody', isKeeper: false })).toBeNull();
    expect(rooms.admit('case:zaak:fields', BRAM)?.canEdit).toBe(true);
    expect(rooms.admit('map:nope:fields', KEEPER)).toBeNull();
    expect(rooms.admit('pin:nope:fields', KEEPER)).toBeNull();
  });

  it('a case’s name and one-liner persist through updateCase', () => {
    const t = fieldsTab('case:zaak:fields', 'fc', BRAM);
    expect(t.text('summary')).toBe('Eén regel');
    t.doc.getText('summary').insert(t.doc.getText('summary').length, ', twee');
    docs.persistAll();
    const row = sqlite.prepare('SELECT summary FROM cases WHERE id = ?').get('zaak') as { summary: string };
    expect(row.summary).toBe('Eén regel, twee');
    t.leave();
  });
});

describe('rooms on the line', () => {
  it('a room’s frames come down the connection wrapped, and leaving a line leaves its rooms', () => {
    const t = tab('t-room', 'bram');
    const admission = rooms.admit('entry:open:body', BRAM)!;
    const leave = docs.join(admission.spec, { clientId: 't-room', userId: 'bram', yClient: 7, send: hub.roomSender(t.connection, 'entry:open:body') }, true);
    hub.rememberRoom(t.connection, 'entry:open:body', leave, 7);
    const frames = t.of('room');
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toMatchObject({ k: 'entry:open:body', e: 'sync' });
    expect(docs.subscriberIds('entry:open:body')).toContain('t-room');
    hub.disconnect(t.connection.id);
    expect(docs.subscriberIds('entry:open:body')).not.toContain('t-room');
  });
});
