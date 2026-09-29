'use client';

import { Icon } from '@/components/Icon';
import { useCanvasMaker } from '@/components/canvas/useCanvasAuthorGate';

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
  /*
   * §101: taking something back is a write, so it owes §18b's question — and
   * it owes it *before* it undoes, like every other maker on a canvas bar. The
   * bars carry `AUTHOR_GATE_OFF` since this round, so without this the button
   * would quietly write with nobody's name on it.
   */
  const maker = useCanvasMaker();
  return (
    <button
      type="button"
      className="btn btn-small btn-ghost canvas-undo"
      {...maker(onUndo)}
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
