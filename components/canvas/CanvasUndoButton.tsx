'use client';

import { Icon } from '@/components/Icon';

/**
 * §69 — één ongedaan-knop, op alle vier de plekken.
 *
 * The four disagreed here as thoroughly as they did about the camera. The
 * prikbord and the stamboom had a button, each with its own markup; the
 * prikbord's carried no icon and no `aria-label`, so on a phone, where the word
 * is hidden, it was a blank square. The landkaart and the tijdlijn had **no
 * undo at all** — the last row of the contract's "Ongedaan" block that still
 * read TOEVAL rather than BEWUST.
 *
 * Two rules this markup exists to keep, the same two `CanvasZoomControls` keeps:
 *
 * - **§64**: the accessible name never changes on a condition. The word is
 *   hidden below 768 px by `.canvas-tool-word`; the `aria-label` and the
 *   `title` stay whatever the viewport is, and the `title` names the keystroke
 *   because that is the faster road once you know it.
 * - **Grey when there is nothing to take back.** A button that is always
 *   pressable and sometimes does nothing teaches people not to trust it — and
 *   it is what all four did before this round, because none of them told the
 *   toolbar how deep the stack was.
 */
export default function CanvasUndoButton({
  onUndo,
  canUndo,
  title = 'Ongedaan maken (Ctrl+Z)',
  testId,
}: {
  onUndo: () => void;
  /** False when the stack is empty — the button goes grey rather than lying. */
  canUndo: boolean;
  /** For a surface whose keystroke is worth naming differently. */
  title?: string;
  /** The stamboom's specs reach for this one by id; the others go by name. */
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="btn btn-small btn-ghost"
      onClick={onUndo}
      disabled={!canUndo}
      aria-label="Ongedaan maken"
      title={title}
      data-testid={testId}
    >
      <Icon name="undo" size={16} />
      <span className="canvas-tool-word">Ongedaan maken</span>
    </button>
  );
}
