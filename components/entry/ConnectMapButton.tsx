'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { fuzzyScore } from '@/lib/search/fuzzy';
import { capitalise } from '@/lib/words';
import type { MapSummary } from '@/lib/maps/service';

/**
 * §23: hooks a landkaart onto this artikel, from the artikel.
 *
 * The coupling itself lives on the map (`maps.entry_id`) and can be set there
 * too — but a Keeper writing up a location is on the *location's* page, and
 * "go and find the drawing, then come back" is exactly the errand that makes a
 * link never get made. So the same one switch is offered from both ends.
 *
 * Keeper only, because hanging and changing landkaarten is (§19) Keeper work.
 * A map that is already the drawing of some other artikel says so in the list
 * rather than being hidden: moving one is a legitimate thing to do, and a map
 * that has silently vanished from a picker is a bug report.
 */
export function ConnectMapButton({
  entryId,
  entryName,
}: {
  entryId: string;
  entryName: string;
}) {
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void fetch('/api/maps')
      .then((response) => (response.ok ? response.json() : { maps: [] }))
      .then((data) => setMaps(data.maps ?? []))
      .catch(() => undefined);
  }, [open]);

  const matches = useMemo(() => {
    const free = maps.filter((map) => map.entryId !== entryId);
    const typed = query.trim();
    if (!typed) return free.slice(0, 8);
    return free
      .map((map) => ({ map, score: fuzzyScore(map.name, typed) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((row) => row.map);
  }, [maps, query, entryId]);

  async function connect(map: MapSummary) {
    setBusy(true);
    try {
      const response = await fetch(`/api/maps/${map.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entryId }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        ui.toast(data.error ?? 'Koppelen is niet gelukt.');
        return;
      }
      setOpen(false);
      ui.toast(`${map.name} is nu de ${words.map} van ${entryName}.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="chip chip-selectable"
        onClick={() => setOpen(true)}
        title={`Kies de ${words.map} die dit ${words.entry} uittekent`}
      >
        <Icon name="map" size={12} />
        {capitalise(words.map)} koppelen
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="connect-map-title">
          <div className="row" style={{ marginBottom: '0.7rem' }}>
            <h2 id="connect-map-title" style={{ margin: 0, fontSize: '1.2rem' }}>
              Welke {words.map} tekent {entryName} uit?
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

          <p className="small muted" style={{ marginTop: 0 }}>
            Voor een plattegrond of een tekening van deze ene plek. Wil je dit {words.entry} juist
            ergens <em>op</em> een {words.map} zetten, gebruik dan &lsquo;{words.onTheMap}&rsquo;.
          </p>

          <label className="visually-hidden" htmlFor="connect-map-search">
            Landkaarten zoeken
          </label>
          <input
            id="connect-map-search"
            className="input"
            value={query}
            placeholder={`Zoek een ${words.map}…`}
            onChange={(event) => setQuery(event.target.value)}
          />

          <ul className="suggest-list" style={{ marginTop: '0.6rem' }}>
            {matches.map((map) => (
              <li key={map.id}>
                <button
                  type="button"
                  className="suggest-item"
                  disabled={busy}
                  onClick={() => void connect(map)}
                >
                  <Icon name="map" size={16} style={{ color: 'var(--ink-muted)' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{map.name}</strong>
                    {map.entryId && (
                      <span className="tiny muted" style={{ display: 'block' }}>
                        Hoort nu bij een ander {words.entry} — koppelen verplaatst hem
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
            {!matches.length && (
              <li className="tiny muted" style={{ padding: '0.5rem 0.6rem' }}>
                {maps.length
                  ? 'Niets gevonden.'
                  : `Er hangt nog geen ${words.map}. Hang er een op via de kaartenpagina.`}
              </li>
            )}
          </ul>
        </Sheet>
      )}
    </>
  );
}
