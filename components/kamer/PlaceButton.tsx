'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { SUGGEST_DEBOUNCE_MS } from '@/lib/search/suggest';
import type { PlekKind } from '@/lib/kamers/shape';
import { kamerPost } from './post';

type Voorwerp = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
};

/**
 * §79: putting something in a plek.
 *
 * The same shape as every other picker in the archive — a sheet, one box, a
 * debounced ask, a list of rows you tap (`AddToCaseButton`, `EntryPicker`,
 * the prikbord's search) — and deliberately so: this is the fourth or fifth
 * time somebody searches the wiki from inside something else, and a fifth
 * invention would be a fifth set of habits to learn.
 *
 * What it does *not* do is decide anything. The list comes from
 * `/api/kamers/<room>/voorwerpen?kind=…`, which asks the same three questions
 * `placeItem` asks and shows what survives them; the refusal, if the archive
 * moved under the sheet, still comes from the server and is shown as it is
 * written there.
 *
 * With an empty box the list is already there — the most recently touched
 * voorwerpen that fit this plek. A picker that shows nothing until you type is
 * a picker that cannot answer "what have I got?", which is the question
 * somebody standing in front of an empty plank actually has.
 */
export function PlaceButton({
  roomId,
  slotId,
  kind,
  kindLabel,
  label,
}: {
  roomId: string;
  slotId: string;
  kind: PlekKind;
  /** The plek's kind in the Keeper's own word, for the sheet's heading. */
  kindLabel: string;
  /** `words.slotPlace`. */
  label: string;
}) {
  const ui = useUi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Voorwerp[]>([]);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => boxRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/kamers/${roomId}/voorwerpen?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { entries?: Voorwerp[] };
        setItems(data.entries ?? []);
      } catch {
        /* ignore — an aborted ask is the next keystroke's, not a failure */
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, roomId, kind]);

  async function place(entry: Voorwerp) {
    setBusy(true);
    try {
      const error = await kamerPost(`/api/kamers/${roomId}/plekken/${slotId}/place`, { entryId: entry.id });
      if (error) {
        ui.toast(error);
        return;
      }
      setOpen(false);
      setQuery('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const titleId = `plek-place-${slotId}`;

  return (
    <>
      <button
        type="button"
        className="btn btn-small plek-action"
        data-testid="plek-place"
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" size={13} />
        {label}
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy={titleId}>
          <div data-testid="plek-picker">
            <h2 id={titleId} style={{ margin: '0 0 0.7rem', fontSize: '1.2rem' }}>
              {label} &mdash; {kindLabel}
            </h2>

            <label className="visually-hidden" htmlFor={`${titleId}-zoek`}>
              Zoeken
            </label>
            <input
              id={`${titleId}-zoek`}
              ref={boxRef}
              className="input"
              data-testid="plek-picker-zoek"
              value={query}
              placeholder="Zoeken…"
              onChange={(event) => setQuery(event.target.value)}
            />

            {items.length === 0 ? (
              <p className="small muted" style={{ marginTop: '0.7rem' }} data-testid="plek-picker-leeg">
                Niets dat hier past.
              </p>
            ) : (
              <ul className="suggest-list" style={{ marginTop: '0.6rem' }}>
                {items.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="suggest-item"
                      data-testid="plek-picker-optie"
                      data-entry-id={entry.id}
                      disabled={busy}
                      onClick={() => void place(entry)}
                    >
                      <Icon name={entry.typeIcon} size={16} style={{ color: entry.typeColour }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong>{entry.name}</strong>
                        <span className="tiny muted clamp-2" style={{ display: 'block' }}>
                          {entry.shortDescription || entry.typeLabel}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
