import { describe, expect, it } from 'vitest';
import { freeSpotNear } from '@/lib/boards/place';
import { CARD_SIZE, cardBox, type BoardCard } from '@/lib/boards/merge';

/**
 * §61: where a new card goes, and what it costs to work that out.
 *
 * The old search measured every card through `cardBox` — an allocation and a
 * `normaliseCardScale` each — once per candidate spot, and walked every spot in
 * the view to the end even when the first one was free. On a wall of three
 * hundred punaises that is a few hundred thousand allocations, on the main
 * thread, for one press of "Nieuwe notitie".
 */

function card(id: string, x: number, y: number, over: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    kind: 'note',
    entryId: null,
    assetId: null,
    showImage: false,
    border: null,
    name: id,
    text: '',
    x,
    y,
    rotation: 0,
    scale: 1,
    ...over,
  };
}

function overlaps(spot: { x: number; y: number }, size: { width: number; height: number }, cards: BoardCard[]) {
  return cards.some((other) => {
    const box = cardBox(other);
    return (
      spot.x < box.x + box.width &&
      spot.x + size.width > box.x &&
      spot.y < box.y + box.height &&
      spot.y + size.height > box.y
    );
  });
}

/** Three hundred cards in a block, the way a busy wall actually looks. */
function crowd(count: number): BoardCard[] {
  const out: BoardCard[] = [];
  for (let i = 0; i < count; i++) {
    out.push(card(`c_${i}`, (i % 20) * 180, Math.floor(i / 20) * 280));
  }
  return out;
}

const size = { width: CARD_SIZE.width, height: CARD_SIZE.height };

describe('freeSpotNear', () => {
  it('puts the first card exactly where it was asked for', () => {
    const spot = freeSpotNear({ cx: 400, cy: 300, size, cards: [] });
    expect(spot).toEqual({ x: 400 - size.width / 2, y: 300 - size.height / 2 });
  });

  it('steps aside when that spot is taken', () => {
    const taken = [card('a', 400 - size.width / 2, 300 - size.height / 2)];
    const spot = freeSpotNear({ cx: 400, cy: 300, size, cards: taken });
    expect(overlaps(spot, size, taken)).toBe(false);
  });

  it('finds clear cork on a wall of three hundred, and quickly', () => {
    const cards = crowd(300);
    const started = performance.now();
    const spot = freeSpotNear({
      cx: 1800,
      cy: 2200,
      size,
      cards,
      view: { left: 0, top: 0, right: 4000, bottom: 4600 },
    });
    const took = performance.now() - started;
    expect(overlaps(spot, size, cards)).toBe(false);
    expect(took).toBeLessThan(20);
  });

  it('stays inside the view when the view is smaller than the wall', () => {
    const cards = crowd(300);
    const view = { left: 0, top: 0, right: 900, bottom: 700 };
    const spot = freeSpotNear({ cx: 450, cy: 350, size, cards, view });
    expect(spot.x).toBeGreaterThanOrEqual(view.left);
    expect(spot.y).toBeGreaterThanOrEqual(view.top);
    expect(spot.x + size.width).toBeLessThanOrEqual(view.right + 1);
  });

  it('is still quick when every spot in sight is covered', () => {
    // A phone-sized view over a solid block: the cascade is the expensive path.
    const cards = crowd(300);
    const view = { left: 0, top: 0, right: 420, bottom: 760 };
    const started = performance.now();
    const spot = freeSpotNear({ cx: 200, cy: 380, size, cards, view, paper: 292 });
    const took = performance.now() - started;
    expect(took).toBeLessThan(20);
    // Whatever it chose, it is on the screen — a card you cannot see is no card.
    expect(spot.x).toBeGreaterThanOrEqual(view.left);
    expect(spot.y).toBeGreaterThanOrEqual(view.top);
  });

  it('measures a card that has been made bigger through its real box', () => {
    // A card at 250% reaches far further left than its stored x (see `cardBox`).
    const big = [card('big', 400, 300, { scale: 2.5 })];
    const spot = freeSpotNear({ cx: 400 + size.width / 2, cy: 300 + size.height / 2, size, cards: big });
    expect(overlaps(spot, size, big)).toBe(false);
  });

  it('does not choke on a thousand cards', () => {
    const cards = crowd(1000);
    const started = performance.now();
    freeSpotNear({
      cx: 500,
      cy: 500,
      size,
      cards,
      view: { left: 0, top: 0, right: 1400, bottom: 900 },
    });
    expect(performance.now() - started).toBeLessThan(60);
  });
});
