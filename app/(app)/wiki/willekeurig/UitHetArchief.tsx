'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { ArchiveCard } from '@/lib/wiki/leeskamer';
import { anotherFromTheArchive } from './actions';

/**
 * §104, ronde 67 (L1): *Uit het archief* — één artikel, en *Nog één*.
 *
 * Voor de lezer die niets zoekt (het onderzoek, §A4: een op de vijf leest uit
 * verveling of nieuwsgierigheid, en zulke lezers nemen "lange, snelle,
 * gevarieerde" routes): een deur naar iets wat je nog niet kende. *Nog één*
 * vraagt de server om een ander (`anotherFromTheArchive` → `randomEntry`, de
 * regel van `/wiki/willekeurig`) en blijft op de pagina.
 *
 * Beweging: de nieuwe kaart komt binnen met een fade van `--dur-2` (alleen
 * `opacity`, dus ook met het toetsenbord binnen de 100–110 ms), zonder onder
 * reduced motion. Terwijl de server kiest, zakt de oude kaart iets weg: het
 * teken binnen 100 ms (§102, regel 1).
 */
export function UitHetArchief({ initial }: { initial: ArchiveCard | null }) {
  const ui = useUi();
  const words = ui.words;
  const [card, setCard] = useState(initial);
  const [pending, startTransition] = useTransition();

  if (!card) return <p className="leeskamer-leeg">{words.wikiArchiveNone}</p>;

  const another = () => {
    if (pending) return;
    startTransition(async () => {
      try {
        const next = await anotherFromTheArchive(card.id);
        if (next) setCard(next);
      } catch {
        ui.toast(words.somethingWrong);
      }
    });
  };

  return (
    <article
      className={`leeskamer-archief-kaart${pending ? ' is-bezig' : ''}`}
      data-testid="uit-het-archief"
      data-slug={card.slug}
      aria-busy={pending || undefined}
      aria-live="polite"
    >
      {/* Keyed on the artikel, so a new one fades in — and only this part:
          the buttons below keep their place and the caret on *Nog één*. */}
      {/*
        §104 (ronde 67·herstel, #11): two shapes, and neither is an empty
        frame. With an omslag, the picture stands upright beside the text —
        the staande crop, whole, so a drawn title at 70 % of its height is not
        cut off the way the liggende crop cut it. Without one, a fiche: the
        soort's icon as a stamp beside the name and a hairline in the soort's
        colour under them. Two thirds of the archive has no omslag; that is the
        shape a reader meets most, and it used to be a grey box.
      */}
      <div
        key={card.id}
        className={`leeskamer-archief-inhoud ${card.coverAssetId ? 'met-omslag' : 'zonder-omslag'}`}
        style={{ ['--soort' as string]: card.typeColour }}
      >
        {card.coverAssetId && (
          <Link href={`/e/${card.slug}`} className="leeskamer-archief-beeld" tabIndex={-1} aria-hidden="true">
            <Cover
              assetId={card.coverAssetId}
              crop={card.coverCrop}
              shape="portrait"
              alt=""
              variant="card"
              className="leeskamer-archief-omslag"
            />
          </Link>
        )}
        <div className="leeskamer-archief-tekst">
          <div className="leeskamer-archief-kop">
            {!card.coverAssetId && (
              <span className="leeskamer-archief-stempel soort-inkt" aria-hidden="true">
                <Icon name={card.typeIcon} size={26} />
              </span>
            )}
            <div className="leeskamer-archief-titel">
              <p className="leeskamer-soort">
                <Icon name={card.typeIcon} size={13} />
                {card.typeLabel}
              </p>
              <h3 className="leeskamer-archief-naam">
                <Link href={`/e/${card.slug}`}>{card.name}</Link>
              </h3>
            </div>
          </div>
          {card.lead && <p className="leeskamer-archief-lead">{card.lead}</p>}
        </div>
      </div>
      <div className="leeskamer-archief-knoppen">
        <Link href={`/e/${card.slug}`} className="btn btn-small">
          <Icon name="book" size={14} />
          {words.wikiReadOn}
        </Link>
        <button
          type="button"
          className="btn btn-small"
          onClick={another}
          aria-disabled={pending || undefined}
          data-testid="nog-een"
        >
          <Icon name="dice" size={14} />
          {words.wikiOneMore}
        </button>
      </div>
    </article>
  );
}
