import { notFound } from 'next/navigation';
import { BoardCanvas } from '@/components/boards/BoardCanvas';
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

  const entryIds = board.state.cards
    .filter((card) => card.kind === 'entry' && card.entryId)
    .map((card) => card.entryId as string);

  // What this case already holds. Two things need it: the prompt that offers
  // to file a pinned entry, and the tray of everything in the case that is not
  // on this wall yet.
  const caseEntries = board.caseId ? listCaseEntries(board.caseId, user) : [];

  return (
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
    />
  );
}
