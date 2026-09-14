'use client';

import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { Icon } from '@/components/Icon';

/**
 * §66/§67 — the four `+`s and the `…` round the card a hand has chosen.
 *
 * A stamboom is drawn from facts that live elsewhere, so the handles are how a
 * reader adds one without leaving the picture: **boven** is a parent, **onder**
 * is a child, **rechts** is a partner and — since §67 — **links** is a brother
 * or a sister. The four sides are the whole vocabulary; the `…` sits on the
 * top-right corner where no `+` does. What each of them actually *writes*
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

/**
 * §67: `sibling` is the fourth, and it writes the `sibling`-role field
 * (`Broers en zussen`) exactly the way the other three write theirs. It exists
 * for the case the archive cannot work out for itself — two people whose
 * parents nobody has typed in — because everything else it could say is
 * already derived from the parents (`lib/families/siblings.ts`).
 */
export type HandleRole = 'parent' | 'child' | 'partner' | 'sibling';

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

  /*
   * §67: the left edge is the sibling's, and it was the only side still free —
   * top, bottom and right were already spoken for and the top-right corner is
   * the `…`. That it is *opposite* the partner reads well by accident and is
   * worth keeping: the two people who stand on your own row, one on each side.
   */
  const spot: Record<HandleRole, { x: number; y: number }> = {
    parent: { x: box.x + box.width / 2, y: box.y },
    child: { x: box.x + box.width / 2, y: box.y + box.height },
    partner: { x: box.x + box.width, y: box.y + box.height / 2 },
    sibling: { x: box.x, y: box.y + box.height / 2 },
  };
  /*
   * All four are a `+`. Where the handle *is* — above, below, either side — is
   * what says which one it is, and it says it in every language; an arrow would
   * have to be rotated per role and would still be read as "move" rather than
   * "add". The name is on the button (`aria-label`) for anyone not looking at
   * it.
   */
  const glyph: Record<HandleRole, string> = {
    parent: 'plus',
    child: 'plus',
    partner: 'plus',
    sibling: 'plus',
  };

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

      <TreeCornerMenu
        anchorRef={menuRef}
        style={pin(box.x + box.width, box.y)}
        label={`Meer bij ${nodeName}`}
        menu={menu}
        menuOpen={menuOpen}
        onMenu={onMenu}
      />
    </>
  );
}

/**
 * The `…` and the little list under it. Pulled out of `TreeHandles` in §67
 * because a *selection* has one too: with six cards chosen there is no single
 * card for the four `+`s to hang off, but "haal deze zes eruit" still has to be
 * reachable with a pointer and not only with the Delete key.
 */
function TreeCornerMenu({
  anchorRef,
  style,
  label,
  menu,
  menuOpen,
  onMenu,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
  label: string;
  menu: TreeMenuItem[];
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
}) {
  return (
    <div ref={anchorRef} className="tree-menu-anchor" style={style}>
      <button
        type="button"
        className="tree-handle tree-handle-menu"
        data-testid="tree-handle-menu"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={label}
        title="Meer"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onMenu(!menuOpen)}
      >
        <span aria-hidden="true">…</span>
      </button>
      {/*
       * §69: a `role="menu"` with no name is announced as "menu" and nothing
       * else, so a reader hearing it has no idea whose menu it is. The button
       * that opens it already carries the card's name (`label`); the menu says
       * the same thing.
       */}
      {menuOpen && (
        <div className="tree-menu" role="menu" aria-label={label} data-testid="tree-menu">
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
  );
}

/**
 * §67 — de handgreep die van twee kaartjes tegelijk is.
 *
 * With exactly two people chosen and both of their soorten carrying a field
 * with the role Kind, one `+` appears between them: a child of *both*, written
 * on both pages in one gesture. It is the only control on a stamboom that
 * belongs to two cards, so it is not part of `TreeHandles` (which is about one)
 * and its place comes from `betweenBoxes` in `lib/families/layout.ts`, where a
 * test can read it.
 *
 * Partner never implies parent, which is why this is a *selection* and not
 * something the partner line offers on its own: two people standing side by
 * side on a tree are not thereby the parents of anybody.
 */
export function TreeSharedHandle({
  at,
  zoom,
  label,
  hint,
  enabled,
  onAdd,
}: {
  /** World coordinates: `betweenBoxes(a, b)`. */
  at: { x: number; y: number };
  zoom: number;
  label: string;
  hint?: string;
  enabled: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      className="tree-handle tree-handle-both"
      data-testid="tree-handle-child-both"
      style={{ left: at.x, top: at.y, transform: `translate(-50%, -50%) scale(${1 / (zoom || 1)})` }}
      disabled={!enabled}
      title={enabled ? label : hint}
      aria-label={label}
      aria-describedby={enabled ? undefined : 'tree-handle-hint-both'}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => enabled && onAdd()}
    >
      <Icon name="plus" size={16} />
      {!enabled && hint && (
        <span className="visually-hidden" id="tree-handle-hint-both">
          {hint}
        </span>
      )}
    </button>
  );
}

/**
 * §67 — the `…` for a *selection*, at the top-right of everything chosen.
 *
 * Nothing else about a group of cards is offered here on purpose: what a
 * stamboom can do to six people at once is move them and take them out of the
 * tree, and the first of those is a drag.
 */
export function TreeSelectionMenu({
  at,
  zoom,
  count,
  menu,
  menuOpen,
  onMenu,
}: {
  /** World coordinates of the top-right corner of everything chosen. */
  at: { x: number; y: number };
  zoom: number;
  count: number;
  menu: TreeMenuItem[];
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
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

  return (
    <TreeCornerMenu
      anchorRef={menuRef}
      style={{ left: at.x, top: at.y, transform: `translate(-50%, -50%) scale(${1 / (zoom || 1)})` }}
      label={`Meer bij ${count} kaartjes`}
      menu={menu}
      menuOpen={menuOpen}
      onMenu={onMenu}
    />
  );
}
