import { notFound } from 'next/navigation';
import { boardKey } from '@/lib/live/keys';
import { LivePage } from '@/components/live/LivePage';
import { BoardCanvas } from '@/components/boards/BoardCanvas';
import { accessSettings, canEdit, canManageAccess, grantFor } from '@/lib/access';
import { getSessionUser } from '@/lib/auth/session';
import { getBoard, resolveBoardEntries } from '@/lib/boards/service';
import { listCaseEntries } from '@/lib/cases/service';
import type { CoverCrop } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const { id } = await params;

  const board = getBoard(id, user);
  if (!board) notFound();

  // §17: may this viewer touch the wall, and may they turn its dials.
  const grant = user ? grantFor('board', board.id, user.id) : null;
  const mayEdit = canEdit(board, user, grant);
  const mayManage = canManageAccess(board, user);

  const entryIds = board.state.cards
    .filter((card) => card.kind === 'entry' && card.entryId)
    .map((card) => card.entryId as string);

  // What this case already holds. Two things need it: the prompt that offers
  // to file a pinned entry, and the tray of everything in the case that is not
  // on this wall yet.
  const caseEntries = board.caseId ? listCaseEntries(board.caseId, user) : [];

  return (
    <>
      <LivePage place={boardKey(board.id)} watch={[]} pointers={false} presence={false} refresh={false} />
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
        coverCrop: (entry.caseCrop ?? entry.coverCrop) as CoverCrop | null,
        typeIcon: entry.typeIcon,
        typeColour: entry.typeColour,
        typeLabel: entry.typeLabel,
        typeBorder: entry.typeBorder,
      }))}
      initialState={board.state}
      initialEntries={Object.fromEntries(resolveBoardEntries(entryIds, user))}
      readOnly={!mayEdit}
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
      }}
    />
    </>
  );
}
