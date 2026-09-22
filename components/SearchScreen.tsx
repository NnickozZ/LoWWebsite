'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Thumb } from './Cover';
import { Icon } from './Icon';
import { MentionText } from './ui/MentionPopover';
import { useUi } from './ui/UiProvider';
import type { EntrySummary } from '@/lib/entries/service';
import { entryDisplayName, isAdrift } from '@/lib/entries/caseName';
import { AdriftChip } from './entry/AdriftChip';
import { KIND_ICON, KIND_WORD } from '@/lib/keeper/kinds';
import type { OtherHit, OtherKind } from '@/lib/search/others';
import { capitalise, fill, type Words } from '@/lib/words';

type Results = { names: EntrySummary[]; bodies: EntrySummary[]; others: OtherHit[] };

const EMPTY: Results = { names: [], bodies: [], others: [] };

/** §96: what a kind of other thing is called and wears — its §11 word, never a noun in here. */
function otherLook(kind: OtherKind, words: Words): { word: string; icon: string } {
  if (kind === 'speler') return { word: capitalise(words.player), icon: 'person' };
  return { word: capitalise(words[KIND_WORD[kind]]), icon: KIND_ICON[kind] };
}

/**
 * §96: a dossier, a vlak, an overzicht or a speler — found by name. The row is
 * the feed's row, so the list reads as one list; what kind of thing it is sits
 * where an artikel's description would.
 */
function OtherRow({ hit, words }: { hit: OtherHit; words: Words }) {
  const look = otherLook(hit.kind, words);
  return (
    <Link
      href={hit.href}
      className="feed-item search-other"
      style={{ color: 'inherit', textDecoration: 'none' }}
      data-testid="search-other"
      data-kind={hit.kind}
    >
      <span className="feed-thumb search-other-mark" aria-hidden="true">
        <Icon name={look.icon} size={18} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong>{hit.name}</strong>
        <span className="tiny muted" style={{ display: 'block' }}>
          {look.word}
          {hit.caseName ? ` · ${hit.caseName}` : ''}
        </span>
      </span>
    </Link>
  );
}

export type SearchType = { slug: string; label: string; icon: string; colour: string };

function ResultRow({ entry }: { entry: EntrySummary }) {
  return (
    <Link
      href={`/e/${entry.slug}`}
      className="feed-item"
      style={{ color: 'inherit', textDecoration: 'none' }}
      data-entry-id={entry.id}
    >
      <Thumb
        assetId={entry.coverAssetId}
        crop={entry.coverCrop}
        shape="portrait"
        icon={entry.typeIcon}
        colour={entry.typeColour}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong>{entryDisplayName(entry.name, entry.originCaseName)}</strong>
        {/* §24: in no dossier at all — a loose end, said out loud. */}
        {isAdrift(entry) && (
          <>
            {' '}
            <AdriftChip />
          </>
        )}
        <span className="tiny muted clamp-2" style={{ display: 'block' }}>
          {/* §48: flat chips — the hit is a link. */}
          <MentionText text={entry.shortDescription} flat tokens />
        </span>
      </span>
    </Link>
  );
}

/**
 * The search page. One box, and — since 5 Sep 2026 — a row of soorten under
 * it, so that "a person called Pier" is not fished out of a list of
 * lighthouses and relics once the wiki has grown. "Alles" is the default and
 * groups the results by soort as before; a chosen soort narrows both the
 * name matches and the text matches to it. The choice rides in the URL
 * (`?type=`) so a search can be sent along.
 */
export function SearchScreen({
  initialQuery = '',
  initialType = '',
  types = [],
}: {
  initialQuery?: string;
  initialType?: string;
  types?: SearchType[];
}) {
  const ui = useUi();
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState(types.some((t) => t.slug === initialType) ? initialType : '');
  const [results, setResults] = useState<Results>(EMPTY);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const typed = query.trim();
    if (!typed) {
      setResults(EMPTY);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: typed });
        if (type) params.set('type', type);
        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const body = (await response.json()) as Partial<Results>;
          setResults({ names: body.names ?? [], bodies: body.bodies ?? [], others: body.others ?? [] });
        }
      } catch {
        /* aborted */
      } finally {
        setBusy(false);
      }
    }, 140);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setBusy(false);
    };
  }, [query, type]);

  // Keep the address honest without a navigation: a reload lands here again.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (type) params.set('type', type);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `/search?${qs}` : '/search');
  }, [query, type]);

  /** Names grouped by type, in the order the ranking produced them (§10). */
  const grouped = useMemo(() => {
    const groups = new Map<string, { label: string; icon: string; colour: string; items: EntrySummary[] }>();
    for (const entry of results.names) {
      const group = groups.get(entry.typeSlug) ?? {
        label: entry.typeLabel,
        icon: entry.typeIcon,
        colour: entry.typeColour,
        items: [],
      };
      group.items.push(entry);
      groups.set(entry.typeSlug, group);
    }
    return [...groups.values()];
  }, [results.names]);

  const typed = query.trim();
  const chosenType = types.find((t) => t.slug === type);

  return (
    <div className="page">
      <label className="visually-hidden" htmlFor="search-input">
        Zoeken in het archief
      </label>
      <input
        id="search-input"
        ref={inputRef}
        className="input"
        value={query}
        placeholder={chosenType ? `Zoek in ${chosenType.label.toLowerCase()}…` : 'Zoek op naam, tag, wat dan ook…'}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
        style={{ fontSize: '1.1rem', marginBottom: '0.6rem' }}
      />

      {types.length > 0 && (
        <div className="chip-strip search-types" role="radiogroup" aria-label="Zoek in" style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            role="radio"
            aria-checked={type === ''}
            className={`chip chip-selectable${type === '' ? ' chip-active' : ''}`}
            onClick={() => setType('')}
          >
            Alles
          </button>
          {types.map((item) => (
            <button
              key={item.slug}
              type="button"
              role="radio"
              aria-checked={type === item.slug}
              className={`chip chip-selectable${type === item.slug ? ' chip-active' : ''}`}
              onClick={() => setType(type === item.slug ? '' : item.slug)}
            >
              <Icon name={item.icon} size={13} style={type === item.slug ? undefined : { color: item.colour }} />
              {item.label}
            </button>
          ))}
        </div>
      )}

      {!typed && (
        <p className="muted small">
          Typ om te zoeken. Druk overal op <kbd>/</kbd> om hier te komen.
        </p>
      )}

      {typed && (
        <>
          {grouped.map((group) => (
            <section key={group.label} style={{ marginBottom: '1.2rem' }}>
              <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Icon name={group.icon} size={14} style={{ color: group.colour }} />
                {group.label}
              </p>
              {group.items.map((entry) => (
                <ResultRow key={entry.id} entry={entry} />
              ))}
            </section>
          ))}

          {/* §96: the other things in the archive, by name, under "Alles" only. */}
          {!chosenType && results.others.length > 0 && (
            <section style={{ marginBottom: '1.2rem' }} data-testid="search-others">
              <p className="eyebrow">{ui.words.searchOthers}</p>
              {results.others.map((hit) => (
                <OtherRow key={`${hit.kind}:${hit.id}`} hit={hit} words={ui.words} />
              ))}
            </section>
          )}

          {results.bodies.length > 0 && (
            <section style={{ marginBottom: '1.2rem' }}>
              <p className="eyebrow">Genoemd in de tekst</p>
              {results.bodies.map((entry) => (
                <ResultRow key={entry.id} entry={entry} />
              ))}
            </section>
          )}

          {!busy && !results.names.length && !results.bodies.length && !results.others.length && (
            <p className="muted small" data-testid="search-none">
              {/* §96: honest now — under "Alles" every kind of thing was asked. */}
              {chosenType
                ? fill(ui.words.searchNoneInType, { soort: chosenType.label.toLowerCase() })
                : ui.words.searchNone}
            </p>
          )}

          <button
            type="button"
            className="btn"
            style={{ width: '100%', marginTop: '0.5rem' }}
            onClick={() => ui.openNewEntry({ name: typed, typeSlug: type || undefined })}
          >
            <Icon name="plus" size={16} />
            &lsquo;{typed}&rsquo; aanmaken
          </button>
        </>
      )}
    </div>
  );
}
