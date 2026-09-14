'use client';

import { Icon } from '@/components/Icon';

/**
 * §69 — één zoomblok, op alle vier de plekken.
 *
 * Until this round each canvas drew its own: the prikbord and the stamboom had
 * text glyphs with a percentage beside them, the landkaart and the tijdlijn had
 * icon-only buttons with no number, the landkaart called its third button
 * "Passend maken" where everybody else said "Alles in beeld", two of the seven
 * buttons carried no `title`, and the stamboom's were 26×24 px against
 * everybody else's 34. The *place* was already the same on all four — the
 * toolbar row above the stage, right-aligned after the spacer — so this
 * component is only the block itself.
 *
 * What each surface still decides for itself is what the three buttons *do*
 * and what the number means (`percent`): board units on a prikbord and world
 * units on a stamboom, picture pixels on a landkaart, and pixels per unit of
 * the scale on a tijdlijn, where there is no "zoom 1" to be a hundred per
 * cent of.
 *
 * Two rules this markup exists to keep:
 *
 * - **§64**: the accessible name of a button never changes on a condition.
 *   The word beside the fit icon is hidden on a phone by CSS
 *   (`.canvas-tool-word`), exactly as the stamboom's toolbar does it; the
 *   `aria-label` and the `title` stay whatever the viewport is.
 * - **The block is not hidden on a phone.** The prikbord used to
 *   `display: none` its zoom buttons below 768 px, which left knijpen as the
 *   only way in or out and no way at all to reach "alles in beeld" by name.
 */
export default function CanvasZoomControls({
  percent,
  onOut,
  onIn,
  onFit,
  fitTestId,
  disabled = false,
}: {
  /** What the readout says, already in per cent. */
  percent: number;
  onOut: () => void;
  onIn: () => void;
  onFit: () => void;
  /** The one button specs reach for by id rather than by name. */
  fitTestId?: string;
  disabled?: boolean;
}) {
  return (
    <span className="canvas-zoom" role="group" aria-label="Zoomen">
      <button
        type="button"
        className="btn btn-small btn-ghost"
        onClick={onOut}
        aria-label="Uitzoomen"
        title="Uitzoomen"
        disabled={disabled}
      >
        <Icon name="zoomOut" size={16} />
      </button>
      <span className="canvas-zoom-level">{Math.round(percent)}%</span>
      <button
        type="button"
        className="btn btn-small btn-ghost"
        onClick={onIn}
        aria-label="Inzoomen"
        title="Inzoomen"
        disabled={disabled}
      >
        <Icon name="zoomIn" size={16} />
      </button>
      <button
        type="button"
        className="btn btn-small btn-ghost"
        onClick={onFit}
        aria-label="Alles in beeld"
        title="Alles in beeld"
        data-testid={fitTestId}
        disabled={disabled}
      >
        <Icon name="fit" size={16} />
        <span className="canvas-tool-word">Alles in beeld</span>
      </button>
    </span>
  );
}
