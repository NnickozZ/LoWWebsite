import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

/**
 * §20: shared text, against a real SQLite file.
 *
 * The room is the part that has to be right: two people's keystrokes have to
 * converge, the archive has to end up holding what they typed, a document
 * rewritten around the room has to win, and the gate has to be the same rule
 * the page uses. Yjs itself is not under test — the plumbing around it is.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-live-'));
process.env.DATA_DIR = dir;

type Docs = typeof import('@/lib/live/docs');
type Rooms = typeof import('@/lib/live/rooms');
let docs: Docs;
let rooms: Rooms;
let sqlite: typeof import('@/lib/db').sqlite;
let service: typeof import('@/lib/entries/service');

const KEEPER = { id: 'keeper-1', isKeeper: true };
/*
 * §18b: a player carries the onderzoeker their window is writing as. Every
 * `admit` here is about rights, not about names, but a player with no karakter
 * is refused the pen — so the two players in this file each hold one.
 */
const BRAM = { id: 'bram', isKeeper: false, characterId: 'vandijk' };
const AAGJE = { id: 'aagje', isKeeper: false, characterId: 'nel' };

const para = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

/** A pretend tab: its own Y.Doc, fed by what the room sends it. */
function tab(spec: Parameters<Docs['join']>[0], clientId: string, userId: string, canEdit = true) {
  const doc = new Y.Doc();
  const inbox: unknown[] = [];
  const leave = docs.join(
    spec,
    {
      clientId,
      userId,
      yClient: doc.clientID,
      send: (event) => {
        inbox.push(event);
        if (event.event === 'sync') Y.applyUpdate(doc, Buffer.from(event.data.state, 'base64'), 'remote');
        if (event.event === 'update') Y.applyUpdate(doc, Buffer.from(event.data.u, 'base64'), 'remote');
      },
    },
    canEdit,
  );
  // What this tab types goes up as an update, as the browser would send it.
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return;
    docs.applyClientUpdate(spec.key, clientId, Buffer.from(update).toString('base64'), { id: userId, isKeeper: userId === 'keeper-1' });
  });
  const type = (text: string) => {
    const fragment = doc.getXmlFragment('default');
    const first = fragment.get(0) as Y.XmlElement;
    const run = first.get(0) as Y.XmlText;
    run.insert(run.length, text);
  };
  const text = () => doc.getXmlFragment('default').toString();
  return { doc, inbox, leave, type, text };
}

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  sqlite = dbModule.sqlite;
  docs = await import('@/lib/live/docs');
  rooms = await import('@/lib/live/rooms');
  service = await import('@/lib/entries/service');

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
  ] as const) {
    sqlite
      .prepare(`INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`)
      .run(id, name, name.toLowerCase(), keeper);
  }
  const entry = (id: string, name: string, by: string, body: unknown, over: Record<string, unknown> = {}) =>
    sqlite
      .prepare(
        `INSERT INTO entries (id, type_id, name, slug, fields, body, body_text, visibility, created_by, view_mode, edit_mode, is_locked)
         VALUES (?, 'character', ?, ?, '{}', ?, '', ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        name,
        id,
        JSON.stringify(body),
        (over.visibility as string) ?? 'all',
        by,
        (over.viewMode as string) ?? 'all',
        (over.editMode as string) ?? 'all',
        (over.isLocked as number) ?? 0,
      );
  entry('open', 'Open fiche', 'bram', para('Het begon '));
  entry('geheim', 'Geheime fiche', 'keeper-1', para('Niet voor jou'), { visibility: 'keeper' });
  entry('vanbram', 'Van Bram', 'bram', para('Alleen Bram schrijft'), { editMode: 'private' });
  entry('opslot', 'Op slot', 'bram', para('Vergrendeld'), { isLocked: 1 });
  const section = (id: string, ownerKind: string, ownerId: string, title: string, visibility: string) =>
    sqlite
      .prepare(
        `INSERT INTO sections (id, owner_kind, owner_id, title, body, body_text, visibility, sort_order) VALUES (?, ?, ?, ?, ?, '', ?, 0)`,
      )
      .run(id, ownerKind, ownerId, title, JSON.stringify(para('Wat er echt ligt')), visibility);
  section('s1', 'entry', 'open', 'Kelder', 'keeper');
  // §70: three more, for the three things the gate now has to say about who
  // may *write* a sectie — the thing's edit dial, §10's lock, and a dossier.
  section('s-open', 'entry', 'open', 'Wat we vonden', 'all');
  section('s-vanbram', 'entry', 'vanbram', 'Wat Bram vond', 'all');
  section('s-slot', 'entry', 'opslot', 'Wat er op slot zit', 'all');
  sqlite
    .prepare(`INSERT INTO cases (id, name, slug, notes, created_by, view_mode, edit_mode) VALUES ('zaak', 'De zaak', 'de-zaak', ?, 'bram', 'some', 'some')`)
    .run(JSON.stringify(para('Werktheorie: ')));
  sqlite
    .prepare(`INSERT INTO access_grants (target_type, target_id, user_id, can_view, can_edit) VALUES ('case', 'zaak', 'aagje', 1, 0)`)
    .run();
  section('s-zaak', 'case', 'zaak', 'Wat dit onderzoek opleverde', 'all');
  section('s-zaak-geheim', 'case', 'zaak', 'Wat de Keeper weet', 'keeper');
});

afterAll(() => {
  docs.resetDocHub();
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('a room', () => {
  it('seeds from the stored text, and two tabs converge', () => {
    const admission = rooms.admit('entry:open:body', BRAM)!;
    expect(admission.canEdit).toBe(true);
    const a = tab(admission.spec, 'tab-a', 'bram');
    const b = tab(admission.spec, 'tab-b', 'aagje');
    expect(a.text()).toContain('Het begon');
    expect(b.text()).toContain('Het begon');

    a.type('met een storm');
    expect(b.text()).toContain('met een storm');
    b.type(' op zee');
    expect(a.text()).toContain('op zee');
    expect(a.text()).toBe(b.text());
    a.leave();
    b.leave();
  });

  it('writes what was typed back into the archive, as the last person typing', () => {
    docs.persistAll();
    const row = sqlite.prepare(`SELECT body, body_text, updated_by FROM entries WHERE id = 'open'`).get() as {
      body: string;
      body_text: string;
      updated_by: string;
    };
    expect(row.body_text).toContain('met een storm op zee');
    expect(JSON.parse(row.body).content[0].type).toBe('paragraph');
    expect(row.updated_by).toBe('aagje');
    // …and the CRDT state is kept beside it, so a returning tab merges.
    const stored = sqlite.prepare(`SELECT state FROM live_docs WHERE room = 'entry:open:body'`).get();
    expect(stored).toBeTruthy();
  });

  it('a tab that was away merges its edits instead of clobbering', () => {
    const admission = rooms.admit('entry:open:body', BRAM)!;
    // A tab that typed while offline: its own doc, based on the stored state.
    const offline = new Y.Doc();
    const snap = docs.snapshot(admission.spec);
    Y.applyUpdate(offline, Buffer.from(snap.state, 'base64'));
    const run = (offline.getXmlFragment('default').get(0) as Y.XmlElement).get(0) as Y.XmlText;
    run.insert(0, 'Proloog: ');
    // Meanwhile someone online adds to the end.
    const online = tab(admission.spec, 'tab-c', 'aagje');
    online.type(' — einde');
    // The offline tab reconnects and sends what the server does not have.
    const diff = Y.encodeStateAsUpdate(offline, Buffer.from(snap.sv, 'base64'));
    docs.applyClientUpdate(admission.spec.key, 'tab-d', Buffer.from(diff).toString('base64'), BRAM);
    expect(online.text()).toContain('Proloog: Het begon');
    expect(online.text()).toContain('— einde');
    online.leave();
  });

  it('a document rewritten around the room wins, and open tabs see it', () => {
    const admission = rooms.admit('entry:open:body', KEEPER)!;
    const watcher = tab(admission.spec, 'tab-e', 'keeper-1');
    // An ordinary save of the body — a proposal approved, say.
    service.updateEntry('open', { body: para('Herschreven') }, KEEPER);
    expect(watcher.text()).toBe('<paragraph>Herschreven</paragraph>');
    // …and typing continues from the new text, not the old.
    watcher.type('!');
    docs.persistAll();
    const row = sqlite.prepare(`SELECT body_text FROM entries WHERE id = 'open'`).get() as { body_text: string };
    expect(row.body_text).toBe('Herschreven!');
    watcher.leave();
  });

  it('tells the room when the rest of the record changes', () => {
    const admission = rooms.admit('entry:open:body', KEEPER)!;
    const watcher = tab(admission.spec, 'tab-f', 'keeper-1');
    service.updateEntry('open', { name: 'Nieuwe naam' }, KEEPER);
    const saved = watcher.inbox.find((e) => (e as { event: string }).event === 'saved') as { data: { keys: string[]; by: string } };
    expect(saved).toBeTruthy();
    expect(saved.data.keys).toContain('name');
    expect(saved.data.by).toBe('keeper-1');
    watcher.leave();
  });
});

describe('the gate', () => {
  it('is the visibility rule: a Keeper-only fiche has no room for a player', () => {
    expect(rooms.admit('entry:geheim:body', BRAM)).toBeNull();
    expect(rooms.admit('entry:geheim:body', KEEPER)?.canEdit).toBe(true);
  });
  it('is the §17 edit dial: looking is not typing', () => {
    expect(rooms.admit('entry:vanbram:body', AAGJE)?.canEdit).toBe(false);
    expect(rooms.admit('entry:vanbram:body', BRAM)?.canEdit).toBe(true);
    expect(rooms.admit('entry:vanbram:body', KEEPER)?.canEdit).toBe(true);
  });
  it('is the §10 lock: a locked fiche is read-only for a player', () => {
    expect(rooms.admit('entry:opslot:body', BRAM)?.canEdit).toBe(false);
    expect(rooms.admit('entry:opslot:body', KEEPER)?.canEdit).toBe(true);
  });
  it('is §18b: a player who has not said who they are writing as may look, not type', () => {
    const { characterId, ...noName } = BRAM;
    void characterId;
    // The room is still there — being refused the pen is not being refused the room.
    expect(rooms.admit('entry:vanbram:body', noName)).not.toBeNull();
    expect(rooms.admit('entry:vanbram:body', noName)?.canEdit).toBe(false);
    // A Keeper never has one, and is never stopped by this.
    expect(rooms.admit('entry:vanbram:body', { id: 'keeper-1', isKeeper: true })?.canEdit).toBe(true);
  });
  it('a hidden section is nobody\'s room but the Keeper\'s until somebody is shown it', () => {
    expect(rooms.admit('section:s1', BRAM)).toBeNull();
    expect(rooms.admit('section:s1', KEEPER)?.canEdit).toBe(true);
    sqlite.prepare(`UPDATE sections SET visibility = 'players' WHERE id = 's1'`).run();
    sqlite.prepare(`INSERT INTO entry_section_reveals (section_id, user_id) VALUES ('s1', 'bram')`).run();
    // Shown to Bram, still nothing at all to Aagje — a sectie's dial is finer
    // than its artikel's, and that is the half §70 did not open up.
    expect(rooms.admit('section:s1', BRAM)).not.toBeNull();
    expect(rooms.admit('section:s1', AAGJE)).toBeNull();
  });

  /*
   * §70: making, writing and removing a sectie is the *thing's* edit right, not
   * `isKeeper`. Four cases, because the room is the one place where getting it
   * wrong is silent — an artikel anybody may edit, an artikel only its owner
   * may edit, an artikel §10 has bolted, and a dossier.
   */
  it('§70: a sectie on an artikel anybody may edit is a player\'s to write', () => {
    expect(rooms.admit('section:s-open', BRAM)?.canEdit).toBe(true);
    expect(rooms.admit('section:s-open', AAGJE)?.canEdit).toBe(true);
    expect(rooms.admit('section:s-open', KEEPER)?.canEdit).toBe(true);
  });

  it('§70: but only the artikel\'s own editors — looking is still not typing', () => {
    expect(rooms.admit('section:s-vanbram', AAGJE)?.canEdit).toBe(false);
    expect(rooms.admit('section:s-vanbram', BRAM)?.canEdit).toBe(true);
    expect(rooms.admit('section:s-vanbram', KEEPER)?.canEdit).toBe(true);
  });

  it('§70 under §10: a bolted artikel\'s secties are the Keeper\'s alone', () => {
    expect(rooms.admit('section:s-slot', BRAM)?.canEdit).toBe(false);
    expect(rooms.admit('section:s-slot', KEEPER)?.canEdit).toBe(true);
  });

  it('§70: a dossier\'s sectie rides the dossier\'s dials, and its own on top', () => {
    // Not on the dossier at all: no room, and no hint that one exists.
    expect(rooms.admit('section:s-zaak', { id: 'nobody', isKeeper: false })).toBeNull();
    // Aagje may view the dossier but not edit it (`can_edit` 0 above).
    expect(rooms.admit('section:s-zaak', AAGJE)?.canEdit).toBe(false);
    // Bram owns it, so he writes.
    expect(rooms.admit('section:s-zaak', BRAM)?.canEdit).toBe(true);
    // And the sectie's own dial is finer than the dossier's: a keeper-only
    // sectie on a dossier Bram owns is still not Bram's room.
    expect(rooms.admit('section:s-zaak-geheim', BRAM)).toBeNull();
    expect(rooms.admit('section:s-zaak-geheim', KEEPER)?.canEdit).toBe(true);
  });

  it('§70: what a player types in a dossier\'s sectie lands in the archive', () => {
    const admission = rooms.admit('section:s-zaak', BRAM)!;
    const owner = tab(admission.spec, 'tab-s70', 'bram');
    owner.type(' — de sleutel');
    docs.persistAll();
    const row = sqlite.prepare(`SELECT body_text FROM sections WHERE id = 's-zaak'`).get() as {
      body_text: string;
    };
    expect(row.body_text).toContain('de sleutel');
    owner.leave();
  });
  it('a dossier\'s notes: the case dials decide, and the notes land in the dossier', () => {
    expect(rooms.admit('case:zaak:notes', { id: 'nobody', isKeeper: false })).toBeNull();
    expect(rooms.admit('case:zaak:notes', AAGJE)?.canEdit).toBe(false);
    const admission = rooms.admit('case:zaak:notes', BRAM)!;
    expect(admission.canEdit).toBe(true);
    const owner = tab(admission.spec, 'tab-z', 'bram');
    owner.type('de vuurtoren');
    docs.persistAll();
    const row = sqlite.prepare(`SELECT notes_text FROM cases WHERE id = 'zaak'`).get() as { notes_text: string };
    expect(row.notes_text).toBe('Werktheorie: de vuurtoren');
    owner.leave();
  });
  it('knows no other rooms', () => {
    expect(rooms.admit('entry:open:keeperNotes', KEEPER)).toBeNull();
    expect(rooms.admit('../../etc', KEEPER)).toBeNull();
    expect(rooms.admit('entry:nope:body', KEEPER)).toBeNull();
  });
});

describe('a tab that reconnects', () => {
  it('is not thrown out by the old line\'s late goodbye', () => {
    const admission = rooms.admit('entry:open:body', KEEPER)!;
    // The same tab opens a second line before the first has said goodbye —
    // exactly what a reconnect (and React's development double-mount) does.
    const first = tab(admission.spec, 'tab-same', 'keeper-1');
    const second = tab(admission.spec, 'tab-same', 'keeper-1');
    first.leave();
    expect(docs.subscriberIds('entry:open:body')).toContain('tab-same');
    // …and the second line still hears the room.
    const typist = tab(admission.spec, 'tab-typist', 'keeper-1');
    typist.type(' Nog iets.');
    expect(second.text()).toContain('Nog iets.');
    second.leave();
    typist.leave();
    expect(docs.subscriberIds('entry:open:body')).not.toContain('tab-same');
  });
});
