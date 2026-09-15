'use client';

import { InkCapture, InkToolbar } from './InkTools';
import { useIsPhone } from '@/components/useIsPhone';
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

/**
 * §69 (6.5) — op een telefoon staat de inktbalk overal in dezelfde hoek.
 *
 * De vier hoeken zijn op een bureau met reden verschillend: elke hoek die al
 * bezet was, was door iets anders bezet — de legenda linksboven op een
 * landkaart, de handgrepen rechtsonder op een stamboom. Op 390 px is dat
 * argument weg, want alles wat daar met de balk vocht is sinds deze ronde een
 * blad dat van onderen opkomt (§69 6.4) of staat er niet.
 *
 * Wat overblijft is dat een lezer die tussen twee tekenvlakken heen en weer
 * gaat het potlood twee keer ergens anders moet zoeken. Dus: één hoek, en de
 * keuze staat **hier** — in het onderdeel dat de balk plaatst — en niet in een
 * mediaregel in de stylesheet, want dan zouden er weer twee plekken zijn die
 * het moeten weten.
 *
 * Linksonder, omdat dat de enige hoek is die op alle vier vrij is: rechtsonder
 * staat op een telefoon de zwevende `+` van de schil.
 */
const PHONE_CORNER: InkCorner = 'bottom-left';

/**
 * ...tenzij de onderrand van dát glas op dat moment bezet is.
 *
 * Een tijdlijn legt zijn vensters op een telefoon in een lade onderaan (§69
 * 6.4), en die lade is er alleen zolang er iets openstaat. Twee dingen die
 * allebei de onderrand willen is geen hoekenkeuze maar een tijdelijke botsing,
 * dus wordt hij tijdelijk opgelost: de balk gaat naar boven zolang de lade er
 * ligt. Het canvas zegt *dát* de rand bezet is (`bottomTaken`) en niet wélke
 * hoek de balk dan moet krijgen — die beslissing hoort hier, op één plek, en
 * niet in een mediaregel per tekenvlak (§67: een canvas plaatst `.ink-toolbar`
 * nooit in zijn eigen stylesheet).
 */
const PHONE_FALLBACK: InkCorner = 'top-left';

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
  bottomTaken = false,
}: {
  shell: CanvasInk;
  corner: InkCorner;
  /** False while something else on the glass is asking for the same hand (a landkaart placing a speld). */
  toolbar?: boolean;
  /** True while something is docked along the bottom of this glass right now. */
  bottomTaken?: boolean;
}) {
  const isPhone = useIsPhone();
  const where = isPhone ? (bottomTaken ? PHONE_FALLBACK : PHONE_CORNER) : corner;
  return (
    <>
      {shell.inkActive && <InkCapture {...shell.captureProps} />}
      {shell.ink.enabled && toolbar && <InkToolbar className={CORNER[where]} {...shell.toolbarProps} />}
    </>
  );
}
