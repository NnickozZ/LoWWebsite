import { notFound, redirect } from 'next/navigation';
import { boardKey } from '@/lib/live/keys';
import { LivePage } from '@/components/live/LivePage';
import { BoardCanvas } from '@/components/boards/BoardCanvas';
import { KeeperPanelServer } from '@/components/keeper/KeeperPanelServer';
import { KeeperStamp } from '@/components/keeper/KeeperStamp';
import { sideOf } from '@/lib/keeper/kinds';
import { isKeeperSide, keeperRef, sideDetour } from '@/lib/keeper/side';
import { twinOf } from '@/lib/keeper/ties';
import { accessSettings, canEdit, canManageAccess, grantFor } from '@/lib/access';
import { getSessionUser } from '@/lib/auth/session';
import {
  getBoard,
  listBoards,
  resolveBoardBoards,
  resolveBoardCases,
  resolveBoardEntries,
  resolveBoardMaps,
  resolveBoardTimelines,
} from '@/lib/boards/service';
import { cardRef } from '@/lib/boards/merge';
import { listCaseEntries, listCases } from '@/lib/cases/service';
import { listMaps } from '@/lib/maps/service';
import { listTimelines } from '@/lib/timelines/service';
import { inkForViewer } from '@/lib/ink/merge';
import { getInk } from '@/lib/ink/service';

export const dynamic = 'force-dynamic';

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const { id } = await params;

  const board = getBoard(id, user);
  if (!board) notFound();

  /*
   * §50: the page decides where you stand. A prikbord has no query of its own
   * to carry, so the address is just the wall.
   */
  const detour = sideDetour(user, isKeeperSide('board', board.id), `/b/${board.id}`);
  if (detour) redirect(detour);

  // §17: may this viewer touch the wall, and may they turn its dials.
  const grant = user ? grantFor('board', board.id, user.id) : null;
  const mayEdit = canEdit(board, user, grant);
  const mayManage = canManageAccess(board, user);

  // Everything the wall points at, grouped by what kind of thing it is. Each
  // list is resolved behind its own visibility rule below.
  const refs = { entry: [] as string[], map: [] as string[], case: [] as string[], timeline: [] as string[], board: [] as string[] };
  for (const card of board.state.cards) {
    const ref = cardRef(card);
    if (ref) refs[ref.kind].push(ref.id);
  }

  // What can still be put on the wall, for the search box in the board bar.
  // Both lists are already filtered for this viewer, and both are small enough
  // to hand over whole — a landkaart or a dossier is a thing you have a dozen
  // of, not a thousand.
  // §50 (reverses §46's `bothSides` on all three): sided. After the wissel
  // above the browser always stands on this wall's own side, so "the viewer's
  // side" and "this prikbord's side" are one question — and a card pointing
  // across the border is refused on the server anyway (`sameSide`).
  const pickableMaps = listMaps(user).map((map) => ({ id: map.id, name: map.name }));
  const pickableCases = listCases(user).map((item) => ({ id: item.id, name: item.name }));
  const pickableTimelines = listTimelines(user).map((item) => ({ id: item.id, name: item.name }));
  // §52: the other walls. This one is left out of its own list — a wall that
  // holds itself is a card pointing at the paper it is pinned to.
  const pickableBoards = listBoards(user)
    .filter((item) => item.id !== board.id)
    .map((item) => ({ id: item.id, name: item.name }));

  // What this case already holds. Two things need it: the prompt that offers
  // to file a pinned entry, and the tray of everything in the case that is not
  // on this wall yet.
  const caseEntries = board.caseId ? listCaseEntries(board.caseId, user) : [];

  return (
    <>
      <LivePage place={boardKey(board.id)} watch={[]} pointers={false} presence={false} refresh={false} />
      {/* §44/§45/§46: which side this prikbord is on — the word, the colours,
          and the browser's side, so a link followed across turns the site
          over with you. */}
      <KeeperStamp
        side={sideOf(Boolean(user?.isKeeper && keeperRef('board', board.id, user)?.keeperOnly))}
        browserSide={user?.isKeeper ? user.side : undefined}
        flipTo={twinOf('board', board.id, user)?.href ?? '/boards'}
      />
      <BoardCanvas
      boardId={board.id}
      boardName={board.name}
      caseId={board.caseId}
      caseName={board.caseName}
      caseSlug={board.caseSlug}
      caseEntries={caseEntries.map((entry) => ({
        id: entry.id,
        slug: entry.slug,
        name: entry.name,
        shortDescription: entry.shortDescription,
        coverAssetId: entry.coverAssetId,
        coverCrop: entry.coverCrop,
        typeIcon: entry.typeIcon,
        typeColour: entry.typeColour,
        typeLabel: entry.typeLabel,
        typeBorder: entry.typeBorder,
      }))}
      initialState={board.state}
      initialEntries={Object.fromEntries(resolveBoardEntries(refs.entry, user))}
      initialMaps={Object.fromEntries(resolveBoardMaps(refs.map, user))}
      initialCases={Object.fromEntries(resolveBoardCases(refs.case, user))}
      initialTimelines={Object.fromEntries(resolveBoardTimelines(refs.timeline, user))}
      initialBoards={Object.fromEntries(resolveBoardBoards(refs.board, user))}
      pickableMaps={pickableMaps}
      pickableCases={pickableCases}
      pickableTimelines={pickableTimelines}
      pickableBoards={pickableBoards}
      readOnly={!mayEdit}
      initialInk={inkForViewer(getInk(board.id), user?.id ?? null)}
      access={{
        settings:
          mayManage || board.accessLocked
            ? accessSettings(board, 'board', board.id)
            : {
                ownerId: null,
                viewMode: board.viewMode,
                editMode: board.editMode,
                locked: board.accessLocked,
                viewers: [],
                editors: [],
              },
        canManage: mayManage,
        isKeeper: Boolean(user?.isKeeper),
        viewerId: user?.id ?? '',
        inWeb: board.inWeb,
      }}
    />
    {/*
     * §44: the Keeper's corner, under the wall — the switch to its other face,
     * the "this prikbord is mine" toggle, its touwtjes and the shared notes.
     * Below the canvas, which is what the whole page is: a wall is looked at
     * far more often than it is re-hung, exactly as a landkaart is.
     */}
    {user?.isKeeper && (
      <div className="keeper-underfold">
        <KeeperPanelServer kind="board" id={board.id} user={user} />
      </div>
    )}
    </>
  );
}
