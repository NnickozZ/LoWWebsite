import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { NewBoardButton } from '@/components/boards/NewBoardButton';
import { SortFilterBar } from '@/components/SortFilterBar';
import { getSessionUser } from '@/lib/auth/session';
import { listBoards } from '@/lib/boards/service';
import { relativeTime } from '@/lib/diff';
import { readMany, readOne, type ListParams } from '@/lib/listParams';

export const dynamic = 'force-dynamic';

const SORTS = ['recent', 'name', 'created', 'size'] as const;
const WHERE = ['loose', 'case'] as const;
const SHOW = ['mine', 'restricted'] as const;

export default async function BoardsPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const user = await getSessionUser();
  const query = await searchParams;
  const sort = readOne(query, 'sort', SORTS, 'recent') as (typeof SORTS)[number];
  const where = readOne(query, 'where', WHERE, '') as '' | (typeof WHERE)[number];
  const show = readMany(query, 'show', SHOW);
  const filtering = Boolean(where) || show.length > 0;

  const boards = listBoards(user, {
    sort,
    where: where || undefined,
    mine: show.includes('mine') && user ? user.id : undefined,
    privateOnly: show.includes('restricted') || undefined,
  });

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
      <SortFilterBar
        sorts={[
          { value: 'recent', label: 'Laatst veranderd' },
          { value: 'name', label: 'Op naam' },
          { value: 'created', label: 'Nieuwste eerst' },
          { value: 'size', label: 'Meeste kaarten' },
        ]}
        defaultSort="recent"
        summary={`${boards.length} ${boards.length === 1 ? 'prikbord' : 'prikborden'}`}
        groups={[
          {
            key: 'where',
            label: 'Waar',
            options: [
              { value: 'loose', label: 'Los', icon: 'board' },
              { value: 'case', label: 'Bij een dossier', icon: 'folder' },
            ],
          },
          {
            key: 'show',
            label: 'Alleen',
            multi: true,
            options: [
              { value: 'mine', label: 'Van mij', icon: 'you' },
              { value: 'restricted', label: 'Privé of gekozen', icon: 'lock' },
            ],
          },
        ]}
      />

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
                    {board.viewMode !== 'all' && (
                      <span className="stamp stamp-muted" style={{ fontSize: '0.6rem', marginLeft: '0.4rem' }}>
                        <Icon name="lock" size={9} /> {board.viewMode === 'private' ? 'Privé' : 'Gekozen'}
                      </span>
                    )}
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
          <p style={{ margin: 0 }}>{filtering ? 'Geen prikbord voldoet hieraan.' : 'Nog geen prikborden.'}</p>
          <p className="small" style={{ margin: '0.4rem 0 0' }}>
            {filtering
              ? 'Zet een filter uit om meer te zien.'
              : 'Een prikbord is een kurkbord: prik er artikelen en notities op en span er rode draad tussen.'}
          </p>
        </div>
      )}
    </div>
  );
}
