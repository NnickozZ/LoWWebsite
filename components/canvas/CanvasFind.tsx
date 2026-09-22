'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { useSuggestKeys } from '@/components/ui/useSuggestKeys';
import { AUTHOR_GATE_OFF } from '@/lib/canvas/authorGate';
import { findOnCanvas, type Findable } from '@/lib/canvas/find';

/**
 * §94 (C4) — vinden op het vlak.
 *
 * "Waar was die kaart van Boone?" was knijpen, pannen en lezen op de gok: het
 * enige zoekvak op een prikbord was de toevoeg-kiezer, en die laat wat al hangt
 * met opzet weg. De landkaart had het al (de legenda-zoeker) en het web ook;
 * dit is dezelfde beweging voor het prikbord en de stamboom. Typ, kies, en het
 * vlak zoomt naar het ding en kiest het.
 *
 * Twee plekken, één lijst (`findOnCanvas`, puur):
 *
 * - **In Lezen** is dit het hele zoekvak: er valt niets toe te voegen, dus er
 *   is alleen vinden. Het schrijft niets, dus het vraagt §18b's vraag nooit.
 * - **In Bewerken** op het prikbord is de groep *Op dit prikbord* de bovenste
 *   groep in de gewone kiezer (`BoardPicker`); de stamboom heeft geen kiezer in
 *   zijn balk en toont dit vak in beide standen.
 */
export function CanvasFind({
  items,
  onFind,
  group,
  testId,
  compact = false,
}: {
  items: Findable[];
  onFind: (id: string) => void;
  /** The heading over the list: "Op dit prikbord", "Op deze stamboom". */
  group: string;
  testId: string;
  /**
   * A loep at every width, opening over the glass — for a toolbar that already
   * has a search box of another kind in it (the stamboom in Bewerken, where
   * the box beside it *adds* people), so there are never two boxes side by side.
   */
  compact?: boolean;
}) {
  const ui = useUi();
  const id = useId();
  const [text, setText] = useState('');
  /*
   * On a phone the box is a 44 px magnifier until it is pressed, and then it
   * opens *over* the glass rather than as a row of its own — a row would take
   * its height off the stage on every visit, for a search that is used on some
   * (§34). On a desk it is always the box. The toggle is CSS-only visible.
   */
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const found = useMemo(() => findOnCanvas(items, text), [items, text]);
  const typed = text.trim();
  const keys = useSuggestKeys({ open: Boolean(typed), ref: rootRef });
  const pick = (one: string) => {
    onFind(one);
    setText('');
    setOpen(false);
  };
  return (
    <div
      ref={rootRef}
      className={`canvas-find${compact ? ' is-compact' : ''}${open ? ' is-open' : ''}`}
      role="search"
      data-testid={testId}
      {...AUTHOR_GATE_OFF}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && (typed || open)) {
          event.stopPropagation();
          setText('');
          setOpen(false);
          return;
        }
        keys.onKeyDown(event);
      }}
    >
      <button
        type="button"
        className="btn btn-small btn-ghost canvas-find-toggle"
        aria-label={ui.words.findOnCanvas}
        title={ui.words.findOnCanvas}
        aria-expanded={open}
        onClick={() => {
          setOpen((was) => !was);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <Icon name="search" size={16} />
      </button>
      <span className="canvas-find-box">
      <label className="visually-hidden" htmlFor={id}>
        {ui.words.findOnCanvas}
      </label>
      <Icon name="search" size={14} aria-hidden="true" />
      <input
        ref={inputRef}
        id={id}
        className="input canvas-find-input"
        value={text}
        autoComplete="off"
        placeholder={ui.words.findOnCanvasHint}
        onChange={(event) => setText(event.target.value)}
      />
      {typed && (
        <ul className="suggest-list canvas-find-list" aria-label={group}>
          <li className="suggest-group tiny muted">{group}</li>
          {found.length === 0 && <li className="suggest-empty small muted">{ui.words.findNothing}</li>}
          {found.map((item) => (
            <li key={item.id}>
              <button type="button" className="suggest-item" onClick={() => pick(item.id)}>
                <Icon name={item.icon ?? 'crosshair'} size={16} style={{ color: 'var(--ink-muted)' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{item.name}</strong>
                  {item.hint && (
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {item.hint}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      </span>
    </div>
  );
}
