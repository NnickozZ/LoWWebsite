/**
 * §67 — kiezen op een canvas, op één plek.
 *
 * The prikbord grew a multi-select first: shift-click toggles a card in or out,
 * shift-drag on bare cork sweeps a box, a plain drag pans instead. The stamboom
 * wants exactly that gesture and so will the next canvas, so the *arithmetic*
 * of it lives here rather than being typed out a third time — and here it can
 * be tested without a browser, the way `lib/families/layout.ts` and
 * `lib/web/layout.ts` already are.
 *
 * Nothing in this file knows about React, the DOM, cards, artikelen or the wire.
 * It takes numbers and sets and gives numbers and sets back. Everything a
 * surface owns on its own — undo, which ids are dirty, who else is holding
 * what, what the inspector shows — stays on that surface; see
 * `components/canvas/useMarqueeSelect.ts` for where the line is drawn.
 *
 * **Touch, not containment.** A box dragged over half a card selects it. That
 * is the prikbord's rule and it is the one people expect from every drawing
 * program; "wholly inside" means a sweep across a row of cards catches the
 * middle ones and drops the two at the ends, which reads as a bug. The touch is
 * strict: two boxes that share only an edge do not overlap.
 */

/** A thing's box on the canvas, in that canvas's own coordinates. */
export type Box = { x: number; y: number; width: number; height: number };

/**
 * A dragged-open rectangle, as the two corners the hand actually made: `0` is
 * where the press landed and `1` is where the pointer is now, so either may be
 * the larger. `normaliseRect` is what turns it into something you can measure.
 */
export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** The same rectangle as a box with a positive width and height. */
export function normaliseRect(rect: Rect): Box {
  const x = Math.min(rect.x0, rect.x1);
  const y = Math.min(rect.y0, rect.y1);
  return {
    x,
    y,
    width: Math.abs(rect.x1 - rect.x0),
    height: Math.abs(rect.y1 - rect.y0),
  };
}

/**
 * Do these two boxes overlap? Strictly — a box that only touches another one
 * along an edge, or a zero-width sweep laid exactly along a card's side, is not
 * a hit. This is the prikbord's test to the operator.
 */
export function boxesTouch(a: Box, b: Box): boolean {
  return (
    a.x + a.width > b.x &&
    a.x < b.x + b.width &&
    a.y + a.height > b.y &&
    a.y < b.y + b.height
  );
}

/**
 * Everything the swept rectangle touches, **in the order it was given**. A
 * canvas draws its things in a deliberate order and a selection that came back
 * shuffled would make the inspector, the group drag and the live frame all
 * disagree about which one is "the first".
 *
 * `boxOf` may answer `null` for a thing that has no box worth hitting — one
 * that is hidden, one whose subject this reader may not see, a card that is
 * mid-flight — and that thing is simply not in the answer.
 */
export function hitsIn<T>(
  rect: Rect,
  items: readonly T[],
  boxOf: (item: T) => Box | null,
): T[] {
  const box = normaliseRect(rect);
  const hit: T[] = [];
  for (const item of items) {
    const own = boxOf(item);
    if (own && boxesTouch(own, box)) hit.push(item);
  }
  return hit;
}

/**
 * Shift-click. `additive` toggles this one in or out of what is already
 * chosen; without it the click means "only this one". Always a fresh Set, so a
 * caller holding the old one still holds the old one.
 */
export function toggleSelection(
  selection: ReadonlySet<string>,
  id: string,
  additive: boolean,
): Set<string> {
  const next = new Set(additive ? selection : []);
  if (additive && next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * A press — which is not quite a click, because a press on a canvas is also the
 * first millimetre of a drag.
 *
 * Three cases, and the middle one is the fix this round makes:
 *
 * 1. **Shift** — toggle, exactly as `toggleSelection` says.
 * 2. **A plain press on something already chosen — the selection stands.** The
 *    prikbord used to collapse it to the pressed card here while the whole
 *    group still travelled with the hand: six cards moved and one was outlined,
 *    the inspector said "1 kaart", and letting go left five of them looking
 *    unselected in the place the hand had just put them. Grabbing a group by
 *    one of its members is how a group is dragged everywhere else, so grabbing
 *    it must not un-group it.
 * 3. **A plain press on something else** — only that one.
 *
 * Case 2 gives the very Set it was handed back, so a surface may compare by
 * identity and skip the render.
 */
export function pressSelection(
  selection: Set<string>,
  id: string,
  additive: boolean,
  alreadySelected: boolean = selection.has(id),
): Set<string> {
  if (additive) return toggleSelection(selection, id, true);
  if (alreadySelected) return selection;
  return new Set([id]);
}

/**
 * Where a whole group lands when the hand has moved `dx`, `dy` from where the
 * press began. `origin` is where each member was *at the press* — never where
 * it is now, or a drag would compound itself frame by frame.
 *
 * `round` is on by default because a canvas stores whole units: a coordinate
 * with fourteen decimals in it travels over the wire, comes back, and makes
 * every save look like a change.
 */
export function groupDelta(
  origin: ReadonlyMap<string, { x: number; y: number }>,
  dx: number,
  dy: number,
  round = true,
): Record<string, { x: number; y: number }> {
  const moved: Record<string, { x: number; y: number }> = {};
  for (const [id, from] of origin) {
    const x = from.x + dx;
    const y = from.y + dy;
    moved[id] = round ? { x: Math.round(x), y: Math.round(y) } : { x, y };
  }
  return moved;
}
