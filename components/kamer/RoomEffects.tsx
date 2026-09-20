import Link from 'next/link';
import { Icon } from '@/components/Icon';
import type { RoomView } from '@/lib/kamers/service';
import type { Words } from '@/lib/words';
import { MEANING } from './plekWords';

/**
 * §80: "Wat deze kamer je geeft" — en het is een **lijst**, nooit een som.
 *
 * Rule 78 is the whole design of this component, and it is worth saying which
 * of its temptations were left on the floor:
 *
 *   - **No total.** Not a number of bonuses, not a combined modifier, not a
 *     "sterkste effect". The moment two of these lines are added together the
 *     archive has ruled on something, and ruling is the table's.
 *   - **No resolution.** Two things saying the opposite are both printed,
 *     next to each other, with the thing that says it. Which one wins is a
 *     conversation somebody has, not a row this file sorts.
 *   - **No parsing.** A line is a line (`effectLines`), so there is nothing
 *     here that could grow into a `bonus: number` next round.
 *
 * What it *is* is an index: every voorwerp lying in this kamer that says it
 * does something, its name linking to its own artikel — because the artikel is
 * where the thing lives and this is not a second copy of it.
 *
 * The list is already narrowed to what these eyes may see (`RoomView.effects`
 * is built from the visible rows only), so a veiled plek contributes nothing
 * at all. That is §76 again: "er ligt iets" on the tile and three lines below
 * it saying exactly what it does would be the leak the veil exists to stop.
 *
 * §85 moved it **above the grid** and gave it an empty state.
 *
 * Until round 46 this stood under the raster, and the reasoning was that the
 * raster is what a kamer is about. On a phone that put it under twelve tiles,
 * which is two screens down — so the one thing a kamer is *for* was the one
 * thing nobody scrolled to. It is the answer to "what did all this buy me",
 * and that answer belongs where the question is asked.
 *
 * And "nothing at all" is now drawn rather than skipped. A kamer with an empty
 * grid and no section at all reads as a page that has not loaded; one sentence
 * saying where the furniture comes from, with the door to go there, reads as a
 * kamer that is empty — which is what it is, on everybody's first evening.
 * That is the one case where an empty heading earns its place, and it earns it
 * because the door under it is the next thing to do.
 */
export function RoomEffects({ effects, words }: { effects: RoomView['effects']; words: Words }) {
  if (!effects.length) {
    return (
      <section className="kamer-effecten kamer-effecten-leeg" data-testid="kamer-effecten-leeg">
        <p className="small muted kamer-effecten-zin">{words.roomEffectsNone}</p>
        <Link className="btn btn-small" href="/winkel" data-testid="kamer-effecten-winkel">
          <Icon name={MEANING.winkel} size={13} />
          {words.shop}
        </Link>
      </section>
    );
  }

  return (
    <section
      className="kamer-effecten"
      data-testid="kamer-effecten"
      aria-labelledby="kamer-effecten-title"
    >
      <h2 id="kamer-effecten-title" className="kamer-effecten-title">
        {words.roomEffects}
      </h2>
      <ul className="kamer-effecten-list">
        {effects.map((thing, index) => (
          <li
            key={`${thing.href}-${index}`}
            className="kamer-effect"
            data-testid="kamer-effect"
            data-name={thing.name}
          >
            <Link className="kamer-effect-name" href={thing.href} data-testid="kamer-effect-naam">
              {thing.name}
            </Link>
            <ul className="kamer-effect-lines">
              {thing.lines.map((line, line_index) => (
                <li key={line_index} className="small" data-testid="kamer-effect-regel">
                  {line}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
