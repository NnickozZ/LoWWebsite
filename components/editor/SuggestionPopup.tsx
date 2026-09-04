'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import type { SuggestionRenderState } from './entrySuggestion';

/**
 * The `@` / `[[` dropdown. Positioned from the caret rect the suggestion plugin
 * hands us — no positioning library, nothing loaded at runtime (§2.3).
 */
export function SuggestionPopup({ state }: { state: SuggestionRenderState | null }) {
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const measure = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  if (!state || !state.rect || !state.items.length) return null;

  const width = Math.min(320, viewport.w - 16);
  const spaceBelow = viewport.h - state.rect.bottom;
  const openUp = spaceBelow < 220 && state.rect.top > 240;
  const left = Math.min(Math.max(8, state.rect.left), Math.max(8, viewport.w - width - 8));

  return (
    <div
      className="suggest-list"
      role="listbox"
      style={{
        position: 'fixed',
        left,
        top: openUp ? undefined : state.rect.bottom + 6,
        bottom: openUp ? viewport.h - state.rect.top + 6 : undefined,
        width,
        zIndex: 70,
        maxHeight: 260,
        overflowY: 'auto',
        boxShadow: '3px 3px 0 rgba(31,27,22,0.2)',
      }}
    >
      {state.items.map((item, index) =>
        item.kind === 'entry' ? (
          <button
            key={item.entry.id}
            type="button"
            role="option"
            aria-selected={index === state.activeIndex}
            className="suggest-item"
            onMouseDown={(event) => {
              event.preventDefault();
              state.onPick(index);
            }}
          >
            <Icon name={item.entry.typeIcon} size={16} style={{ color: item.entry.typeColour }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong>{item.entry.name}</strong>
              <span className="tiny muted" style={{ display: 'block' }}>
                {item.entry.typeLabel}
              </span>
            </span>
          </button>
        ) : (
          <button
            key="create"
            type="button"
            role="option"
            aria-selected={index === state.activeIndex}
            className="suggest-item"
            onMouseDown={(event) => {
              event.preventDefault();
              state.onPick(index);
            }}
          >
            <Icon name="plus" size={16} style={{ color: 'var(--stamp-red)' }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              &lsquo;<strong>{item.name}</strong>&rsquo; aanmaken
            </span>
          </button>
        ),
      )}
    </div>
  );
}
