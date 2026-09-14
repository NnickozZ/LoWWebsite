'use client';

import { InkCapture, InkToolbar } from './InkTools';
import type { CanvasInk } from './useCanvasInk';

/**
 * §33/§67: the capture sheet and the toolbar, in the one order that works.
 *
 * The sheet comes **first** in the DOM and the toolbar after it, so that the
 * toolbar — which is a z-index above the sheet — is also painted after it and
 * really is on top of it. A canvas that rendered the toolbar first (the
 * stamboom did) and gave it a z-index below `.ink-capture` (the stamboom did
 * that too, in its own stylesheet) had a toolbar you could see and could not
 * press: with the pencil out, every press on the gum, on undo, on the pencil
 * itself landed on the sheet and drew a stroke.
 *
 * So neither is the canvas's business any more. The order is here, and the
 * corner is a word — the classes `.ink-toolbar-bottom` and `.ink-toolbar-board`
 * live in `app/globals.css` beside the base rule, and a canvas never positions
 * `.ink-toolbar` in a stylesheet of its own.
 *
 * The layer itself (`InkCanvas`) is *not* here: where it sits differs per
 * place — under the cork's cards, over a landkaart's picture and under its
 * spelden, under a stamboom's world — and that is a real difference, not a
 * copy. `shell.layerProps` carries what it needs.
 */

export type InkCorner = 'top-left' | 'bottom-left' | 'bottom-right';

const CORNER: Record<InkCorner, string | undefined> = {
  /* The base rule's own corner (a tijdlijn). */
  'top-left': undefined,
  /* A landkaart: the legend has the top-left. */
  'bottom-left': 'ink-toolbar-bottom',
  /* A prikbord and a stamboom: every other corner is taken. */
  'bottom-right': 'ink-toolbar-board',
};

export function InkShell({
  shell,
  corner,
  toolbar = true,
}: {
  shell: CanvasInk;
  corner: InkCorner;
  /** False while something else on the glass is asking for the same hand (a landkaart placing a speld). */
  toolbar?: boolean;
}) {
  return (
    <>
      {shell.inkActive && <InkCapture {...shell.captureProps} />}
      {shell.ink.enabled && toolbar && <InkToolbar className={CORNER[corner]} {...shell.toolbarProps} />}
    </>
  );
}
