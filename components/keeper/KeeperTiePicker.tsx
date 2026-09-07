'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { KIND_ICON, KIND_WORD, type KeeperKind, type KeeperRef } from '@/lib/keeper/kinds';

/**
 * §44: the box that ties a touwtje.
 *
 * The same shape as `CaseAddSearch` and `EntryPicker` — type, wait 160 ms,
 * fetch, pick a row — with two differences. It searches all five kinds at once
 * (`/api/keeper/search`, which puts every candidate through `keeperRef`), and
 * it has **no "… aanmaken" row**: a rope is tied between two things that
 * already exist, and there is nothing here for a stray Enter to create.
 */
export function KeeperTiePicker({
  self,
  onTied,
}: {
  self: { kind: KeeperKind; id: string };
  onTied: () => void;
}) {
  const ui = useUi();
  const words = ui.words;
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<KeeperRef[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const typed = query.trim();
    if (typed.length < 1) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/keeper/search?q=${encodeURIComponent(typed)}&notKind=${self.kind}&notId=${self.id}`,
          { signal: controller.signal },
        );
        if (response.ok) setItems(((await response.json()).results ?? []) as KeeperRef[]);
      } catch {
        /* aborted */
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, self.kind, self.id]);

  async function tie(other: KeeperRef) {
    setBusy(true);
    try {
      const response = await fetch('/api/keeper/ties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ self, other: { kind: other.kind, id: other.id } }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        ui.toast(data.error ?? 'Dat lukte niet.');
        return;
      }
      setQuery('');
      setItems([]);
      onTied();
    } catch {
      ui.toast('Geen verbinding.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="keeper-tie-picker">
      <input
        className="input"
        value={query}
        disabled={busy}
        placeholder={`Zoek een ${words.entry}, ${words.case}, ${words.board}, ${words.map} of ${words.timeline}…`}
        aria-label="Zoek iets om een touwtje aan vast te maken"
        onChange={(event) => setQuery(event.target.value)}
      />
      {items.length > 0 && (
        <div className="suggest-list" role="listbox">
          {items.map((item) => (
            <button
              key={`${item.kind}:${item.id}`}
              type="button"
              className="suggest-item"
              disabled={busy}
              onClick={() => void tie(item)}
            >
              <Icon name={KIND_ICON[item.kind]} size={15} />
              <span>{item.name}</span>
              <span className="tiny muted">
                {words[KIND_WORD[item.kind]]}
                {item.keeperOnly ? ` · ${words.keeperSide}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
