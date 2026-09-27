import { inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { legacyLinkIdsIn, linkHandlesIn } from './docLinks.mjs';

/**
 * §97, ronde 58: welke artikelen een rijk document noemt, voor de afgeleide
 * tabellen — `entry_links` (de terugverwijzingen), `entry_mentions` (*Genoemd
 * in*) en het web. Een `entryLink` draagt sinds deze ronde een handvat, en
 * `mention_handles` zegt welk artikel dat is.
 *
 * Dit antwoord is **niet per kijker**: het zegt wat de tekst noemt, en wie het
 * leest past daarna zijn eigen regel toe op wat hij ermee doet (rule 1 staat in
 * de lezers van `entry_links` en `entry_mentions`, niet hier). Het id komt dus
 * nooit bij een browser; het gaat naar een tabel die per kijker gelezen wordt.
 *
 * Een los bestand, en niet in `shortRefs.ts`, omdat `mentions.ts` het leest en
 * `shortRefs.ts` op zijn beurt `mentions.ts`: zo blijft er geen kring.
 */

const seen = new WeakMap<object, string[]>();

/**
 * Elk artikel-id dat dit document noemt, in volgorde, één keer: de handvatten
 * via `mention_handles`, plus het id van een legacy `entryLink` die nog niet
 * door het archief is gegaan. Een handvat dat niets meer betekent, telt niet.
 */
export function linkedEntryIds(doc: unknown): string[] {
  if (!doc || typeof doc !== 'object') return [];
  const cached = seen.get(doc);
  if (cached) return cached;
  const handles = linkHandlesIn(doc);
  const out: string[] = [];
  const add = (id: string) => {
    if (id && !out.includes(id)) out.push(id);
  };
  if (handles.length) {
    const rows = db
      .select({ handle: schema.mentionHandles.handle, entryId: schema.mentionHandles.entryId })
      .from(schema.mentionHandles)
      .where(inArray(schema.mentionHandles.handle, handles))
      .all();
    const byHandle = new Map(rows.map((row) => [row.handle, row.entryId]));
    for (const handle of handles) {
      const id = byHandle.get(handle);
      if (id) add(id);
    }
  }
  for (const id of legacyLinkIdsIn(doc)) add(id);
  seen.set(doc, out);
  return out;
}
