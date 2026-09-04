import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { logAudit } from '@/lib/entries/service';
import { cleanWordOverrides, resolveWords, type Words } from '@/lib/words';

/**
 * §11's Woorden pane, server half. `lib/words.ts` holds the list and the
 * defaults and stays pure so client components can import it; this is the only
 * place that reads or writes the settings row.
 */

/** Just what the Keeper changed — what the form's boxes are filled with. */
export function getWordOverrides(): Words {
  const row = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).get();
  return cleanWordOverrides(row?.words ?? {});
}

/** Every word a screen might ask for: defaults with the Keeper's on top. */
export function getWords(): Words {
  const row = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).get();
  return resolveWords(row?.words ?? {});
}

/**
 * Stores the overrides. A word equal to its own default is dropped rather than
 * written (see `cleanWordOverrides`), so "reset this one" is just clearing the
 * box, and the settings row never fills up with the defaults themselves.
 */
export function saveWords(input: unknown, keeperId: string): number {
  const words = cleanWordOverrides(input);
  db.update(schema.siteSettings).set({ words }).where(eq(schema.siteSettings.id, 1)).run();
  logAudit({
    actorId: keeperId,
    action: 'site.words_changed',
    targetType: 'site',
    targetId: '1',
    meta: { keys: Object.keys(words) },
  });
  return Object.keys(words).length;
}
