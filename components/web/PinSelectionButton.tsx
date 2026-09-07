'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { CARD_SIZE, placementRotation, type BoardCard } from '@/lib/boards/merge';
import { fuzzyScore } from '@/lib/search/fuzzy';
import type { WebNode } from '@/lib/web/types';

type BoardLite = {
  id: string;
  name: string;
  caseId: string | null;
  caseName: string | null;
  caseEditable?: boolean;
};

/**
 * §43: a selection in the web, onto a prikbord.
 *
 * The one thing the web may *do* rather than show. Pick some knots — a
 * suspect, the two places he was seen, the dossier — and put them on a wall
 * as cards, in a grid, so the wall starts with what the web already knew was
 * connected. The lines do not come along as draden: a draad is a claim the
 * investigator makes, and the web's lines are the archive's, not theirs.
 *
 * The same road as `PinToBoardButton`: `POST /api/boards/{id}` with cards,
 * and then the wall's own question — "…en in het dossier?" — asked once for
 * the whole batch rather than once per card. Which artikelen are already in
 * that dossier the web itself knows (`filed` edges), so it asks only about
 * the ones that are not, and posts only those.
 */
export function PinSelectionButton({
  nodes,
  filedIn,
}: {
  /** The selected nodes. Notes are skipped: they are already cards somewhere. */
  nodes: WebNode[];
  /** entry node id → the case node ids it is already filed in. */
  filedIn: ReadonlyMap<string, ReadonlySet<string>>;
}) {
  const ui = useUi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<BoardLite[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const pinnable = useMemo(() => nodes.filter((n) => n.kind !== 'note'), [nodes]);

  useEffect(() => {
    if (!open) return;
    // `forEntry` is what makes each board say whether this viewer may file
    // into its dossier; any one artikel of the selection will do for that.
    const anEntry = pinnable.find((n) => n.kind === 'entry');
    void fetch(anEntry ? `/api/boards?forEntry=${encodeURIComponent(anEntry.refId)}` : '/api/boards')
      .then((r) => (r.ok ? r.json() : { boards: [] }))
      .then((data) => setBoards(data.boards ?? []))
      .catch(() => undefined);
    setTimeout(() => searchRef.current?.focus(), 60);
  }, [open, pinnable]);

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

  async function pin(board: BoardLite) {
    if (!pinnable.length) return;
    setBusy(true);
    try {
      const columns = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(pinnable.length))));
      const cards: BoardCard[] = pinnable.map((node, i) => {
        const base = {
          id: `c_${Math.random().toString(36).slice(2, 12)}`,
          name: node.name,
          text: '',
          x: 200 + (i % columns) * (CARD_SIZE.width + 40) + Math.round(Math.random() * 12),
          y: 160 + Math.floor(i / columns) * (CARD_SIZE.height + 44) + Math.round(Math.random() * 12),
          rotation: placementRotation(),
          showImage: true,
          scale: 1,
        };
        if (node.kind === 'entry') return { ...base, kind: 'entry', entryId: node.refId };
        if (node.kind === 'map') return { ...base, kind: 'map', mapId: node.refId };
        if (node.kind === 'case') return { ...base, kind: 'case', caseId: node.refId };
        return { ...base, kind: 'timeline', timelineId: node.refId };
      });
      const response = await fetch(`/api/boards/${board.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cards }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        ui.toast(data.error ?? 'Prikken is niet gelukt.');
        return;
      }
      setOpen(false);
      const count = cards.length;
      ui.toast(`${count} ${count === 1 ? ui.words.card : `${ui.words.card}en`} geprikt op ${board.name}.`, {
        label: `${ui.words.board} openen`,
        onAction: () => router.push(`/b/${board.id}`),
      });

      // "…en in het dossier?" — once, for the artikelen that are not in it yet.
      if (board.caseId && board.caseEditable) {
        const caseNodeId = `case:${board.caseId}`;
        const missing = pinnable.filter(
          (n) => n.kind === 'entry' && !(filedIn.get(n.id)?.has(caseNodeId) ?? false),
        );
        if (missing.length) {
          const dossier = board.caseName ?? `dit ${ui.words.case}`;
          const yes = await ui.confirm({
            title:
              missing.length === 1
                ? `${missing[0].name} zit nog niet in ${dossier}`
                : `${missing.length} ${ui.words.entryPlural} zitten nog niet in ${dossier}`,
            message: (
              <>
                De {ui.words.card}en hangen nu op het {ui.words.board}. Wil je{' '}
                {missing.length === 1 ? missing[0].name : `deze ${missing.length} ${ui.words.entryPlural}`} ook bij de{' '}
                {ui.words.entryPlural} van {dossier} zetten?
              </>
            ),
            confirmLabel: `Toevoegen aan ${ui.words.case}`,
            cancelLabel: 'Alleen prikken',
          });
          if (yes) {
            let failed = 0;
            for (const node of missing) {
              const filed = await fetch(`/api/cases/${board.caseId}/entries`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ entryId: node.refId }),
              }).catch(() => null);
              if (!filed?.ok) failed += 1;
            }
            ui.toast(
              failed
                ? `${missing.length - failed} toegevoegd, ${failed} niet gelukt.`
                : `${missing.length === 1 ? missing[0].name : `${missing.length} ${ui.words.entryPlural}`} toegevoegd aan ${dossier}.`,
            );
            router.refresh();
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function createAndPin() {
    const name = query.trim() || `${ui.words.board} uit het web`;
    const response = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      ui.toast(`Nieuw ${ui.words.board} aanmaken is niet gelukt.`);
      return;
    }
    const data = await response.json();
    await pin({ id: data.board.id, name: data.board.name, caseId: null, caseName: null });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-small"
        onClick={() => setOpen(true)}
        disabled={!pinnable.length}
        data-testid="web-pin-selection"
      >
        <Icon name="board" size={15} />
        {ui.words.pinToBoard}
        <span className="muted"> ({pinnable.length})</span>
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="web-pin-title">
          <div className="row" style={{ marginBottom: '0.7rem' }}>
            <h2 id="web-pin-title" style={{ margin: 0, fontSize: '1.2rem' }}>
              {pinnable.length} {pinnable.length === 1 ? ui.words.card : `${ui.words.card}en`} prikken
            </h2>
            <div className="spacer" />
            <button className="btn btn-ghost btn-small" type="button" onClick={() => setOpen(false)} aria-label="Sluiten">
              <Icon name="close" size={18} />
            </button>
          </div>
          <p className="tiny muted" style={{ margin: '0 0 0.6rem' }}>
            {pinnable.map((n) => n.name).join(' · ')}
          </p>

          <label className="visually-hidden" htmlFor="web-board-search">
            {ui.words.boardPlural} zoeken
          </label>
          <input
            id="web-board-search"
            ref={searchRef}
            className="input"
            value={query}
            placeholder={`Zoek een ${ui.words.board}…`}
            onChange={(event) => setQuery(event.target.value)}
          />

          <ul className="suggest-list" style={{ marginTop: '0.6rem' }}>
            {matches.map((board) => (
              <li key={board.id}>
                <button type="button" className="suggest-item" disabled={busy} onClick={() => void pin(board)}>
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
              <button type="button" className="suggest-item" disabled={busy} onClick={() => void createAndPin()}>
                <Icon name="plus" size={16} style={{ color: 'var(--stamp-red)' }} />
                <span>
                  {query.trim() ? (
                    <>
                      Nieuw {ui.words.board} &lsquo;<strong>{query.trim()}</strong>&rsquo;
                    </>
                  ) : (
                    <>Nieuw {ui.words.board} uit het web</>
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
