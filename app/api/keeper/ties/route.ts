import { apiError, json } from '@/lib/api';
import { requireKeeper } from '@/lib/auth/session';
import { isKeeperKind, type KeeperKind } from '@/lib/keeper/kinds';
import { isKeeperSide, keeperRef } from '@/lib/keeper/side';
import { addTie, removeTie, tiesFor } from '@/lib/keeper/ties';

export const dynamic = 'force-dynamic';

type End = { kind: KeeperKind; id: string };

/**
 * §44: touwtjes — tying a Keeper page to a player-facing one, and cutting one.
 *
 * The page sends the two ends as *itself* and *the other*, not as "keeper" and
 * "player": which of the two is the Keeper's side is a fact about the records,
 * not about which page the button was pressed on. `isKeeperSide` decides it
 * here, once, and `addTie` refuses the pair outright if neither end is the
 * Keeper's — a rope between two player pages is not what this table is for.
 */
export async function POST(request: Request) {
  try {
    const keeper = await requireKeeper();
    const body = (await request.json()) as { self?: unknown; other?: unknown };
    const self = end(body.self, keeper);
    const other = end(body.other, keeper);
    if (!self || !other) return json({ error: 'Niet gevonden.' }, { status: 404 });
    const keeperEnd = isKeeperSide(self.kind, self.id) ? self : other;
    const playerEnd = keeperEnd === self ? other : self;
    const id = addTie(keeperEnd, playerEnd, keeper.id);
    return json({ ok: true, id });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const keeper = await requireKeeper();
    const url = new URL(request.url);
    const tieId = url.searchParams.get('id') ?? '';
    const kind = url.searchParams.get('kind') ?? '';
    const id = url.searchParams.get('from') ?? '';
    if (!tieId || !isKeeperKind(kind) || !id) return json({ error: 'Niet gevonden.' }, { status: 404 });
    /*
     * A tie is cut from one of its own two ends, and only from an end this
     * Keeper may see: `tiesFor` has already dropped every tie whose other end
     * is not theirs to look at, so a stray id in the query string reaches
     * nothing it could not reach by pressing the button.
     */
    const ties = tiesFor(kind, id, keeper);
    const mine = [...(ties.twin ? [ties.twin] : []), ...ties.ropes].some((tie) => tie.id === tieId);
    if (!mine) return json({ error: 'Niet gevonden.' }, { status: 404 });
    removeTie(tieId, keeper.id);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

/** One end of a tie as the browser sent it, checked against what this viewer may see. */
function end(value: unknown, viewer: { id: string; isKeeper: boolean }): End | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { kind?: unknown; id?: unknown };
  const kind = String(raw.kind ?? '');
  const id = String(raw.id ?? '');
  if (!isKeeperKind(kind) || !id) return null;
  return keeperRef(kind, id, viewer) ? { kind, id } : null;
}
