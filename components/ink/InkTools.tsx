'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { INK_BRUSHES, INK_COLOUR_NAMES, INK_COLOURS, INK_ERASER_WIDTH, type InkMode } from '@/lib/ink/types';
import type { InkTool } from './useInk';
import { MIN_STEP_PX } from './useInk';

/**
 * §33: the toolbar and the hand.
 *
 * `InkToolbar` floats in a corner of the stage: a potlood that switches the
 * tekenmodus on, and — while it is on — the eight colours, the three brushes,
 * the gum and an undo button (for a phone, where there is no Ctrl+Z).
 *
 * `InkCapture` is the transparent sheet laid over the stage while the
 * tekenmodus is on. It takes the pointer so the cards, spelden and
 * gebeurtenissen underneath get nothing — dragging draws now — and hands
 * every point to the hook in the place's own coordinates. Escape, or the
 * potlood again, takes it away.
 */

const TOOL_KEY = 'ink-tool';

const DEFAULT_TOOL: InkTool = { mode: 'ink', colour: 2, brush: 1 };

function readTool(): InkTool {
  try {
    const raw = window.localStorage.getItem(TOOL_KEY);
    if (!raw) return DEFAULT_TOOL;
    const parsed = JSON.parse(raw) as Partial<InkTool>;
    return {
      mode: 'ink',
      colour: typeof parsed.colour === 'number' && parsed.colour >= 0 && parsed.colour < INK_COLOURS.length ? parsed.colour : DEFAULT_TOOL.colour,
      brush: typeof parsed.brush === 'number' && parsed.brush >= 0 && parsed.brush < INK_BRUSHES.length ? parsed.brush : DEFAULT_TOOL.brush,
    };
  } catch {
    return DEFAULT_TOOL;
  }
}

/** The tool, remembered across pages: the colour you had is the colour you get. */
export function useInkTool() {
  const [tool, setToolState] = useState<InkTool>(DEFAULT_TOOL);
  const [active, setActive] = useState(false);
  useEffect(() => {
    setToolState(readTool());
  }, []);
  const setTool = useCallback((patch: Partial<InkTool>) => {
    setToolState((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(TOOL_KEY, JSON.stringify({ colour: next.colour, brush: next.brush }));
      } catch {
        /* a browser without storage still draws */
      }
      return next;
    });
  }, []);
  return { tool, setTool, active, setActive };
}

export function InkToolbar({
  active,
  tool,
  onActive,
  onTool,
  canUndo,
  onUndo,
  saving,
  className,
}: {
  active: boolean;
  tool: InkTool;
  onActive: (active: boolean) => void;
  onTool: (patch: Partial<InkTool>) => void;
  canUndo: boolean;
  onUndo: () => void;
  saving?: boolean;
  className?: string;
}) {
  const pick = (mode: InkMode) => onTool({ mode });
  return (
    <div
      className={`ink-toolbar${active ? ' ink-toolbar-open' : ''}${className ? ` ${className}` : ''}`}
      role="toolbar"
      aria-label="Tekenen"
      data-testid="ink-toolbar"
      // What happens in the toolbar is not a pan, a drag or a stroke.
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={`ink-tool ink-tool-pen${active ? ' ink-tool-on' : ''}`}
        aria-pressed={active}
        title={active ? 'Tekenen uit (Esc)' : 'Tekenen'}
        aria-label={active ? 'Tekenen uit' : 'Tekenen'}
        onClick={() => onActive(!active)}
        data-testid="ink-pen"
      >
        <Icon name="pencil" size={18} />
      </button>

      {active && (
        <>
          <span className="ink-sep" aria-hidden="true" />
          <span className="ink-colours" role="radiogroup" aria-label="Kleur">
            {INK_COLOURS.map((colour, index) => (
              <button
                key={colour}
                type="button"
                role="radio"
                aria-checked={tool.mode === 'ink' && tool.colour === index}
                className={`ink-colour${tool.mode === 'ink' && tool.colour === index ? ' ink-colour-on' : ''}`}
                style={{ ['--ink' as string]: colour }}
                title={INK_COLOUR_NAMES[index]}
                aria-label={INK_COLOUR_NAMES[index]}
                onClick={() => onTool({ mode: 'ink', colour: index })}
                data-testid={`ink-colour-${index}`}
              />
            ))}
          </span>
          <span className="ink-sep" aria-hidden="true" />
          <span className="ink-brushes" role="radiogroup" aria-label="Dikte">
            {INK_BRUSHES.map((px, index) => (
              <button
                key={px}
                type="button"
                role="radio"
                aria-checked={tool.mode === 'ink' && tool.brush === index}
                className={`ink-brush${tool.mode === 'ink' && tool.brush === index ? ' ink-brush-on' : ''}`}
                title={['Dun', 'Normaal', 'Dik'][index]}
                aria-label={['Dun', 'Normaal', 'Dik'][index]}
                onClick={() => onTool({ mode: 'ink', brush: index })}
                data-testid={`ink-brush-${index}`}
              >
                <span className="ink-brush-dot" style={{ width: px + 2, height: px + 2 }} />
              </button>
            ))}
          </span>
          <span className="ink-sep" aria-hidden="true" />
          <button
            type="button"
            className={`ink-tool${tool.mode === 'erase' ? ' ink-tool-on' : ''}`}
            aria-pressed={tool.mode === 'erase'}
            title="Gum"
            aria-label="Gum"
            onClick={() => pick(tool.mode === 'erase' ? 'ink' : 'erase')}
            data-testid="ink-eraser"
          >
            <Icon name="eraser" size={18} />
          </button>
          <button
            type="button"
            className="ink-tool"
            disabled={!canUndo}
            title="Laatste streek ongedaan maken (Ctrl+Z)"
            aria-label="Laatste streek ongedaan maken"
            onClick={onUndo}
            data-testid="ink-undo"
          >
            <Icon name="undo" size={18} />
          </button>
          {saving && <span className="ink-saving" aria-live="polite">Opslaan…</span>}
        </>
      )}
    </div>
  );
}

/**
 * The sheet that takes the hand while drawing. `toContent` turns a client
 * point into the place's coordinates; `widthScale` is what the hook divides
 * the brush's screen width by so a line is as thick as chosen at the zoom it
 * was drawn at. One pointer draws; a second one (a pinch) abandons the stroke
 * rather than drawing a line to wherever the second finger landed.
 */
export function InkCapture({
  tool,
  toContent,
  widthScale,
  onBegin,
  onExtend,
  onEnd,
  onAbort,
  stopPropagation = false,
}: {
  tool: InkTool;
  toContent: (clientX: number, clientY: number) => { x: number; y: number };
  widthScale: number;
  onBegin: (tool: InkTool, x: number, y: number, pressure: number, widthScale: number) => void;
  onExtend: (x: number, y: number, pressure: number) => void;
  onEnd: () => void;
  onAbort: () => void;
  /** True where the stage underneath would otherwise start its own gesture on the same pointer. */
  stopPropagation?: boolean;
}) {
  const pointerId = useRef<number | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);

  const pressureOf = (event: React.PointerEvent) => (event.pointerType === 'pen' ? Math.max(0.05, event.pressure || 0.5) : 1);

  const moveRing = (event: React.PointerEvent) => {
    const el = ring.current;
    if (!el) return;
    const rect = event.currentTarget.getBoundingClientRect();
    el.style.transform = `translate(${event.clientX - rect.left}px, ${event.clientY - rect.top}px)`;
  };

  const size = tool.mode === 'erase' ? INK_ERASER_WIDTH : INK_BRUSHES[tool.brush];

  return (
    <div
      className={`ink-capture ink-capture-${tool.mode}`}
      data-testid="ink-capture"
      onPointerDown={(event) => {
        if (stopPropagation) event.stopPropagation();
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        if (pointerId.current !== null) {
          // A second finger: this is a pinch, not a line.
          pointerId.current = null;
          last.current = null;
          onAbort();
          return;
        }
        event.preventDefault();
        pointerId.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        const at = toContent(event.clientX, event.clientY);
        last.current = { x: event.clientX, y: event.clientY };
        onBegin(tool, at.x, at.y, pressureOf(event), widthScale);
        moveRing(event);
      }}
      onPointerMove={(event) => {
        if (stopPropagation) event.stopPropagation();
        if (event.pointerType !== 'touch') {
          moveRing(event);
          if (!hover) setHover(true);
        }
        if (pointerId.current !== event.pointerId || !last.current) return;
        // Thinned: a hand jitters at sub-pixel distances, and every point is stored.
        if (Math.hypot(event.clientX - last.current.x, event.clientY - last.current.y) < MIN_STEP_PX) return;
        last.current = { x: event.clientX, y: event.clientY };
        const at = toContent(event.clientX, event.clientY);
        onExtend(at.x, at.y, pressureOf(event));
      }}
      onPointerUp={(event) => {
        if (stopPropagation) event.stopPropagation();
        if (pointerId.current !== event.pointerId) return;
        pointerId.current = null;
        last.current = null;
        onEnd();
      }}
      onPointerCancel={(event) => {
        if (stopPropagation) event.stopPropagation();
        if (pointerId.current !== event.pointerId) return;
        pointerId.current = null;
        last.current = null;
        onAbort();
      }}
      onPointerLeave={() => setHover(false)}
      onPointerEnter={() => setHover(true)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={ring}
        className={`ink-ring${hover ? '' : ' ink-ring-hidden'}`}
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          ['--ink' as string]: tool.mode === 'erase' ? 'transparent' : INK_COLOURS[tool.colour],
        }}
      />
    </div>
  );
}

/**
 * The Keeper's two controls, for the settings sheet of a prikbord, a
 * landkaart or a tijdlijn: the switch, and the wipe.
 */
export function InkKeeperControls({
  enabled,
  strokeCount,
  onSetEnabled,
  onClear,
  busy,
  noun,
}: {
  enabled: boolean;
  strokeCount: number;
  onSetEnabled: (enabled: boolean) => void;
  onClear: () => void;
  busy?: boolean;
  /** "dit prikbord", "deze landkaart", "deze tijdlijn" */
  noun: string;
}) {
  // The box flips at once and follows the server's answer when it comes; a
  // switch that waits a round trip before moving reads as a switch that stuck.
  const [shown, setShown] = useState(enabled);
  useEffect(() => setShown(enabled), [enabled]);
  return (
    <div className="ink-keeper" data-testid="ink-keeper">
      <label className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={shown}
          disabled={busy}
          onChange={(event) => {
            setShown(event.target.checked);
            onSetEnabled(event.target.checked);
          }}
          data-testid="ink-enabled"
        />
        <span>
          <strong>Tekenen toegestaan</strong>
          <span className="tiny muted" style={{ display: 'block' }}>
            Uit: niemand kan meer tekenen of gummen op {noun}; wat er staat blijft staan.
          </span>
        </span>
      </label>
      <div className="row" style={{ gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
        <button type="button" className="btn btn-small btn-ghost" disabled={busy || strokeCount === 0} onClick={onClear} data-testid="ink-clear">
          <Icon name="trash" size={14} />
          Tekenlaag wissen
        </button>
        <span className="tiny muted">
          {strokeCount === 0 ? 'Nog niets getekend.' : `${strokeCount} ${strokeCount === 1 ? 'streek' : 'streken'}`}
        </span>
      </div>
    </div>
  );
}
