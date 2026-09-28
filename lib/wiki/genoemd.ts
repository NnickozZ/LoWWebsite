import { inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { handlesIn } from '@/lib/entries/shortTokens.mjs';
import { backlinkTexts, mentionKey, mentionTexts, type Mention } from '@/lib/entries/mentions';
import { resolveHandles } from '@/lib/entries/shortRefs';
import type { Viewer } from '@/lib/entries/visibility';
import { snippetAround, type Snippet } from './snippet';

/**
 * §104, ronde 67 (L3): *Genoemd in*, met de zin erbij.
 *
 * Wie er naar dit artikel wijst, is al beslist voordat dit bestand iets
 * doet: `getBacklinks` (een ander artikel, in zijn lopende tekst) en
 * `listMentions` (al het andere) hebben elk hun eigen regel al gevraagd, en
 * wat ze teruggeven is wat deze lezer mag weten. Hier komt alleen de zin bij.
 *
 * De zin zelf is §95/§97's tekst met handvatten. Welke handvatten *dit*
 * artikel noemen, staat in `mention_handles`; dat is de schrijver zijn claim en
 * geen geheim voor wie op deze pagina staat. Elk ander handvat in het fragment
 * gaat door `resolveHandles` voor deze lezer, en wat hij niet mag zien, is
 * niets (rule 1): geen naam, geen handvat, geen gat met een lengte.
 */

/** Every handle that names this artikel — the writer's claims, one row each. */
export function handlesOf(entryId: string): Set<string> {
  return new Set(
    db
      .select({ handle: schema.mentionHandles.handle })
      .from(schema.mentionHandles)
      .where(inArray(schema.mentionHandles.entryId, [entryId]))
      .all()
      .map((row) => row.handle),
  );
}

/**
 * The first of `texts` that names this artikel, cut down to its sentence for
 * this reader — or null.
 */
export function sentenceFor(
  texts: readonly string[],
  own: ReadonlySet<string>,
  ownName: string,
  names: ReadonlyMap<string, string>,
): Snippet | null {
  for (const text of texts) {
    if (!text) continue;
    const snippet = snippetAround(text, {
      isOwn: (handle) => own.has(handle),
      ownName,
      nameOf: (handle) => names.get(handle) ?? null,
    });
    if (snippet) return snippet;
  }
  return null;
}

export type Sentences = {
  /** By backlink artikel id. */
  backlinks: Map<string, Snippet | null>;
  /** By `mentionKey`. */
  mentions: Map<string, Snippet | null>;
};

/**
 * The sentence under every row of *Genoemd in*, for one reader. One query for
 * this artikel's handles, one per kind of source, and one `resolveHandles` for
 * every other name in every fragment together.
 */
export function mentionSentences(
  viewer: Viewer,
  entry: { id: string; name: string },
  backlinkIds: readonly string[],
  mentions: readonly Mention[],
): Sentences {
  const out: Sentences = { backlinks: new Map(), mentions: new Map() };
  if (!backlinkIds.length && !mentions.length) return out;

  const own = handlesOf(entry.id);
  const bodies = backlinkTexts(backlinkIds);
  const sources = mentionTexts(mentions);

  // Every other handle in every text, resolved for this reader in one go.
  const others = new Set<string>();
  const collect = (text: string) => {
    for (const handle of handlesIn(text)) if (!own.has(handle)) others.add(handle);
  };
  for (const text of bodies.values()) collect(text);
  for (const texts of sources.values()) for (const text of texts) collect(text);
  const resolved = resolveHandles(viewer, others);
  const names = new Map<string, string>();
  for (const [handle, chip] of resolved) names.set(handle, chip.name);

  for (const id of backlinkIds) {
    out.backlinks.set(id, sentenceFor([bodies.get(id) ?? ''], own, entry.name, names));
  }
  for (const mention of mentions) {
    const key = mentionKey(mention);
    out.mentions.set(key, sentenceFor(sources.get(key) ?? [], own, entry.name, names));
  }
  return out;
}
