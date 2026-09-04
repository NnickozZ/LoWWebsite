'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { placementRotation } from '@/lib/boards/merge';
import { fuzzyScore } from '@/lib/search/fuzzy';

type BoardLite = { id: string; name: string; caseName: string | null };

/** §6: "Pin to board" from an entry — pick a board, the card lands on it. */
export function PinToBoardButton({
  entryId,
  entryName,
}: {
  entryId: string;
  entryName: string;
}) {
  const ui = useUi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<BoardLite[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    void fetch('/api/boards')
      .then((r) => (r.ok ? r.json() : { boards: [] }))
      .then((data) => setBoards(data.boards ?? []))
      .catch(() => undefined);
    setTimeout(() => searchRef.current?.focus(), 60);
  }, [open]);

  const matches = useMemo(() => {
    const typed = query.trim();
    if (!typed) return boards.slice(0, 8);
    return boards
      .map((b) => ({ b, score: fuzzyScore(b.name, typed) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.b);
  }, [boards, query]);

  async function pin(boardId: string, boardName: string) {
    setBusy(true);
    try {
      // Somewhere loose in the middle, jittered so repeated pins do not stack.
      const card = {
        id: `c_${Math.random().toString(36).slice(2, 12)}`,
        kind: 'entry' as const,
        entryId,
        name: entryName,
        text: '',
        x: 240 + Math.round(Math.random() * 320),
        y: 200 + Math.round(Math.random() * 260),
        rotation: placementRotation(),
      };
      const response = await fetch(`/api/boards/${boardId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cards: [card] }),
      });
      if (!response.ok) {
        const data = await response.json();
        ui.toast(data.error ?? 'Prikken is niet gelukt.');
        return;
      }
      setOpen(false);
      ui.toast(`Geprikt op ${boardName}.`, {
        label: 'Prikbord openen',
        onAction: () => router.push(`/b/${boardId}`),
      });
    } finally {
      setBusy(false);
    }
  }

  async function createAndPin() {
    const name = query.trim() || `Prikbord ${entryName}`;
    const response = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      ui.toast('Nieuw prikbord aanmaken is niet gelukt.');
      return;
    }
    const data = await response.json();
    await pin(data.board.id, data.board.name);
  }

  return (
    <>
      <button type="button" className="btn btn-small" onClick={() => setOpen(true)}>
        <Icon name="board" size={15} />
        {ui.words.pinToBoard}
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="pin-to-board-title">
          <div className="row" style={{ marginBottom: '0.7rem' }}>
            <h2 id="pin-to-board-title" style={{ margin: 0, fontSize: '1.2rem' }}>
              {ui.words.pinToBoard}
            </h2>
            <div className="spacer" />
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Sluiten"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          <label className="visually-hidden" htmlFor="board-search">
            Prikborden zoeken
          </label>
          <input
            id="board-search"
            ref={searchRef}
            className="input"
            value={query}
            placeholder="Zoek een prikbord…"
            onChange={(event) => setQuery(event.target.value)}
          />

          <ul className="suggest-list" style={{ marginTop: '0.6rem' }}>
            {matches.map((board) => (
              <li key={board.id}>
                <button
                  type="button"
                  className="suggest-item"
                  disabled={busy}
                  onClick={() => void pin(board.id, board.name)}
                >
                  <Icon name="board" size={16} style={{ color: 'var(--ink-muted)' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{board.name}</strong>
                    {board.caseName && (
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {board.caseName}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="suggest-item" disabled={busy} onClick={createAndPin}>
                <Icon name="plus" size={16} style={{ color: 'var(--stamp-red)' }} />
                <span>
                  {query.trim() ? (
                    <>
                      Nieuw prikbord &lsquo;<strong>{query.trim()}</strong>&rsquo;
                    </>
                  ) : (
                    <>Nieuw prikbord voor {entryName}</>
                  )}
                </span>
              </button>
            </li>
          </ul>
        </Sheet>
      )}
    </>
  );
}
