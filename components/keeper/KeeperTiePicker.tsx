'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import {
  KIND_ICON,
  KIND_WORD,
  KIND_WORD_PLURAL,
  type KeeperKind,
  type KeeperRef,
} from '@/lib/keeper/kinds';

/**
 * §44: the box that ties a touwtje.
 *
 * The same shape as `CaseAddSearch` and `EntryPicker` — type, wait 160 ms,
 * fetch, pick a row — with two differences. It searches all five kinds at once
 * (`/api/keeper/search`, which puts every candidate through `keeperRef`), and
 * it has **no "… aanmaken" row**: a rope is tied between two things that
 * already exist, and there is nothing here for a stray Enter to create.
 *
 * §53: and in `mode="twin"` it ties the other kind of tie. One box, two modes,
 * because the shape of the question is identical and a second picker would be
 * a second set of manners to keep in step. What the mode changes is what it
 * *offers*: only this soort, only the other side of the archive, and only
 * pages that do not already have another face — a candidate that would be
 * refused is better left out of the list than explained afterwards. It also
 * asks first: a tweeling makes one text out of two, which is not something to
 * discover after a click.
 */
export function KeeperTiePicker({
  self,
  mode = 'rope',
  keeperOnly = false,
  onTied,
}: {
  self: { kind: KeeperKind; id: string };
  /** §53: `rope` ties a touwtje, `twin` links the other face of this page. */
  mode?: 'rope' | 'twin';
  /** §53: which side this page itself is on — the twin is looked for on the other. */
  keeperOnly?: boolean;
  onTied: () => void;
}) {
  const ui = useUi();
  const words = ui.words;
  const twinMode = mode === 'twin';
  // The face we are looking *for*: the opposite of the one we are standing on.
  const wantSide = keeperOnly ? 'player' : 'keeper';
  const otherName = keeperOnly ? words.playerVersion : words.keeperVersion;
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
        const narrow = twinMode ? `&onlyKind=${self.kind}&side=${wantSide}&free=1` : '';
        const response = await fetch(
          `/api/keeper/search?q=${encodeURIComponent(typed)}&notKind=${self.kind}&notId=${self.id}${narrow}`,
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
  }, [query, self.kind, self.id, twinMode, wantSide]);

  async function tie(other: KeeperRef) {
    if (twinMode) {
      const yes = await ui.confirm({
        title: `${other.name} de andere kant van deze pagina maken?`,
        message: `De twee blijven allebei staan waar ze staan; de knop bovenaan springt van nu af tussen ze heen en weer. De ${words.keeperNotes} van de twee worden één tekst, bewaard op de ${words.keeperSide}.`,
        confirmLabel: 'Koppelen',
      });
      if (!yes) return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/keeper/ties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          self,
          other: { kind: other.kind, id: other.id },
          ...(twinMode ? { twin: true } : {}),
        }),
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
    <div className="keeper-tie-picker" data-testid={twinMode ? 'keeper-twin-picker' : 'keeper-tie-picker'}>
      <input
        className="input"
        value={query}
        disabled={busy}
        autoFocus={twinMode}
        placeholder={
          twinMode
            ? `Zoek de ${otherName.toLowerCase()} die al bestaat…`
            : `Zoek een ${words.entry}, ${words.case}, ${words.board}, ${words.map} of ${words.timeline}…`
        }
        aria-label={
          twinMode
            ? `Zoek de ${otherName.toLowerCase()} van deze pagina`
            : 'Zoek iets om een touwtje aan vast te maken'
        }
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
      {twinMode && query.trim().length > 0 && items.length === 0 && (
        <p className="tiny muted keeper-twin-empty">
          Geen vrije {words[KIND_WORD_PLURAL[self.kind]].toLowerCase()} aan de andere kant met die
          naam. Iets dat al een andere kant heeft staat hier niet bij.
        </p>
      )}
    </div>
  );
}
