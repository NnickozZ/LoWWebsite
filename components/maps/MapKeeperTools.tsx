'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { MapSummary } from '@/lib/maps/service';

/** §19: rename, describe, redraw, take down — the Keeper's corner of a map page. */
export function MapKeeperTools({ map }: { map: MapSummary }) {
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  const [name, setName] = useState(map.name);
  const [description, setDescription] = useState(map.description);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== map.name || description.trim() !== map.description;

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
      const response = await fetch(`/api/maps/${map.id}`, { method: 'PATCH', body: form });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        ui.toast(data.error ?? 'De nieuwe afbeelding is niet opgeslagen.');
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
      message: `De ${words.mapPinPlural} erop verdwijnen mee uit het zicht. Een ${words.keeper} kan de ${words.map} niet terughalen via de prullenbak — het bestand blijft wel bewaard.`,
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
