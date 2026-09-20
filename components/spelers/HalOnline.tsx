'use client';

import { useLiveBaseOptional } from '@/components/live/LiveProvider';
import type { Words } from '@/lib/words';

/**
 * §85: *online*, in a word, in the hall.
 *
 * The hall was a list of doors with nothing live on it at all, and the one
 * thing a person actually wants from a list of everybody at the table is
 * whether they are here *now*. That answer already exists on this screen: the
 * roster (§76) is on the site line, built per viewer, and it carries the
 * spelerspagina each window belongs to. So this asks it and nothing else — no
 * request of its own, no second set of rules about who may be named.
 *
 * That last part is the whole reason it may exist. `rosterFor` runs per
 * account and asks `canWatch` per row, so a Keeper who has made himself
 * invisible is simply not in the frame this browser was sent, and nothing here
 * has to know that. The rule §76 names — do not build one roster and fan it
 * out — is kept by never building one here.
 *
 * And it is a **word**, not a coloured dot. A dot means whatever the reader
 * guesses it means; on this list that guess was "this one is special", because
 * the only other coloured thing in the row is the Keeper's red stamp.
 */
export function HalOnline({ href, words }: { href: string; words: Words }) {
  const live = useLiveBaseOptional();
  const here = (live?.roster.rows ?? []).some((row) => row.speler === href);
  if (!here) return null;

  return (
    <span className="tiny spelers-online" data-testid="spelers-online">
      <span className="spelers-online-stip" aria-hidden="true" />
      {words.onlineNow}
    </span>
  );
}
