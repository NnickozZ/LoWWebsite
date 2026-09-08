'use client';

import { useEffect, useRef, useState } from 'react';
import { assetUrl, coverClass, coverStyle } from '@/components/Cover';
import { borderClass } from '@/components/borders';
import { Icon } from '@/components/Icon';
import { MentionPopover, MentionRow, MentionText } from '@/components/ui/MentionPopover';
import { useUi } from '@/components/ui/UiProvider';
import { capitalise } from '@/lib/words';
import {
  CARD_SIZE,
  cardRef,
  PIN_TAG_MAX_WIDTH,
  pinSize,
  type BoardCard as BoardCardModel,
} from '@/lib/boards/merge';
import type { BoardRefs } from '@/lib/boards/service';
import type { CoverCrops } from '@/lib/images/shapes';

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
  kind: 'entry' | 'map' | 'case' | 'timeline' | 'board';
  name: string;
  /** Where a double-click goes. */
  href: string;
  assetId: string | null;
  /** The thing's own three crops (round 19); the card draws the staand one. */
  crop: CoverCrops | null;
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
      crop: (entry.coverCrop as CoverCrops | null) ?? null,
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
      // A landkaart has no crops; the card draws it centred.
      crop: null,
      icon: 'map',
      colour: 'var(--ink-muted)',
      // "Kaartrand" — the dashed edge of a printed map, which is what it is.
      border: 'dashed',
      noun: 'landkaart',
    };
  }

  if (ref.kind === 'timeline') {
    const timeline = refs.timelines?.[ref.id];
    if (!timeline) return undefined;
    return {
      kind: 'timeline',
      name: timeline.name,
      href: `/timelines/${timeline.slug}`,
      // A tijdlijn has no picture; its frame, when opened, shows the clock.
      assetId: null,
      crop: null,
      icon: 'timeline',
      colour: 'var(--ink-muted)',
      border: 'dashed',
      noun: 'tijdlijn',
    };
  }

  if (ref.kind === 'board') {
    // §52: a wall on a wall. The thinnest subject of the five — a prikbord has
    // no slug (its address is its id) and no cover, so the frame stays shut and
    // the pin's icon stands for it.
    const other = refs.boards?.[ref.id];
    if (!other) return undefined;
    return {
      kind: 'board',
      name: other.name,
      href: `/b/${other.id}`,
      assetId: null,
      crop: null,
      icon: 'board',
      colour: 'var(--ink-muted)',
      // The same dashed edge a landkaart and a tijdlijn wear: this card is a
      // door to somewhere else, not a piece of paper about a thing.
      border: 'dashed',
      noun: 'prikbord',
    };
  }

  const item = refs.cases[ref.id];
  if (!item) return undefined;
  return {
    kind: 'case',
    name: item.name,
    href: `/c/${item.slug}`,
    assetId: item.assetId,
    crop: (item.crop as CoverCrops | null) ?? null,
    icon: 'folder',
    colour: 'var(--ink-muted)',
    // "Vergeeld" — the yellowed paper of a file that has been in a drawer.
    border: 'inset',
    noun: 'dossier',
  };
}

/**
 * What picture a card shows and how it is framed. A card's own photo wins,
 * drawn centred; a card that stands for something otherwise borrows that
 * thing's picture — an artikel's cover, a dossier's cover, the landkaart
 * itself — with that thing's own crops (round 19), so the face on this wall is
 * the face on every other list.
 */
export function cardImage(card: BoardCardModel, subject?: CardSubject) {
  const own = card.assetId ?? null;
  const assetId = own ?? subject?.assetId ?? null;
  const crop: CoverCrops | null = own ? null : (subject?.crop ?? null);
  return { assetId, crop, isOwn: Boolean(own) };
}

/**
 * The border this card draws: its own override, else the one its subject wears,
 * else what the card *is* — a pinned photograph gets a print's white margin, a
 * bare note gets a hairline.
 *
 * "Is a photograph" is now *has a picture of its own*, not `kind === 'photo'`:
 * a pasted picture makes a notitie carrying an `assetId` (see `uploadPhoto` in
 * `BoardCanvas`), and it should look exactly like the print it looked like
 * before. The old kind is still asked after so that a `photo` card whose
 * picture was taken away keeps the frame it was hung with.
 */
export function cardBorder(card: BoardCardModel, subject?: CardSubject): string {
  return card.border ?? subject?.border ?? (card.kind === 'photo' || card.assetId ? 'solid' : 'plain');
}

/**
 * One index card. The picture frame is a uniform staand 3:4 whatever is in it
 * — the entry's cover, a picture pinned to this card, or a placeholder — so a
 * board reads as one wall of cards rather than a collage. The frame can be
 * switched off entirely, leaving a plain slip of paper.
 */
export function BoardCardView({
  card,
  subject,
  selected,
  interactive,
  canOpenOnTap,
  onPointerDown,
  onPinPointerDown,
  onTextChange,
  onOpen,
  onViewFull,
  onConvertToEntry,
  canMakeEntry,
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
  /** §47: false on a wall this viewer may only look at — the card offers no road. */
  canMakeEntry: boolean;
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
  const refers =
    card.kind === 'entry' ||
    card.kind === 'map' ||
    card.kind === 'case' ||
    card.kind === 'timeline' ||
    // §52: and a prikbord, which is a card like the other four.
    card.kind === 'board';
  const missing = refers && !subject;
  const { assetId: image, crop: imageCrop, isOwn } = cardImage(card, subject);
  const zoomed = (imageCrop?.portrait?.zoom ?? 1) > 1.05;
  /**
   * Belt and braces on the rule `defaultShowImage` sets: a frame with nothing
   * in it is never drawn, whatever the flag says. `showImage` is what the card
   * *wants*; this is whether there is anything to put there.
   *
   * Something means a picture — the card's own, or the one it borrows from
   * what it stands for — or, failing that, a subject, whose soort icon and
   * colour is what the frame has always shown while an artikel waits for a
   * cover. A notitie has neither, and that is the case this guard is for: a
   * grey box above the words on every note ever written. A card that stands
   * for something the viewer may not see has neither either, and says so on a
   * plain slip with the MISSING stamp instead of framing an empty rectangle.
   *
   * Deciding it here rather than only at creation is what repairs the walls
   * that were hung before the default changed. The saved flag is left exactly
   * as it is, so a picture added later still turns the frame on.
   */
  const framed = card.showImage && (Boolean(image) || Boolean(subject));

  if (card.kind === 'pin') {
    // A bare pin: a head to run string from, and a paper tag to drag it by and
    // label it. No border, no picture, no body — it is a place, not a card.
    return (
      <div
        className={`board-card board-pincard${selected ? ' board-card-selected' : ''}${carried ? ' board-card-carried' : ''}`}
        style={{
          left: card.x,
          top: card.y,
          /*
           * The tag's box, from the label — `pinSize` is the same function
           * `cardSize` and `cardBox` measure this pin with, so what is painted
           * and what the geometry believes are one answer rather than two. A
           * label that already fitted gets exactly `PIN_SIZE.width` back.
           */
          width: pinSize(card).width,
          maxWidth: PIN_TAG_MAX_WIDTH,
          /*
           * A pin has never carried a transform — its rotation is 0 by
           * construction — and one on this box would put the head into a
           * stacking context of its own, which changes what a pin paints over.
           * So it appears only when there is a size to apply, and a pin at 100%
           * is exactly the pin that was here before.
           */
          transform:
            card.scale === 1 ? undefined : `rotate(${card.rotation}deg) scale(${card.scale})`,
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
        carried ? 'board-card-carried' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: card.x,
        top: card.y,
        width: CARD_WIDTH,
        /*
         * A card is a piece of paper of a fixed size, whether or not there is a
         * picture on it. `CARD_SIZE` is not decoration: `freeSpotNear` reserves
         * that much room, `headOf` ties string to it and the merge rule measures
         * with it — so a card that renders shorter than the model says leaves the
         * wall with gaps the geometry does not know about, and its middle drifts
         * up out of the place everything else thinks it is. That was invisible
         * while every card carried a frame; a notitie with the frame off made it
         * visible at once (a card on a phone whose centre landed above the cork
         * entirely). The floor is here rather than in `.board-card` because this
         * is where the width already comes from, and the two belong together.
         */
        minHeight: CARD_SIZE.height,
        /*
         * §41: the size is a second factor on the transform the tilt already uses,
         * about the default centre origin — so a card that is made bigger grows
         * evenly out of where it stands rather than walking off to the right,
         * and a card at 100% does not move at all. Everything on the paper — the
         * picture, the title, the words — grows with it, which is Nick's
         * decision: a card zooms like a photograph rather than reflowing.
         *
         * `.board-world` already carries `scale(viewport.zoom)`, and nested
         * transforms multiply, so this is measured in board units and needs to
         * know nothing about the zoom.
         *
         * The 1px rule and the drop shadow are multiplied by it as well, so a
         * card at 500% wears a 5px rule. That is deliberate and left alone: it
         * is what the wall's own zoom has always done to a card's border, so a
         * card at 200% looks like the same card seen at 200% zoom, and a
         * magnified photograph magnifies its frame with it.
         */
        transform: `rotate(${card.rotation}deg) scale(${card.scale})`,
        cursor: interactive ? 'grab' : 'pointer',
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

      {framed ? (
        <div
          className={`board-card-cover ${coverClass('portrait')}`}
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
              /*
               * The 'card' variant is about 400 px wide, which is plenty for a
               * 160 px frame and not nearly enough for one drawn at 300%: the
               * picture goes visibly soft exactly when somebody has decided this
               * card is the point of the wall. So a card made half again as big
               * asks for the full file, the same as a cropped-in one does.
               */
              src={assetUrl(image, zoomed || card.scale > 1.5 ? 'full' : 'card')}
              alt={(refers && subject ? subject.name : card.name) || ''}
              style={coverStyle(imageCrop, 'portrait')}
              draggable={false}
            />
          ) : (
            /* No picture yet, but something to stand for: its soort's icon in
               its soort's colour, which is the frame doing its other job. */
            <Icon
              name={subject?.icon ?? 'file'}
              size={34}
              style={{ color: subject?.colour ?? 'var(--ink-muted)', opacity: 0.45 }}
            />
          )}
          {missing && <span className="stamp board-missing">Ontbreekt</span>}
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
          {/*
            §52: the live name, not the one copied onto the card when it was
            pinned. Renaming an artikel used to leave every wall it hangs on
            saying the old thing for ever — the name was resolved per read all
            along and simply not drawn. `card.name` stays the fallback on
            purpose: a card whose artikel is gone keeps the name it was pinned
            under, which is what "opnieuw aanmaken" below writes the new one
            with, and a notitie, a foto and a speld own that field themselves.
          */}
          {(refers && subject ? subject.name : card.name) || 'Naamloos'}
        </p>

        {editing ? (
          <>
          <textarea
            ref={textRef}
            className="board-card-text-input"
            value={draft}
            rows={3}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => {
              // A tap on a name in the @-list takes focus for a moment; the
              // popover hands it straight back, and the writing goes on.
              if ((event.relatedTarget as HTMLElement | null)?.closest?.('.mention-pop')) return;
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
          {/* Round 18: `@` offers a name; `[[Naam]]` is what lands in the text. */}
          <MentionPopover forRef={textRef} />
          {/* §54: a chip cannot live inside a box you are typing in, so it
              stands under it — the eighth and last plain box to get one. */}
          <MentionRow text={draft} />
          </>
        ) : (
          <p
            className={`board-card-text${card.text ? '' : ' board-card-text-empty'}`}
            onDoubleClick={(event) => {
              event.stopPropagation();
              setEditing(true);
            }}
          >
            {card.text ? <MentionText text={card.text} /> : interactive ? 'Dubbelklik om te schrijven' : 'Dubbeltik om te schrijven'}
          </p>
        )}

        {/* An artikel card is what a wall is mostly made of, so it needs no
            label. A landkaart or a dossier among them does: two lines of type
            on a card are not enough to tell a place from a file. */}
        {subject && subject.kind !== 'entry' && (
          <span className="board-card-kind">
            <Icon name={subject.icon} size={11} />
            {/* §52: the prikbord is a word the Keeper may rename, so it comes
                from `words` rather than from the pure resolver's noun. */}
            {subject.kind === 'board' ? words.board : subject.noun}
          </span>
        )}

        {/* A slip of paper that stands for nothing yet is the one that can
            become something. `photo` is here for the walls hung before a
            pasted picture became a notitie: those cards were the only ones
            with no way off the wall, and this is the way. */}
        {/* §47: and a card whose artikel is not there — deleted, or out of
            reach — is the other one. It keeps the name it was pinned under, so
            the road back is the same road: write the artikel from the card and
            let the card point at it. */}
        {canMakeEntry && (card.kind === 'note' || card.kind === 'photo' || (missing && card.kind === 'entry')) && (
          <button
            type="button"
            className="board-make-entry"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onConvertToEntry}
          >
            <Icon name="plus" size={12} />
            {capitalise(words.entry)} {missing ? 'opnieuw aanmaken' : 'aanmaken'}
          </button>
        )}
      </div>
    </div>
  );
}
