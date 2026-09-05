import { and, eq } from 'drizzle-orm';
import { getBoard } from '@/lib/boards/service';
import { visibleCaseCondition } from '@/lib/cases/visibility';
import { db, schema } from '@/lib/db';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { getMapById, getPin } from '@/lib/maps/service';
import { COLLECTION_KEYS, ID, KEEPER_KEYS, PAGE_PLACES, parseRecordKey } from './keys';

/**
 * §21: who may listen for what.
 *
 * A tab asks the site line to *watch* keys — "tell me when entry:abc moves",
 * "tell me who else is on page:/wiki". Before a key is added to a tab's watch
 * list it comes through here, and the rule is the page's own rule: a person may
 * watch a record they may see, a collection anyone may browse, and the Keeper
 * pages only as a Keeper. A key that fails is silently not watched — the tab is
 * told nothing about it, not even that it was refused, so the line never says
 * more than the page would.
 *
 * A change signal is a fact about a key ("it moved"), so leaking the *signal*
 * for a hidden record would tell a player that a Keeper-only artikel exists
 * and is being worked on. That is why watching is gated at all, rather than
 * fanning every signal to everyone and trusting the page to ignore it.
 */
export function canWatch(key: string, viewer: Viewer): boolean {
  if (!viewer) return false;
  if ((COLLECTION_KEYS as readonly string[]).includes(key)) return true;
  if ((KEEPER_KEYS as readonly string[]).includes(key)) return Boolean(viewer.isKeeper);

  if (key.startsWith('page:')) {
    const path = key.slice('page:'.length);
    if (path === '/admin') return Boolean(viewer.isKeeper);
    if ((PAGE_PLACES as readonly string[]).includes(path)) return true;
    return new RegExp(`^/wiki/${ID}$`).test(path);
  }

  const record = parseRecordKey(key);
  if (!record) return false;
  switch (record.kind) {
    case 'entry':
      return Boolean(
        db
          .select({ id: schema.entries.id })
          .from(schema.entries)
          .where(and(eq(schema.entries.id, record.id), visibleEntryCondition(viewer)))
          .get(),
      );
    case 'case':
      return Boolean(
        db
          .select({ id: schema.cases.id })
          .from(schema.cases)
          .where(and(eq(schema.cases.id, record.id), visibleCaseCondition(viewer)))
          .get(),
      );
    case 'board':
      return Boolean(getBoard(record.id, viewer));
    case 'map':
      return Boolean(getMapById(record.id));
    case 'pin':
      return Boolean(getPin(record.id, viewer));
    default:
      return false;
  }
}
