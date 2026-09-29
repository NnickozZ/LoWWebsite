'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { NietBewaardPaneel } from '@/components/admin/NietBewaard';
import { orderPanes } from '@/lib/adminTabOrder';
import { ADMIN_WHAT_KEY, mountedPanes, openPanes } from '@/lib/beheer';
import { fill } from '@/lib/words';
import { useUi } from '@/components/ui/UiProvider';
import { useSchuifrij } from '@/components/useSchuifrij';

export type AdminPane = {
  key: string;
  label: string;
  icon: string;
  /** Shown as a small count beside the label — the review queue uses it. */
  badge?: number;
  content: ReactNode;
};

/**
 * §11 asks for eight panes (there are ten now). One long scroll would bury the
 * useful ones, so Beheer is one list of onderdelen, drawn three ways by
 * `app/beheer.css` (§107, review 4 M10/M11):
 *
 *   - **telefoon**: kaal `/admin` is de index — elk onderdeel een rij met een
 *     zin eronder (`ADMIN_WHAT_KEY`) — en na een keuze staat er alleen
 *     *‹ Beheer* boven het paneel, geen strook. Bovenaan de index staat de
 *     uitnodiging (`vooraan`, golf J), omdat dat is waar een Keeper op een
 *     telefoon het eerst kijkt;
 *   - **768–1179 px**: één rij die opzij scrolt (`.schuifrij`);
 *   - **vanaf 1180 px**: de index als linkerkolom, altijd zichtbaar, en kaal
 *     `/admin` is Gebruikers.
 *
 * `?tab=` slaat de index over en blijft in het adres (§90). Every pane is
 * rendered on the server; this only chooses which one is on screen — and,
 * since golf J, keeps a pane with something unsaved mounted (hidden) when
 * another is chosen, so a wissel never throws a Keeper's work away
 * (`useNietBewaard`, `mountedPanes`).
 */
export function AdminTabs({ panes: given, vooraan }: { panes: AdminPane[]; vooraan?: ReactNode }) {
  const panes = orderPanes(given);
  const ui = useUi();
  // `/admin?tab=site` opens on that pane — the start page links there.
  const params = useSearchParams();
  const asked = params.get('tab');
  /*
   * §107: `null` is "nothing chosen yet". On a computer that is simply the
   * first pane; on a phone it is the index — every part of Beheer as a row
   * with one line under it, instead of a strip that hid the bin at x 696.
   */
  const [active, setActiveState] = useState<string | null>(
    panes.some((pane) => pane.key === asked) ? asked : null,
  );
  const current = panes.find((pane) => pane.key === active) ?? panes[0];
  const stripRef = useRef<HTMLDivElement>(null);
  useSchuifrij(stripRef, current?.key);
  /*
   * §90: and the choice is written back into the address, so a reload or a
   * Back lands on the same tab instead of on Gebruikers. `replaceState`, not
   * `router.replace`: every pane is already on the page, so asking the server
   * to render all ten again for a chip would be the slow way to change a
   * query string (the web and the search screen do the same; Next keeps
   * `useSearchParams` in step with it).
   */
  const setActive = useCallback((key: string | null) => {
    setActiveState(key);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (key) url.searchParams.set('tab', key);
    else url.searchParams.delete('tab');
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      // §94: `null`, not `history.state` — Next's patched replaceState only adopts
      // the new address when the data carries no `__NA` (see lib/canvas/memory.ts).
      window.history.replaceState(null, '', next);
    }
  }, []);

  /*
   * §107, golf J: wat elk paneel nog niet bewaard heeft. Een paneel met iets
   * open blijft gemount (verborgen) als een ander gekozen wordt, en heeft een
   * rood puntje bij zijn naam.
   */
  const reports = useRef(new Map<string, Map<string, number>>());
  const [unsaved, setUnsaved] = useState<Set<string>>(() => new Set());
  const meld = useCallback((paneel: string, bron: string, n: number) => {
    let bronnen = reports.current.get(paneel);
    if (!bronnen) {
      bronnen = new Map();
      reports.current.set(paneel, bronnen);
    }
    if (n > 0) bronnen.set(bron, n);
    else bronnen.delete(bron);
    const next = openPanes(reports.current);
    setUnsaved((was) => (was.size === next.size && [...next].every((key) => was.has(key)) ? was : next));
  }, []);
  const dot = (key: string) =>
    unsaved.has(key) ? (
      <span className="beheer-niet-bewaard" aria-hidden="true" title={ui.words.beheerNietBewaard} data-testid="beheer-niet-bewaard" />
    ) : null;

  const what = (key: string) => {
    const wordKey = ADMIN_WHAT_KEY[key];
    return wordKey ? fill(ui.words[wordKey] ?? '', { artikel: ui.words.entry }) : '';
  };

  return (
    <div className="beheer-tabs" data-index={active === null ? 'ja' : undefined}>
      {vooraan && <div className="beheer-vooraan">{vooraan}</div>}
      {/*
        §107: de index. Op een telefoon het eerste scherm, zolang er niets
        gekozen is; op een computer vanaf 1180 px de linkerkolom (review 4,
        M11), steeds zichtbaar, met het gekozen onderdeel gemarkeerd. Dezelfde
        rol (tabs) als de strook, zodat een tik hier en een tik daar hetzelfde
        doen; welke van de twee er staat, zegt de stylesheet.
      */}
      <div className="beheer-index" role="tablist" aria-label="Beheeronderdelen" data-testid="beheer-index">
        {panes.map((pane) => (
          <button
            key={pane.key}
            type="button"
            role="tab"
            aria-selected={pane.key === current?.key}
            className="beheer-index-rij"
            data-tab={pane.key}
            // De naam is alleen de naam (en het getal); de zin eronder is een
            // beschrijving. Anders heet Gebruikers ook "…wachtwoorden…" en
            // vindt een zoektocht naar *Woorden* er twee.
            aria-labelledby={`beheer-index-${pane.key}`}
            aria-describedby={`beheer-index-${pane.key}-wat`}
            onClick={() => {
              const wasIndex = active === null;
              setActive(pane.key);
              if (wasIndex && window.matchMedia?.('(max-width: 767px)').matches) window.scrollTo({ top: 0 });
            }}
          >
            <Icon name={pane.icon} size={20} className="beheer-index-icoon" />
            <span className="beheer-index-tekst">
              <span className="beheer-index-naam" id={`beheer-index-${pane.key}`}>
                {pane.label}
                {pane.badge ? <span className="admin-badge">{pane.badge}</span> : null}
              </span>
              <span className="beheer-index-wat" id={`beheer-index-${pane.key}-wat`}>
                {what(pane.key)}
                {unsaved.has(pane.key) && <span className="visually-hidden"> · {ui.words.beheerNietBewaard}</span>}
              </span>
            </span>
            {dot(pane.key)}
            <Icon name="chevron" size={16} className="beheer-index-pijl" />
          </button>
        ))}
      </div>

      {/*
        Review 4, M10: op een telefoon na een keuze alleen *‹ Beheer* — geen
        tweede navigatie eronder. De titel is de kop van het onderdeel zelf.
      */}
      <button
        type="button"
        className="btn btn-small btn-ghost beheer-terug"
        aria-label={ui.words.beheerTerug}
        onClick={() => setActive(null)}
      >
        <Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} />
        {ui.words.adminTitle}
      </button>

      {/* Tussen 768 en 1179 px: één rij die opzij scrolt, niet een strook die breekt. */}
      <div
        ref={stripRef}
        className="chip-strip schuifrij beheer-strip"
        role="tablist"
        aria-label="Beheeronderdelen"
      >
        {panes.map((pane) => (
          <button
            key={pane.key}
            type="button"
            role="tab"
            aria-selected={pane.key === current?.key}
            className={`chip chip-selectable${pane.key === current?.key ? ' chip-active' : ''}`}
            aria-describedby={unsaved.has(pane.key) ? `beheer-index-${pane.key}-wat` : undefined}
            onClick={() => setActive(pane.key)}
          >
            <Icon name={pane.icon} size={14} />
            {pane.label}
            {pane.badge ? <span className="admin-badge">{pane.badge}</span> : null}
            {dot(pane.key)}
          </button>
        ))}
      </div>

      {/*
        Golf J: het gekozen paneel, en elk paneel waar nog iets niet bewaard is —
        verborgen, maar gemount, zodat een wissel niets weggooit.
      */}
      {mountedPanes(
        panes.map((pane) => pane.key),
        current?.key,
        unsaved,
      ).map((key) => {
        const pane = panes.find((item) => item.key === key)!;
        const here = key === current?.key;
        return (
          <div
            key={key}
            role="tabpanel"
            aria-label={pane.label}
            className="beheer-paneel"
            data-tab={key}
            hidden={!here || undefined}
          >
            <NietBewaardPaneel paneel={key} meld={meld}>
              {pane.content}
            </NietBewaardPaneel>
          </div>
        );
      })}
    </div>
  );
}
