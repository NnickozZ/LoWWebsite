'use client';

import { useEffect, useRef, useState } from 'react';
import { assetUrl, coverStyle } from '@/components/Cover';
import { borderClass } from '@/components/borders';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { capitalise } from '@/lib/words';
import { PIN_SIZE, type BoardCard as BoardCardModel, type CardCrop } from '@/lib/boards/merge';
import type { BoardEntryFacts } from '@/lib/boards/service';
import type { CoverCrop } from '@/lib/db/schema';

export const CARD_WIDTH = 160;

/**
 * What picture a card shows and how it is framed. A card's own photo wins; an
 * entry card otherwise borrows the entry's cover. Either way the crop is the
 * *card's* when it has one, so tightening a face on this board leaves every
 * other list alone.
 */
export function cardImage(card: BoardCardModel, entry?: BoardEntryFacts) {
  const own = card.assetId ?? null;
  const assetId = own ?? (card.kind === 'entry' ? (entry?.coverAssetId ?? null) : null);
  const crop: CardCrop | CoverCrop | null =
    card.crop ?? (own ? null : ((entry?.coverCrop as CoverCrop | null) ?? null));
  return { assetId, crop, isOwn: Boolean(own) };
}

/**
 * The border this card draws: its own override, else its entry type's, else
 * what the card *is* — a pinned photograph gets a print's white margin, a bare
 * note gets a hairline.
 */
export function cardBorder(card: BoardCardModel, entry?: BoardEntryFacts): string {
  return card.border ?? entry?.typeBorder ?? (card.kind === 'photo' ? 'solid' : 'plain');
}

/**
 * One index card. The picture frame is a uniform 3:4 whatever is in it — the
 * entry's cover, a picture pinned to this card, or a placeholder — so a board
 * reads as one wall of cards rather than a collage. The frame can be switched
 * off entirely, leaving a plain slip of paper.
 */
export function BoardCardView({
  card,
  entry,
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
  entry?: BoardEntryFacts;
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

  const isEntryCard = card.kind === 'entry';
  const missing = isEntryCard && !entry;
  const { assetId: image, crop: imageCrop, isOwn } = cardImage(card, entry);
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

  /** An entry card opens the entry; a picture opens full size. */
  function open(event: React.MouseEvent) {
    if (cropping) return;
    event.stopPropagation();
    if (isEntryCard && entry) onOpen();
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
        borderClass(cardBorder(card, entry)),
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
            isEntryCard && entry
              ? interactive
                ? `Dubbelklik om het ${words.entry} te openen`
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
              name={entry?.typeIcon ?? (isEntryCard ? 'person' : 'file')}
              size={34}
              style={{
                color: entry?.typeColour ?? 'var(--ink-muted)',
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
            if (isEntryCard && entry && canOpenOnTap()) open(event);
          }}
          onDoubleClick={(event) => {
            if (isEntryCard && entry) open(event);
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
