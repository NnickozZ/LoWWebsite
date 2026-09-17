'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import type { CanvasModeState } from './useCanvasMode';

/**
 * §73 — de schakelaar tussen Lezen en Bewerken.
 *
 * Two radios in one group rather than one toggle button, for two reasons:
 *
 * - **You can see which one you are in without pressing anything.** A single
 *   button saying "Bewerken" does not say whether it is a state or an action;
 *   two segments with one pressed in do.
 * - **§64: the names never change.** The radios are called `Lezen` and
 *   `Bewerken` whichever is checked, so a spec (and a screen reader) finds
 *   them by name. They are radios, not buttons, so they never collide with the
 *   many `Bewerken` *buttons* a panel already has (`getByRole('button', …)`
 *   does not match a radio).
 *
 * Renders nothing for a hand that may not edit: there is only one mode then,
 * and a switch with one position is a lie.
 */
export default function CanvasModeToggle({ mode }: { mode: CanvasModeState }) {
  /*
   * The server draws every canvas as a desk, so the switch arrives saying
   * Bewerken and a phone turns it to Lezen on hydration. `data-ready` says the
   * switch is the client's own now — a spec that reads it earlier reads the
   * server's guess (`editCanvas` in tests/e2e/helpers.ts waits for it).
   */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // A frame later, so a phone's own answer (`useIsPhone` after hydration) is in.
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  if (!mode.canEdit) return null;
  const pick = (next: 'read' | 'edit') => () => mode.setMode(next);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const next = mode.editing ? 'read' : 'edit';
      mode.setMode(next);
      const group = event.currentTarget as HTMLElement;
      requestAnimationFrame(() =>
        group.querySelector<HTMLElement>(`[data-mode="${next}"]`)?.focus(),
      );
    }
  };
  return (
    <div
      className={`canvas-mode${mode.editing ? ' is-editing' : ' is-reading'}`}
      role="radiogroup"
      aria-label="Lezen of bewerken"
      data-testid="canvas-mode"
      data-ready={ready ? 'true' : undefined}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        role="radio"
        data-mode="read"
        aria-checked={!mode.editing}
        tabIndex={mode.editing ? -1 : 0}
        aria-label="Lezen"
        title="Lezen — niets verschuift per ongeluk"
        onClick={pick('read')}
      >
        <Icon name="eye" size={15} />
        <span className="canvas-mode-word">Lezen</span>
      </button>
      <button
        type="button"
        role="radio"
        data-mode="edit"
        aria-checked={mode.editing}
        tabIndex={mode.editing ? 0 : -1}
        aria-label="Bewerken"
        title="Bewerken — slepen, maken en tekenen"
        onClick={pick('edit')}
      >
        <Icon name="pencil" size={15} />
        <span className="canvas-mode-word">Bewerken</span>
      </button>
    </div>
  );
}
