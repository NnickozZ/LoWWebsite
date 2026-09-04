import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { NewBoardButton } from '@/components/boards/NewBoardButton';
import { getSessionUser } from '@/lib/auth/session';
import { listBoards } from '@/lib/boards/service';
import { relativeTime } from '@/lib/diff';

export const dynamic = 'force-dynamic';

export default async function BoardsPage() {
  const user = await getSessionUser();
  const boards = listBoards(user);

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <div>
          <p className="eyebrow">Kurkborden</p>
          <h1 style={{ margin: 0 }}>Prikborden</h1>
        </div>
        <div className="spacer" />
        <NewBoardButton />
      </div>
      <p className="muted small">
        {boards.length} {boards.length === 1 ? 'prikbord' : 'prikborden'}
      </p>

      {boards.length ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {boards.map((board) => {
            const cards = board.cardCount ?? 0;
            const strings = board.stringCount ?? 0;
            return (
              <li key={board.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                <Link
                  href={`/b/${board.id}`}
                  className="row board-row"
                  style={{ color: 'inherit', textDecoration: 'none', padding: '0.7rem 0' }}
                >
                  {/* A scrap of the cork itself, with as many pins as there are cards (to a point). */}
                  <span className="cork-swatch" aria-hidden="true">
                    {Array.from({ length: Math.min(cards, 5) }).map((_, i) => (
                      <span key={i} className="cork-swatch-pin" style={{ left: `${14 + i * 15}%`, top: `${22 + ((i * 37) % 50)}%` }} />
                    ))}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{board.name}</strong>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {board.caseName && (
                        <>
                          <Icon name="folder" size={11} /> {board.caseName} &middot;{' '}
                        </>
                      )}
                      {cards} {cards === 1 ? 'kaart' : 'kaarten'}
                      {strings > 0 && (
                        <>
                          {' '}&middot; {strings} {strings === 1 ? 'draad' : 'draden'}
                        </>
                      )}
                    </span>
                  </span>
                  <span className="tiny muted">{relativeTime(board.updatedAt)}</span>
                  <Icon name="chevron" size={16} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          <p style={{ margin: 0 }}>Nog geen prikborden.</p>
          <p className="small" style={{ margin: '0.4rem 0 0' }}>
            Een prikbord is een kurkbord: prik er fiches en notities op en span er rode draad tussen.
          </p>
        </div>
      )}
    </div>
  );
}
