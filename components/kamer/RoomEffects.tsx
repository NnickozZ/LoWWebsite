import Link from 'next/link';
import type { RoomView } from '@/lib/kamers/service';
import type { Words } from '@/lib/words';

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
 * Nothing at all to say means the section is not drawn — a heading over an
 * empty list reads as a thing that is broken rather than a thing that is
 * empty.
 */
export function RoomEffects({ effects, words }: { effects: RoomView['effects']; words: Words }) {
  if (!effects.length) return null;

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
