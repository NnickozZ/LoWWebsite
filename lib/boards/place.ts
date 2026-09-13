import { cardBox, type BoardCard, type CardBox } from './merge';

/**
 * §61: where a new card goes, worked out without stopping the wall.
 *
 * This used to live inside `BoardCanvas` and it was the slowest thing on the
 * board: a grid of every 24-unit spot in the visible area, each one measured
 * against *every* card through `cardBox` — which allocates an object and runs
 * `normaliseCardScale` — so a wall of three hundred punaises paid a few hundred
 * thousand allocations for one press of "Nieuwe notitie", on the main thread,
 * while somebody else's drag waited for it.
 *
 * Three things fix that and none of them changes where a card lands:
 *
 * 1. **The boxes are measured once.** `cardBox` runs `cards.length` times per
 *    call instead of once per candidate spot.
 * 2. **A coarse grid indexes them**, so a candidate only meets the cards whose
 *    cells it touches rather than the whole wall.
 * 3. **The candidates are capped and sorted nearest-first**, and the search
 *    stops at the first spot that overlaps nothing. The old cascade walked
 *    every spot in the view to the bitter end even when the first one was free.
 *
 * Pure — no React, no DOM — so `tests/unit/board-sync-place.test.ts` can hold a
 * stopwatch to it.
 */

/** The visible cork, in board units. Null when nothing is rendered yet. */
export type PlaceView = { left: number; top: number; right: number; bottom: number };

/** How wide a cell of the index is, in board units — about two cards. */
const CELL = 320;
/** The most candidate spots the cascade will weigh. 40×40, as the audit asked. */
const CASCADE_SPOTS = 40;
/** The cascade's finest step, the one the wall has always used. */
const CASCADE_STEP = 24;

type Index = { boxes: CardBox[]; cells: Map<string, number[]> };

function key(cx: number, cy: number): string {
  return `${cx}:${cy}`;
}

/** A coarse uniform grid over the cards, built once per call. */
export function indexBoxes(boxes: CardBox[]): Index {
  const cells = new Map<string, number[]>();
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    const x0 = Math.floor(box.x / CELL);
    const x1 = Math.floor((box.x + box.width) / CELL);
    const y0 = Math.floor(box.y / CELL);
    const y1 = Math.floor((box.y + box.height) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const at = key(cx, cy);
        const list = cells.get(at);
        if (list) list.push(i);
        else cells.set(at, [i]);
      }
    }
  }
  return { boxes, cells };
}

/** Every card whose cell a box of this size at this spot touches. */
function candidates(index: Index, x: number, y: number, width: number, height: number): number[] {
  const x0 = Math.floor(x / CELL);
  const x1 = Math.floor((x + width) / CELL);
  const y0 = Math.floor(y / CELL);
  const y1 = Math.floor((y + height) / CELL);
  if (x0 === x1 && y0 === y1) return index.cells.get(key(x0, y0)) ?? [];
  const out: number[] = [];
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const list = index.cells.get(key(cx, cy));
      if (!list) continue;
      for (const i of list) if (!out.includes(i)) out.push(i);
    }
  }
  return out;
}

/** True when a box of this size at this spot touches nothing. */
export function spotIsClear(
  index: Index,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  for (const i of candidates(index, x, y, width, height)) {
    const other = index.boxes[i];
    if (
      x < other.x + other.width &&
      x + width > other.x &&
      y < other.y + other.height &&
      y + height > other.y
    ) {
      return false;
    }
  }
  return true;
}

/** How much of what is already on the wall a box at this spot would cover. */
function overlapArea(
  index: Index,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  let total = 0;
  for (const i of candidates(index, x, y, width, height)) {
    const other = index.boxes[i];
    const w = Math.min(x + width, other.x + other.width) - Math.max(x, other.x);
    const h = Math.min(y + height, other.y + other.height) - Math.max(y, other.y);
    if (w > 0 && h > 0) total += w * h;
  }
  return total;
}

/**
 * §8 puts a new card at the viewport centre. Dropping every card on the exact
 * same spot buries the last one and its pin, so it steps outward on a grid,
 * preferring somewhere still on screen.
 *
 * `paper` is how tall the card really paints — `CARD_SIZE.height` is the room
 * the document reserves, but a framed card is nearer 290 than 250, and
 * placement is the one job where guessing short is the dangerous way round.
 */
export function freeSpotNear(input: {
  cx: number;
  cy: number;
  size: { width: number; height: number };
  cards: BoardCard[];
  view?: PlaceView | null;
  paper?: number;
}): { x: number; y: number } {
  const { cx, cy, size, cards } = input;
  const view = input.view ?? null;
  const paper = Math.max(size.height, input.paper ?? 0);

  // Once per call, not once per candidate spot. This is the whole repair.
  const index = indexBoxes(cards.map((card) => cardBox(card)));

  const stepX = size.width + 28;
  const stepY = size.height + 28;
  const onScreen = (x: number, y: number) =>
    !view ||
    (x >= view.left &&
      y >= view.top &&
      x + size.width <= view.right &&
      y + size.height <= view.bottom);

  const originX = Math.round(cx - size.width / 2);
  const originY = Math.round(cy - size.height / 2);
  if (spotIsClear(index, originX, originY, size.width, size.height)) {
    return { x: originX, y: originY };
  }

  let fallback: { x: number; y: number } | null = null;
  for (let ring = 1; ring <= 12; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = originX + dx * stepX;
        const y = originY + dy * stepY;
        if (!spotIsClear(index, x, y, size.width, size.height)) continue;
        if (onScreen(x, y)) return { x, y };
        fallback ??= { x, y };
      }
    }
  }

  /*
   * Nothing free *and* in sight, which on a phone is the ordinary case rather
   * than the exception: the view is about two cards wide and two tall and the
   * ring search steps a whole card at a time, so the third card added to a wall
   * has nowhere clear left on the screen at all.
   *
   * The old answer was the first clear spot *anywhere*, which laid the card
   * down outside the view — you press "Nieuwe notitie" on a phone and nothing
   * appears, because it went above the top edge. A wall is happy with two bits
   * of paper overlapping; a card you cannot see is not a card at all. So a spot
   * in sight beats a spot that is clear, and among the spots in sight the one
   * that covers the least of what is already there wins — which keeps the
   * middle of every earlier card reachable, and is what a person does with
   * paper anyway: lay it in the gap.
   *
   * §61: the spots are now weighed nearest-first and the walk stops at the
   * first one that covers nothing, so the common case costs a handful of box
   * tests instead of the whole view.
   */
  if (!view) return fallback ?? { x: originX, y: originY };

  const margin = 12;
  const minX = view.left + margin;
  const minY = view.top + margin;
  const maxX = Math.max(minX, view.right - size.width - margin);
  const maxY = Math.max(minY, view.bottom - paper - margin);
  const stepAcross = Math.max(CASCADE_STEP, (maxX - minX) / CASCADE_SPOTS);
  const stepDown = Math.max(CASCADE_STEP, (maxY - minY) / CASCADE_SPOTS);

  const spots: { x: number; y: number; near: number }[] = [];
  for (let x = minX; x <= maxX + 0.5; x += stepAcross) {
    for (let y = minY; y <= maxY + 0.5; y += stepDown) {
      spots.push({ x, y, near: (x - originX) ** 2 + (y - originY) ** 2 });
    }
  }
  // Nearest to where the person was looking first, which is also how ties are
  // settled: the first spot with a given score is the closest one with it.
  spots.sort((a, b) => a.near - b.near);

  let best = { x: Math.round(minX), y: Math.round(minY), score: Infinity };
  for (const spot of spots) {
    const score = overlapArea(index, spot.x, spot.y, size.width, paper);
    if (score < best.score) best = { x: Math.round(spot.x), y: Math.round(spot.y), score };
    if (score === 0) break;
  }
  return { x: best.x, y: best.y };
}
