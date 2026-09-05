'use client';

import { useMemo, useState } from 'react';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { capitalise } from '@/lib/words';
import type { CoverCrop } from '@/lib/db/schema';

export type TrayEntry = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  coverAssetId: string | null;
  coverCrop: CoverCrop | null;
  typeIcon: string;
  typeColour: string;
  typeLabel: string;
  typeBorder: string;
};

/**
 * Everything filed in this board's case that is not on the wall yet, in a
 * drawer down the side of the cork.
 *
 * Making a board for a case used to mean typing every name into the search box
 * from memory. The tray turns that into a stack of cards you can see: drag one
 * onto the cork and it lands where you dropped it. Tapping does the same at the
 * viewport centre, which is the only thing that works on a phone (§8 turns
 * dragging off under 768 px) and is faster than a drag anyway once you know
 * where it goes.
 *
 * It collapses to a spine, and only appears at all when the board belongs to a
 * case: a standalone board has no such list to draw from.
 */
export function BoardTray({
  entries,
  onAdd,
  onDragStart,
}: {
  entries: TrayEntry[];
  /** Tapped: put it at the viewport centre, like the search box does. */
  onAdd: (entry: TrayEntry) => void;
  /** Dragged: the canvas takes over and drops it where the pointer lands. */
  onDragStart: (entry: TrayEntry, event: React.DragEvent) => void;
}) {
  const words = useUi().words;
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState('');

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) ||
        entry.typeLabel.toLowerCase().includes(needle),
    );
  }, [entries, filter]);

  if (!open) {
    return (
      <button
        type="button"
        className="board-tray-spine"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        title="Nog niet op dit prikbord"
      >
        <Icon name="folder" size={15} />
        <span className="board-tray-spine-label">Uit het dossier</span>
        <span className="admin-badge">{entries.length}</span>
      </button>
    );
  }

  return (
    <aside className="board-tray" aria-label={`${capitalise(words.entryPlural)} uit het ${words.case} die nog niet op dit ${words.board} staan`}>
      <div className="board-tray-head">
        <Icon name="folder" size={15} />
        <strong className="small" style={{ flex: 1 }}>
          Uit het dossier
        </strong>
        <span className="tiny muted">{entries.length}</span>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={() => setOpen(false)}
          aria-expanded
          aria-label="Lade inklappen"
        >
          <Icon name="chevron" size={16} />
        </button>
      </div>

      {entries.length > 6 && (
        <>
          <label className="visually-hidden" htmlFor="board-tray-filter">
            Zoeken in de lade
          </label>
          <input
            id="board-tray-filter"
            className="input board-tray-filter"
            value={filter}
            placeholder="Zoeken…"
            onChange={(event) => setFilter(event.target.value)}
          />
        </>
      )}

      {!entries.length ? (
        <p className="tiny muted board-tray-empty">
          Alles uit dit dossier hangt al aan de muur.
        </p>
      ) : (
        <ul className="board-tray-list">
          {shown.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="board-tray-card"
                draggable
                onDragStart={(event) => onDragStart(entry, event)}
                onClick={() => onAdd(entry)}
                title={`${entry.name} — sleep naar het kurk, of tik om hem in het midden te prikken`}
              >
                <Cover
                  assetId={entry.coverAssetId}
                  crop={entry.coverCrop}
                  alt=""
                  icon={entry.typeIcon}
                  colour={entry.typeColour}
                  className="board-tray-cover"
                />
                <span className="board-tray-text">
                  <span className="board-tray-name">{entry.name}</span>
                  <span className="board-tray-type">
                    <Icon name={entry.typeIcon} size={11} style={{ color: entry.typeColour }} />
                    {entry.typeLabel}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="tiny muted board-tray-empty">Niets gevonden.</li>}
        </ul>
      )}
    </aside>
  );
}
