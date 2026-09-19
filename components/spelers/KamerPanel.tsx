import type { Words } from '@/lib/words';

/**
 * §77, panel 3: de kamer. §78, reserved.
 *
 * There is no room. There is no table, no `slots`, no `currency` and no
 * progress bar, and this file is the reason there is none: an empty state that
 * draws the shape of a thing that does not exist teaches everybody the wrong
 * shape, and then §78 has to unteach it. The words exist (`room`, `roomEmpty`)
 * so that when the room is built its name is something the Keeper renames in
 * Beheer → Woorden and never something that went into a table name, an address
 * or a stylesheet.
 *
 * One sentence, and nothing else.
 */
export function KamerPanel({ words }: { words: Words }) {
  return (
    <p className="small muted" style={{ margin: 0 }}>
      {words.roomEmpty}
    </p>
  );
}
