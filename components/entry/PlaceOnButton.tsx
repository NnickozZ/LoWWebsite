'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { fill } from '@/lib/words';

type Place = { slug: string; name: string };

/**
 * §92 (B12): "zet op…" as one button and a sheet, beside the other actions.
 *
 * Until this round the editing face printed a pill per landkaart and per
 * tijdlijn ("Zet op Walcheren", "Zet op De nacht van de storm", …) between the
 * header and the text — five of them in the test world, 450 px on a phone —
 * so pressing Bewerken to change one sentence pushed that sentence under a row
 * of actions nobody needed at that moment. The facts stay where they were
 * ("Op de landkaart: …"); the action is here, and it opens the same roads the
 * pills were: `?place=` on the landkaart or the tijdlijn.
 */
export function PlaceOnButton({
  entryId,
  entryName,
  maps,
  timelines,
}: {
  entryId: string;
  entryName: string;
  maps: Place[];
  timelines: Place[];
}) {
  const ui = useUi();
  const words = ui.words;
  const [open, setOpen] = useState(false);
  if (!maps.length && !timelines.length) return null;
  const query = `place=${entryId}&name=${encodeURIComponent(entryName)}`;
  const close = () => setOpen(false);

  return (
    <>
      <button type="button" className="btn btn-small" onClick={() => setOpen(true)} data-testid="place-on">
        <Icon name="mapPin" size={15} />
        {fill(words.placeOnButton, { landkaart: words.map, tijdlijn: words.timeline })}
      </button>
      {open && (
        <Sheet onClose={close} labelledBy="place-on-title">
          <h2 id="place-on-title" style={{ margin: '0 0 0.7rem', fontSize: '1.2rem' }}>
            {fill(words.placeOnTitle, { artikel: words.entry })}
          </h2>
          {maps.length > 0 && (
            <>
              <p className="label" style={{ margin: '0 0 0.3rem' }}>
                {words.mapPlural}
              </p>
              <ul className="suggest-list" style={{ margin: '0 0 0.9rem' }}>
                {maps.map((item) => (
                  <li key={item.slug}>
                    <Link className="suggest-item" href={`/maps/${item.slug}?${query}`} onClick={close}>
                      <Icon name="map" size={16} />
                      <span style={{ flex: 1, minWidth: 0 }}>{item.name}</span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link className="suggest-item" href={`/maps?${query}`} onClick={close}>
                    <Icon name="chevron" size={16} />
                    <span style={{ flex: 1, minWidth: 0 }}>{fill(words.placeOnOther, { meervoud: words.mapPlural })}</span>
                  </Link>
                </li>
              </ul>
            </>
          )}
          {timelines.length > 0 && (
            <>
              <p className="label" style={{ margin: '0 0 0.3rem' }}>
                {words.timelinePlural}
              </p>
              <ul className="suggest-list" style={{ margin: 0 }}>
                {timelines.map((item) => (
                  <li key={item.slug}>
                    <Link className="suggest-item" href={`/timelines/${item.slug}?${query}`} onClick={close}>
                      <Icon name="timeline" size={16} />
                      <span style={{ flex: 1, minWidth: 0 }}>{item.name}</span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link className="suggest-item" href={`/timelines?${query}`} onClick={close}>
                    <Icon name="chevron" size={16} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {fill(words.placeOnOther, { meervoud: words.timelinePlural })}
                    </span>
                  </Link>
                </li>
              </ul>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
