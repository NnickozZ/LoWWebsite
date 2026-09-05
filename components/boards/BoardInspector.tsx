'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { BORDER_OPTIONS } from '@/components/borders';
import { useUi } from '@/components/ui/UiProvider';
import { capitalise } from '@/lib/words';
import {
  STRING_COLOURS,
  STRING_COLOUR_KEYS,
  type BoardCard,
  type BoardString,
  type StringColour,
} from '@/lib/boards/merge';

/** What each stored colour key is called on screen. */
const COLOUR_NAMES: Record<StringColour, string> = {
  red: 'rood',
  ink: 'inkt',
  blue: 'blauw',
  green: 'groen',
  gold: 'goud',
  violet: 'paars',
};

/**
 * One bar for whatever is selected, docked to the bottom of the cork.
 *
 * A single place to look beats a kebab menu on every card plus a separate
 * popover for every string: the actions are the same either way, and on a phone
 * — where there is no dragging — selecting a card and reading one row is the
 * only way to reach them at all.
 */
export function BoardInspector({
  cards,
  string: line,
  cropping,
  busy,
  canCrop,
  hasOwnPhoto,
  inheritedBorderLabel,
  borderValue,
  onLabelChange,
  onColourChange,
  onRemoveString,
  onCrop,
  onDoneCropping,
  onAddPhoto,
  onRemovePhoto,
  onToggleImage,
  onBorderChange,
  onRename,
  onOpenEntry,
  onRemoveCards,
  onClose,
  canOpenEntry,
}: {
  /** The selected cards, if any. */
  cards: BoardCard[];
  /** The selected string, if any. Never both. */
  string: BoardString | null;
  cropping: boolean;
  busy: boolean;
  /** True when the card shows a picture that can be repositioned. */
  canCrop: boolean;
  /** True when the picture belongs to the card rather than to its entry. */
  hasOwnPhoto: boolean;
  /** What "from type" means for this card, e.g. "Map edge". Null for notes. */
  inheritedBorderLabel: string | null;
  /** The picker's current value: '' for "from type", else the border key. */
  borderValue: string;
  onLabelChange: (label: string) => void;
  onColourChange: (colour: StringColour) => void;
  onRemoveString: () => void;
  onCrop: () => void;
  onDoneCropping: () => void;
  onAddPhoto: () => void;
  onRemovePhoto: () => void;
  onToggleImage: () => void;
  onBorderChange: (border: string | null) => void;
  /** A pin's label — the only thing a pin has. */
  onRename: (name: string) => void;
  onOpenEntry: () => void;
  onRemoveCards: () => void;
  onClose: () => void;
  canOpenEntry: boolean;
}) {
  // §11: what a bare pin is called is the Keeper's to decide.
  const words = useUi().words;

  const [label, setLabel] = useState(line?.label ?? '');
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabel(line?.label ?? '');
  }, [line?.id, line?.label]);

  const pin = cards.length === 1 && cards[0].kind === 'pin' ? cards[0] : null;
  const [pinName, setPinName] = useState(pin?.name ?? '');
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPinName(pin?.name ?? '');
  }, [pin?.id, pin?.name]);

  if (!line && !cards.length) return null;

  /* ------------------------------------------------------------- a string */

  if (line) {
    return (
      <div className="board-inspector" role="group" aria-label="Geselecteerde draad">
        <span className="board-inspector-title">
          <Icon name="link" size={15} />
          Draad
        </span>

        <label className="visually-hidden" htmlFor="string-label">
          Bijschrift
        </label>
        <input
          id="string-label"
          ref={labelRef}
          className="input board-inspector-input"
          value={label}
          placeholder="samen gezien in de haven"
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => onLabelChange(label)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onLabelChange(label);
              labelRef.current?.blur();
            }
          }}
        />

        <span className="board-swatches" role="radiogroup" aria-label="Kleur van de draad">
          {STRING_COLOUR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={(line.colour ?? 'red') === key}
              aria-label={COLOUR_NAMES[key]}
              title={COLOUR_NAMES[key]}
              className={`board-swatch${(line.colour ?? 'red') === key ? ' board-swatch-on' : ''}`}
              style={{ background: STRING_COLOURS[key] }}
              onClick={() => onColourChange(key)}
            />
          ))}
        </span>

        <span className="small muted board-inspector-hint">Sleep een uiteinde om het te verplaatsen.</span>

        <button type="button" className="btn btn-small btn-danger" onClick={onRemoveString}>
          <Icon name="trash" size={14} />
          Verwijderen
        </button>

        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={onClose}
          aria-label="Selectie opheffen"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    );
  }

  /* ---------------------------------------------------------------- a pin */

  if (pin) {
    return (
      <div className="board-inspector" role="group" aria-label={`Geselecteerde ${words.pin}`}>
        <span className="board-inspector-title">
          <span className="board-pin board-pin-inline" aria-hidden="true" />
          {capitalise(words.pin)}
        </span>

        <label className="visually-hidden" htmlFor="pin-label">
          {`Label van de ${words.pin}`}
        </label>
        <input
          id="pin-label"
          ref={pinRef}
          className="input board-inspector-input"
          value={pinName}
          placeholder={`Geef de ${words.pin} een label (niet verplicht)`}
          onChange={(event) => setPinName(event.target.value)}
          onBlur={() => pinName !== pin.name && onRename(pinName)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onRename(pinName);
              pinRef.current?.blur();
            }
          }}
        />

        <span className="small muted board-inspector-hint">
          Sleep hem aan het label. Span draad vanaf de kop.
        </span>

        <button type="button" className="btn btn-small btn-danger" onClick={onRemoveCards}>
          <Icon name="trash" size={14} />
          Verwijderen
        </button>

        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={onClose}
          aria-label="Selectie opheffen"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    );
  }

  /* -------------------------------------------------------------- cards */

  const single = cards.length === 1 ? cards[0] : null;

  return (
    <div className="board-inspector" role="group" aria-label="Geselecteerde kaarten">
      <span className="board-inspector-title">
        <Icon name="board" size={15} />
        {single ? single.name || 'Kaart' : `${cards.length} kaarten`}
      </span>

      {cropping ? (
        <>
          <span className="small muted board-inspector-hint">
            Sleep de foto om hem te verschuiven, scroll of knijp om te zoomen. Deze uitsnede geldt
            alleen voor deze kaart.
          </span>
          <button type="button" className="btn btn-small btn-primary" onClick={onDoneCropping}>
            <Icon name="check" size={15} />
            Klaar
          </button>
        </>
      ) : (
        <>
          {canOpenEntry && (
            <button type="button" className="btn btn-small" onClick={onOpenEntry}>
              <Icon name="chevron" size={15} />
              {capitalise(words.entry)} openen
            </button>
          )}

          {single && (
            <>
              <span className="board-border-field">
                <label className="eyebrow" htmlFor="card-border">
                  Rand
                </label>
                <select
                  id="card-border"
                  className="board-border-select"
                  value={borderValue}
                  onChange={(event) => onBorderChange(event.target.value || null)}
                >
                  {inheritedBorderLabel && (
                    <option value="">Van soort ({inheritedBorderLabel})</option>
                  )}
                  {BORDER_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </span>

              <button type="button" className="btn btn-small" onClick={onToggleImage}>
                <Icon name="camera" size={15} />
                {single.showImage ? 'Foto verbergen' : 'Foto tonen'}
              </button>
            </>
          )}

          {single && single.kind !== 'entry' && (
            <button type="button" className="btn btn-small" onClick={onAddPhoto} disabled={busy}>
              <Icon name="plus" size={15} />
              {busy ? 'Uploaden…' : hasOwnPhoto ? 'Foto vervangen' : 'Foto toevoegen'}
            </button>
          )}

          {canCrop && (
            <button type="button" className="btn btn-small" onClick={onCrop}>
              Bijsnijden
            </button>
          )}

          {hasOwnPhoto && (
            <button type="button" className="btn btn-small btn-ghost" onClick={onRemovePhoto}>
              Foto verwijderen
            </button>
          )}

          <button type="button" className="btn btn-small btn-danger" onClick={onRemoveCards}>
            <Icon name="trash" size={14} />
            {cards.length > 1 ? `${cards.length} verwijderen` : 'Kaart verwijderen'}
          </button>
        </>
      )}

      <button
        type="button"
        className="btn btn-small btn-ghost"
        onClick={onClose}
        aria-label="Selectie opheffen"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
