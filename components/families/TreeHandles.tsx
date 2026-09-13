'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/Icon';

/**
 * §66 — the three `+`s and the `…` round the card a hand has chosen.
 *
 * A stamboom is drawn from facts that live elsewhere, so the handles are how a
 * reader adds one without leaving the picture: **boven** is a parent, **onder**
 * is a child, **opzij** is a partner. What each of them actually *writes*
 * depends on what the card is:
 *
 *  - an artikel → a koppelingsveld on that artikel, through
 *    `POST /api/family-trees/{id}/relations`. The tree's own state is untouched
 *    but for the membership of whoever was picked;
 *  - a los kaartje → a tie in the tree's own state, because a card with no page
 *    has nowhere to write a field.
 *
 * A soort without a field of that role has no handle: the button is there,
 * disabled, and says why — a missing handle is a mystery, a disabled one with a
 * sentence is an instruction (Beheer → Soorten).
 *
 * The handles live *in* the world layer so they travel with the card, and every
 * one of them is scaled back by the zoom so it is 32 px on the glass whatever
 * the tree is at — a `+` that shrinks to four pixels is a `+` nobody can press.
 */

export type HandleRole = 'parent' | 'child' | 'partner';

export type HandleOffer = {
  role: HandleRole;
  /** False when the soort has no field of this role — the button says why. */
  enabled: boolean;
  /** "Ouder toevoegen" — the button's own name. */
  label: string;
  /** Why it is disabled, when it is. */
  hint?: string;
};

export type TreeMenuItem = {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
  onSelect: () => void;
};

/** How big a handle is on the glass, whatever the zoom (§66: 32 px on a phone too). */
export const HANDLE_PX = 32;

export function TreeHandles({
  box,
  zoom,
  offers,
  menu,
  menuOpen,
  onMenu,
  onAdd,
  nodeName,
}: {
  /** The card, in world coordinates. */
  box: { x: number; y: number; width: number; height: number };
  zoom: number;
  offers: HandleOffer[];
  menu: TreeMenuItem[];
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onAdd: (role: HandleRole) => void;
  nodeName: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onMenu(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen, onMenu]);

  /** A handle keeps its size on the glass: the world is scaled, so it is unscaled. */
  const pin = (x: number, y: number) => ({
    left: x,
    top: y,
    transform: `translate(-50%, -50%) scale(${1 / (zoom || 1)})`,
  });

  const spot: Record<HandleRole, { x: number; y: number }> = {
    parent: { x: box.x + box.width / 2, y: box.y },
    child: { x: box.x + box.width / 2, y: box.y + box.height },
    partner: { x: box.x + box.width, y: box.y + box.height / 2 },
  };
  /*
   * All three are a `+`. Where the handle *is* — above, below, beside — is what
   * says which one it is, and it says it in every language; an arrow would have
   * to be rotated per role and would still be read as "move" rather than "add".
   * The name is on the button (`aria-label`) for anyone not looking at it.
   */
  const glyph: Record<HandleRole, string> = { parent: 'plus', child: 'plus', partner: 'plus' };

  return (
    <>
      {offers.map((offer) => (
        <button
          key={offer.role}
          type="button"
          className={`tree-handle tree-handle-${offer.role}`}
          data-testid={`tree-handle-${offer.role}`}
          style={pin(spot[offer.role].x, spot[offer.role].y)}
          disabled={!offer.enabled}
          title={offer.enabled ? offer.label : offer.hint}
          aria-label={`${offer.label} bij ${nodeName}`}
          aria-describedby={offer.enabled ? undefined : `tree-handle-hint-${offer.role}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => offer.enabled && onAdd(offer.role)}
        >
          <Icon name={glyph[offer.role]} size={16} />
          {!offer.enabled && offer.hint && (
            <span className="visually-hidden" id={`tree-handle-hint-${offer.role}`}>
              {offer.hint}
            </span>
          )}
        </button>
      ))}

      <div ref={menuRef} className="tree-menu-anchor" style={pin(box.x + box.width, box.y)}>
        <button
          type="button"
          className="tree-handle tree-handle-menu"
          data-testid="tree-handle-menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Meer bij ${nodeName}`}
          title="Meer"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onMenu(!menuOpen)}
        >
          <span aria-hidden="true">…</span>
        </button>
        {menuOpen && (
          <div className="tree-menu" role="menu" data-testid="tree-menu">
            {menu.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={`tree-menu-item${item.danger ? ' tree-menu-item-danger' : ''}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  onMenu(false);
                  item.onSelect();
                }}
              >
                {item.icon && <Icon name={item.icon} size={13} />}
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
