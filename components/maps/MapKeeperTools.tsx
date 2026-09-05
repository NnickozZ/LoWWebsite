'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { EntryPicker, type EntryRef } from '@/components/entry/EntryPicker';
import { uploadForm } from '@/lib/upload';
import type { MapSummary } from '@/lib/maps/service';

/**
 * §19: rename, describe, redraw, take down — the Keeper's corner of a map page.
 *
 * §23 adds one more line: which artikel this map *is* a map of. That is the
 * other direction from a speld. A speld says "the lighthouse is over there on
 * the island map"; this says "this drawing is the lighthouse" — the floor plan
 * of a building, the chart of a harbour — and it is what puts a "Landkaart van
 * dit artikel" link on the artikel's own page.
 */
export function MapKeeperTools({
  map,
  ofEntry,
}: {
  map: MapSummary;
  /** The artikel this map is of, already resolved. Null when it is of none. */
  ofEntry: EntryRef | null;
}) {
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  const [name, setName] = useState(map.name);
  const [description, setDescription] = useState(map.description);
  const [busy, setBusy] = useState(false);
  const [entry, setEntry] = useState<EntryRef | null>(ofEntry);
  const dirty = name.trim() !== map.name || description.trim() !== map.description;

  /**
   * The coupling saves the moment it is chosen rather than waiting for the
   * Opslaan button: it is one decision with one outcome, and a picker whose
   * choice needs confirming somewhere else is how a Keeper ends up thinking
   * they linked something they did not.
   */
  async function setOfEntry(next: EntryRef | null) {
    const before = entry;
    setEntry(next);
    setBusy(true);
    try {
      const response = await fetch(`/api/maps/${map.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entryId: next?.id ?? null }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setEntry(before);
        ui.toast(data.error ?? 'Koppelen is niet gelukt.');
        return;
      }
      ui.toast(next ? `Deze ${words.map} hoort nu bij ${next.name}.` : `Koppeling losgemaakt.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const response = await fetch(`/api/maps/${map.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const data = (await response.json()) as { map?: MapSummary; error?: string };
      if (!response.ok || !data.map) {
        ui.toast(data.error ?? 'Opslaan is niet gelukt.');
        return;
      }
      ui.toast('Opgeslagen.');
      if (data.map.slug !== map.slug) router.replace(`/maps/${data.map.slug}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function replacePicture(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const result = await uploadForm<{ map: { slug: string } }>(`/api/maps/${map.id}`, form, 'PATCH');
      if (!result.ok) {
        ui.toast(result.error);
        return;
      }
      ui.toast(`Nieuwe tekening; de ${words.mapPinPlural} staan waar ze stonden.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function takeDown() {
    const yes = await ui.confirm({
      title: `${map.name} van de muur halen?`,
      message: `De ${words.mapPinPlural} erop verdwijnen mee uit het zicht, maar worden niet gewist. De ${words.map} gaat naar de prullenbak in Beheer, en een ${words.keeper} kan hem daar terughangen — met alle ${words.mapPinPlural} nog op hun plek.`,
      confirmLabel: 'Weghalen',
      danger: true,
    });
    if (!yes) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/maps/${map.id}`, { method: 'DELETE' });
      if (!response.ok) {
        ui.toast('Weghalen is niet gelukt.');
        return;
      }
      router.push('/maps');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="section" style={{ marginTop: '1rem' }}>
      <summary>
        <Icon name="shield" size={14} /> Deze {words.map} ({words.keeper})
      </summary>
      <div className="stack" style={{ padding: '0.6rem 0 1rem' }}>
        <div>
          <label className="label" htmlFor="map-name">
            Naam
          </label>
          <input id="map-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="map-description">
            Omschrijving
          </label>
          <textarea
            id="map-description"
            className="input"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="map-of-entry">
            Van welk {words.entry}?
          </label>
          <p className="tiny muted" style={{ margin: '0 0 0.35rem' }}>
            Voor een plattegrond of een kaart die één plek uittekent. Op dat {words.entry} komt dan
            een link hierheen. Een {words.mapPin} zetten is iets anders — dat doe je op de tekening.
          </p>
          <EntryPicker
            id="map-of-entry"
            value={entry}
            placeholder={`Zoek het ${words.entry} dat hier getekend staat…`}
            onPick={(picked) => void setOfEntry(picked)}
            onClear={() => void setOfEntry(null)}
          />
        </div>
        <div className="row-wrap">
          <button type="button" className="btn btn-small btn-primary" disabled={busy || !dirty || !name.trim()} onClick={() => void save()}>
            Opslaan
          </button>
          <label className="btn btn-small" style={{ cursor: 'pointer' }}>
            <Icon name="upload" size={14} />
            Nieuwe tekening
            <input
              type="file"
              accept="image/*"
              className="visually-hidden"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void replacePicture(file);
                event.target.value = '';
              }}
            />
          </label>
          <span className="spacer" />
          <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={() => void takeDown()}>
            <Icon name="trash" size={14} />
            Van de muur halen
          </button>
        </div>
      </div>
    </details>
  );
}
