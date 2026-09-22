'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { SuggestionRenderState } from './entrySuggestion';
import { currentView, placeSuggestList, type View } from '@/lib/editor/shortBox';

/**
 * The `@` / `[[` dropdown. Positioned from the caret rect the suggestion plugin
 * hands us — no positioning library, nothing loaded at runtime (§2.3).
 */
export function SuggestionPopup({ state, testId }: { state: SuggestionRenderState | null; testId?: string }) {
  /*
   * §92 (A5): the list is placed by `placeSuggestList` — the same algorithm
   * the short boxes now use (`MentionPopover`) — against the part of the screen
   * that can actually be seen. On a phone with the keyboard up that is
   * `visualViewport`, not the window: the old measure opened the list
   * downwards, under the keyboard.
   */
  const [view, setView] = useState<View | null>(null);
  // §95: the list's spoken name is a word the Keeper can change.
  const ui = useUi();

  useEffect(() => {
    const measure = () => setView(currentView());
    measure();
    window.addEventListener('resize', measure);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, []);

  if (!state || !state.rect || !state.items.length || !view) return null;

  const place = placeSuggestList(
    { left: state.rect.left, top: state.rect.top, bottom: state.rect.bottom, width: 0 },
    view,
    { gap: 6, want: 220, cap: 260, minWidth: 320, maxWidth: 320 },
  );

  return (
    <div
      className="suggest-list"
      role="listbox"
      aria-label={ui.words.mentionListLabel}
      data-testid={testId}
      data-up={place.up ? 'true' : undefined}
      style={{
        position: 'fixed',
        left: place.left,
        top: place.top,
        bottom: place.bottom,
        width: place.width,
        zIndex: 70,
        maxHeight: place.maxHeight,
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
            {/* §31: a folder on the rows that come from the dossier this text
                is in, so the order at the top is legible rather than magic.
                The icon only — the dossier's name is not this list's to say. */}
            {item.entry.inCase && (
              <span
                title="Uit dit dossier"
                style={{ color: 'var(--ink-muted)', flex: '0 0 auto', display: 'inline-flex' }}
              >
                <Icon name="folder" size={14} />
                <span className="visually-hidden">Uit dit dossier</span>
              </span>
            )}
          </button>
        ) : (
          <button
            key="create"
            type="button"
            role="option"
            aria-selected={index === state.activeIndex}
            // §95: pinned to the bottom of the list, like the short boxes' row
            // (§92 A5) — the reason to type `[[` at a table is often this row.
            className="suggest-item mention-pop-create"
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
