'use client';

import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useUi } from '@/components/ui/UiProvider';
import type { InkFormat, InkKind, InkLayerView } from '@/lib/ink/types';
import type { Project, WidthScale } from './InkCanvas';
import { InkCapture, InkKeeperControls, InkToolbar, useInkTool } from './InkTools';
import { useInk, type DisplayStroke, type InkHandle } from './useInk';

/**
 * §33/§67: one tekenlaag, wired up once.
 *
 * A prikbord, a landkaart, a tijdlijn and a stamboom all hang the same layer
 * on the same three pieces (`useInk`, `useInkTool`, `InkCapture` +
 * `InkToolbar`), and until this round each of the four wired them up in its
 * own file: the same twenty lines of hook, the same effect that shuts the
 * toolbar when a Keeper turns the switch off, the same two keys, the same
 * confirm dialog with a different noun in it. Four copies is four chances to
 * get one of them wrong, and the stamboom got two of them wrong at once — its
 * toolbar was rendered *before* the capture sheet and positioned by a rule of
 * its own with a z-index under it, so with the pencil out every press on the
 * gum drew a line instead.
 *
 * So the wiring lives here, and what stays in a canvas is only what really is
 * that canvas's own: where the layer sits in its DOM, what it lets go of when
 * the pencil comes out, and which corner the toolbar stands in — the last of
 * which is `InkShell`'s `corner`, never a rule in the canvas's own stylesheet.
 */

export type CanvasInkOptions = {
  kind: InkKind;
  id: string;
  initial: InkLayerView;
  /** The space *new* strokes are written in. Left out is v0 (see `useInk`). */
  format?: InkFormat;
  /** A content point onto the glass, for the layer. */
  project: Project;
  /** A point of the screen in the content's own units, for the hand. */
  toContent: (clientX: number, clientY: number) => { x: number; y: number };
  /** What the brush's screen width is divided by for a *new* stroke. */
  widthScale: number;
  /**
   * What the strokes already on the layer are drawn by, when that is not the
   * same answer for all of them — a tijdlijn carries two spaces at once.
   * Defaults to `widthScale`.
   */
  layerWidthScale?: WidthScale;
  /** "dit prikbord", "deze landkaart", "deze tijdlijn", "deze stamboom". */
  noun: string;
  /** A refusal from the server, in words for a toast. Defaults to `ui.toast`. */
  onError?: (message: string) => void;
  /** What this canvas lets go of when the pencil comes out (a selection, a menu). */
  onOpen?: () => void;
  /** True where the stage underneath would otherwise start its own gesture on the same pointer. */
  stopPropagation?: boolean;
};

export type CanvasInk = {
  ink: InkHandle;
  inkTool: ReturnType<typeof useInkTool>;
  /** The pencil is out *and* the layer is open: the capture sheet is up. */
  inkActive: boolean;
  /** A stroke is under the hand right now. */
  inkDrawing: boolean;
  /** The same thing, in the name a canvas folds into its own `busy` (§59). */
  busy: boolean;
  /** Everything `InkCanvas` needs but the four things only the canvas knows. */
  layerProps: { strokes: DisplayStroke[]; stableCount: number; project: Project; widthScale: WidthScale };
  captureProps: ComponentProps<typeof InkCapture>;
  toolbarProps: Omit<ComponentProps<typeof InkToolbar>, 'className'>;
  /**
   * The two keys the tekenmodus owns: Escape puts the pencil away, Ctrl/Cmd+Z
   * lifts your own last streek. True means it was this that answered, so the
   * canvas's own handler stops there. The typing guard is the canvas's, not
   * this one's — where in its own chain of keys the ink comes is its business.
   */
  onKeyDown: (event: KeyboardEvent | React.KeyboardEvent) => boolean;
  /** The Keeper's switch and wipe, confirm dialog and all. */
  keeperControls: ReactNode;
};

export function useCanvasInk({
  kind,
  id,
  initial,
  format,
  project,
  toContent,
  widthScale,
  layerWidthScale,
  noun,
  onError,
  onOpen,
  stopPropagation,
}: CanvasInkOptions): CanvasInk {
  const ui = useUi();
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const ink = useInk({
    kind,
    id,
    initial,
    format,
    onError: (message) => (onErrorRef.current ? onErrorRef.current(message) : uiRef.current.toast(message)),
  });
  const inkTool = useInkTool();
  const inkActive = inkTool.active && ink.enabled;
  const [inkDrawing, setInkDrawing] = useState(false);

  // The switch turned off under an open toolbar closes it.
  const enabled = ink.enabled;
  useEffect(() => {
    if (!enabled && inkTool.active) inkTool.setActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  /* ------------------------------------------------------------ the keys */

  const activeRef = useRef(inkTool.active);
  activeRef.current = inkTool.active;
  const inkActiveRef = useRef(inkActive);
  inkActiveRef.current = inkActive;
  const setActiveRef = useRef(inkTool.setActive);
  setActiveRef.current = inkTool.setActive;
  const undoRef = useRef(ink.undo);
  undoRef.current = ink.undo;

  const onKeyDown = useCallback((event: KeyboardEvent | React.KeyboardEvent): boolean => {
    if (event.key === 'Escape') {
      if (!activeRef.current) return false;
      setActiveRef.current(false);
      return true;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      if (!inkActiveRef.current) return false;
      event.preventDefault();
      undoRef.current();
      return true;
    }
    return false;
  }, []);

  /* -------------------------------------------------------- what to render */

  const keeperControls = (
    <InkKeeperControls
      enabled={ink.enabled}
      strokeCount={ink.layer.strokes.length}
      noun={noun}
      onSetEnabled={(next) => void ink.keeper({ enabled: next })}
      onClear={() =>
        void ui
          .confirm({
            title: 'Tekenlaag wissen?',
            message: `Alle streken op ${noun} gaan weg, voor iedereen. Dit is niet terug te draaien.`,
            confirmLabel: 'Wissen',
            danger: true,
          })
          .then((yes) => yes && ink.keeper({ clear: true }))
      }
    />
  );

  return {
    ink,
    inkTool,
    inkActive,
    inkDrawing,
    busy: inkDrawing,
    layerProps: {
      strokes: ink.strokes,
      stableCount: ink.stableCount,
      project,
      widthScale: layerWidthScale ?? widthScale,
    },
    captureProps: {
      tool: inkTool.tool,
      toContent,
      widthScale,
      onBegin: (...args) => {
        setInkDrawing(true);
        return ink.begin(...args);
      },
      onExtend: ink.extend,
      onEnd: () => {
        setInkDrawing(false);
        return ink.end();
      },
      onAbort: () => {
        setInkDrawing(false);
        return ink.abort();
      },
      stopPropagation,
    },
    toolbarProps: {
      active: inkTool.active,
      tool: inkTool.tool,
      onActive: (next: boolean) => {
        inkTool.setActive(next);
        if (next) onOpenRef.current?.();
      },
      onTool: inkTool.setTool,
      canUndo: ink.canUndo,
      onUndo: ink.undo,
      saving: ink.saving,
    },
    onKeyDown,
    keeperControls,
  };
}
