'use client';

import { useEffect, useRef, useState } from 'react';
import { assetUrl, coverStyle } from '@/components/Cover';
import { borderClass } from '@/components/borders';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { capitalise } from '@/lib/words';
import { cardRef, PIN_SIZE, type BoardCard as BoardCardModel, type CardCrop } from '@/lib/boards/merge';
import type { BoardRefs } from '@/lib/boards/service';
import type { CoverCrop } from '@/lib/db/schema';

export const CARD_WIDTH = 160;

/**
 * What a card *stands for*, once its id has been looked up.
 *
 * Three kinds of card point at something else in the archive — an artikel, a
 * landkaart, a dossier — and on the cork they behave identically: a picture, a
 * name, a double-click that opens the thing. One shape for all three keeps
 * that true, and keeps the card view from growing a branch per kind.
 *
 * A card whose id resolves to nothing has no subject at all, which is what
 * draws the MISSING stamp. That is the same answer for "it was deleted" and
 * "you may not see it", deliberately: the second must not be distinguishable
 * from the first.
 */
export type CardSubject = {
  kind: 'entry' | 'map' | 'case';
  name: string;
  /** Where a double-click goes. */
  href: string;
  assetId: string | null;
  crop: CoverCrop | null;
  icon: string;
  colour: string;
  /** The border this kind of thing wears, when it has one of its own. */
  border: string | null;
  /** What the card is called in a title attribute — "artikel", "landkaart"… */
  noun: string;
};

/** Resolves a card against the three lookup maps the board keeps. */
export function subjectOf(card: BoardCardModel, refs: BoardRefs): CardSubject | undefined {
  const ref = cardRef(card);
  if (!ref) return undefined;

  if (ref.kind === 'entry') {
    const entry = refs.entries[ref.id];
    if (!entry) return undefined;
    return {
      kind: 'entry',
      name: entry.name,
      href: `/e/${entry.slug}`,
      assetId: entry.coverAssetId,
      crop: (entry.coverCrop as CoverCrop | null) ?? null,
      icon: entry.typeIcon,
      colour: entry.typeColour,
      border: entry.typeBorder,
      noun: 'artikel',
    };
  }

  if (ref.kind === 'map') {
    const map = refs.maps[ref.id];
    if (!map) return undefined;
    return {
      kind: 'map',
      name: map.name,
      href: `/maps/${map.slug}`,
      assetId: map.assetId,
      // A landkaart has no crop of its own; a card that wants one sets its own.
      crop: null,
      icon: 'map',
      colour: 'var(--ink-muted)',
      // "Kaartrand" — the dashed edge of a printed map, which is what it is.
      border: 'dashed',
      noun: 'landkaart',
    };
  }

  const item = refs.cases[ref.id];
  if (!item) return undefined;
  return {
    kind: 'case',
    name: item.name,
    href: `/c/${item.slug}`,
    assetId: item.assetId,
    crop: (item.crop as CoverCrop | null) ?? null,
    icon: 'folder',
    colour: 'var(--ink-muted)',
    // "Vergeeld" — the yellowed paper of a file that has been in a drawer.
    border: 'inset',
    noun: 'dossier',
  };
}

/**
 * What picture a card shows and how it is framed. A card's own photo wins; a
 * card that stands for something otherwise borrows that thing's picture — an
 * artikel's cover, a dossier's cover, the landkaart itself. Either way the crop
 * is the *card's* when it has one, so tightening a face on this board leaves
 * every other list alone.
 */
export function cardImage(card: BoardCardModel, subject?: CardSubject) {
  const own = card.assetId ?? null;
  const assetId = own ?? subject?.assetId ?? null;
  const crop: CardCrop | CoverCrop | null = card.crop ?? (own ? null : (subject?.crop ?? null));
  return { assetId, crop, isOwn: Boolean(own) };
}

/**
 * The border this card draws: its own override, else the one its subject wears,
 * else what the card *is* — a pinned photograph gets a print's white margin, a
 * bare note gets a hairline.
 */
export function cardBorder(card: BoardCardModel, subject?: CardSubject): string {
  return card.border ?? subject?.border ?? (card.kind === 'photo' ? 'solid' : 'plain');
}

/**
 * One index card. The picture frame is a uniform 3:4 whatever is in it — the
 * entry's cover, a picture pinned to this card, or a placeholder — so a board
 * reads as one wall of cards rather than a collage. The frame can be switched
 * off entirely, leaving a plain slip of paper.
 */
export function BoardCardView({
  card,
  subject,
  selected,
  interactive,
  cropping,
  canOpenOnTap,
  onPointerDown,
  onPinPointerDown,
  onTextChange,
  onOpen,
  onViewFull,
  onConvertToEntry,
  carried = false,
}: {
  card: BoardCardModel;
  /** What this card stands for, resolved for this viewer. Absent = MISSING. */
  subject?: CardSubject;
  selected: boolean;
  /** §8, live: somebody else's hand is moving this card right now. */
  carried?: boolean;
  /** False under 768 px: the card can be selected and edited, but not dragged. */
  interactive: boolean;
  /** True while this card's picture is being repositioned. */
  cropping: boolean;
  /**
   * Whether a *single* tap should open the entry. On a desktop the answer is
   * always no — one click selects, a double-click opens — so a stray click on
   * the wall never yanks you off the board. On a phone, where double-tap is
   * unreliable, the first tap selects and the second opens. Asked at click
   * time, not render time: the pointerdown that precedes a click has already
   * selected the card, so a boolean prop would always read "selected" by then.
   */
  canOpenOnTap: () => boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onPinPointerDown: (event: React.PointerEvent) => void;
  onTextChange: (text: string) => void;
  onOpen: () => void;
  onViewFull: () => void;
  onConvertToEntry: () => void;
}) {
  const words = useUi().words;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(card.text);
  }, [card.text, editing]);

  useEffect(() => {
    if (editing) textRef.current?.focus();
  }, [editing]);

  // Three kinds of card stand for something in the archive; all three go
  // MISSING the same way when what they stand for is gone or out of reach.
  const refers = card.kind === 'entry' || card.kind === 'map' || card.kind === 'case';
  const missing = refers && !subject;
  const { assetId: image, crop: imageCrop, isOwn } = cardImage(card, subject);
  const zoomed = (imageCrop?.zoom ?? 1) > 1.05;

  if (card.kind === 'pin') {
    // A bare pin: a head to run string from, and a paper tag to drag it by and
    // label it. No border, no picture, no body — it is a place, not a card.
    return (
      <div
        className={`board-card board-pincard${selected ? ' board-card-selected' : ''}${carried ? ' board-card-carried' : ''}`}
        style={{
          left: card.x,
          top: card.y,
          width: PIN_SIZE.width,
          cursor: interactive ? 'grab' : 'pointer',
        }}
        onPointerDown={onPointerDown}
        data-card-id={card.id}
        title={card.name ? undefined : 'Een punaise — selecteer hem om er een label aan te geven'}
      >
        <span
          className="board-pin"
          aria-label="Span draad vanaf deze punaise"
          title="Sleep naar een andere kaart, of naar het kale kurk, om draad te spannen"
          onPointerDown={(event) => {
            event.stopPropagation();
            onPinPointerDown(event);
          }}
        />
        <span className={`board-pintag${card.name ? '' : ' board-pintag-empty'}`}>
          {card.name || '\u2026'}
        </span>
      </div>
    );
  }

  /** A card that stands for something opens it; a picture opens full size. */
  function open(event: React.MouseEvent) {
    if (cropping) return;
    event.stopPropagation();
    if (refers && subject) onOpen();
    else if (isOwn) onViewFull();
  }

  function onCoverClick(event: React.MouseEvent) {
    if (!canOpenOnTap()) return;
    open(event);
  }

  function onCoverDoubleClick(event: React.MouseEvent) {
    open(event);
  }

  return (
    <div
      className={[
        'board-card',
        borderClass(cardBorder(card, subject)),
        selected ? 'board-card-selected' : '',
        cropping ? 'board-card-cropping' : '',
        carried ? 'board-card-carried' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: card.x,
        top: card.y,
        width: CARD_WIDTH,
        transform: `rotate(${card.rotation}deg)`,
        cursor: cropping ? 'grab' : interactive ? 'grab' : 'pointer',
      }}
      onPointerDown={onPointerDown}
      data-card-id={card.id}
    >
      <span
        className="board-pin"
        aria-label="Span draad vanaf deze kaart"
        title="Sleep naar een andere kaart, of naar het kale kurk, om draad te spannen"
        onPointerDown={(event) => {
          event.stopPropagation();
          onPinPointerDown(event);
        }}
      />

      {card.showImage ? (
        <div
          className="board-card-cover"
          onClick={onCoverClick}
          onDoubleClick={onCoverDoubleClick}
          title={
            refers && subject
              ? interactive
                ? `Dubbelklik om ${subject.kind === 'entry' ? `het ${words.entry}` : `de ${subject.noun}`} te openen`
                : undefined
              : isOwn && interactive
                ? 'Dubbelklik om op volledige grootte te bekijken'
                : undefined
          }
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl(image, zoomed ? 'full' : 'card')}
              alt={card.name || ''}
              style={coverStyle(imageCrop as CoverCrop | null)}
              draggable={false}
            />
          ) : (
            <Icon
              name={subject?.icon ?? (card.kind === 'entry' ? 'person' : card.kind === 'map' ? 'map' : card.kind === 'case' ? 'folder' : 'file')}
              size={34}
              style={{
                color: subject?.colour ?? 'var(--ink-muted)',
                opacity: 0.45,
              }}
            />
          )}
          {missing && <span className="stamp board-missing">Ontbreekt</span>}
          {cropping && <span className="board-crop-hint">Slepen &middot; scrollen om te zoomen</span>}
        </div>
      ) : (
        // With the frame off the pin still needs somewhere to sit.
        <div className="board-card-nocover">
          {missing && <span className="stamp board-missing-inline">Ontbreekt</span>}
        </div>
      )}

      <div className="board-card-body">
        <p
          className="board-card-name"
          onClick={(event) => {
            if (refers && subject && canOpenOnTap()) open(event);
          }}
          onDoubleClick={(event) => {
            if (refers && subject) open(event);
          }}
        >
          {card.name || 'Naamloos'}
        </p>

        {editing ? (
          <textarea
            ref={textRef}
            className="board-card-text-input"
            value={draft}
            rows={3}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              setEditing(false);
              if (draft !== card.text) onTextChange(draft);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setDraft(card.text);
                setEditing(false);
              }
            }}
          />
        ) : (
          <p
            className={`board-card-text${card.text ? '' : ' board-card-text-empty'}`}
            onDoubleClick={(event) => {
              event.stopPropagation();
              setEditing(true);
            }}
          >
            {card.text || (interactive ? 'Dubbelklik om te schrijven' : 'Dubbeltik om te schrijven')}
          </p>
        )}

        {/* An artikel card is what a wall is mostly made of, so it needs no
            label. A landkaart or a dossier among them does: two lines of type
            on a card are not enough to tell a place from a file. */}
        {subject && subject.kind !== 'entry' && (
          <span className="board-card-kind">
            <Icon name={subject.icon} size={11} />
            {subject.noun}
          </span>
        )}

        {card.kind === 'note' && (
          <button
            type="button"
            className="board-make-entry"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onConvertToEntry}
          >
            <Icon name="plus" size={12} />
            {capitalise(words.entry)} aanmaken
          </button>
        )}
      </div>
    </div>
  );
}
