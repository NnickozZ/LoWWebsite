'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { KIND_ICON, type KeeperKind, type KeeperRef } from '@/lib/keeper/kinds';
import { createTwinAction } from './actions';

/**
 * §44: the button between the two faces.
 *
 * Four states, and the page it is on decides which by what it hands over —
 * never this component, and never CSS. Nothing here is hidden from a player:
 * a player's page does not render it at all, because the server never asked
 * for the ties.
 *
 *   player-facing, has a twin   → "Keeperversie", a link
 *   player-facing, has none     → "Keeperversie maken", a form
 *   Keeper's own, has a twin    → "Spelersversie", a link back
 *   Keeper's own, has none      → nothing but the ropes
 *
 * The ropes hang beside it in a popover of the same shape as the cover menu on
 * an artikel (`.cover-menu`) — closes on a click outside and on Escape, so the
 * two behave the same way under the same fingers.
 */
export function KeeperSwitch({
  kind,
  id,
  keeperOnly,
  twin,
  ropes,
}: {
  kind: KeeperKind;
  id: string;
  keeperOnly: boolean;
  /** The other face, already read through `keeperRef` on the server. */
  twin: KeeperRef | null;
  /** Every other tie, both directions, this viewer may see. */
  ropes: KeeperRef[];
}) {
  const words = useUi().words;
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="keeper-switch row-wrap" data-testid="keeper-switch">
      {twin ? (
        <Link
          className="btn btn-small btn-primary keeper-switch-go"
          href={twin.href}
          data-testid="keeper-switch-link"
        >
          <Icon name="shield" size={14} />
          {keeperOnly ? words.playerVersion : words.keeperVersion}
        </Link>
      ) : keeperOnly ? (
        // The Keeper's own page with no player-facing face: there is nothing
        // to cross to, and a button that made one would make a second page for
        // the table out of a page written for nobody but the Keeper.
        <span className="tiny muted keeper-switch-alone">Geen {words.playerVersion.toLowerCase()}</span>
      ) : (
        <form action={createTwinAction}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <button className="btn btn-small keeper-switch-make" type="submit" data-testid="keeper-switch-make">
            <Icon name="shield" size={14} />
            {words.keeperVersion} maken
          </button>
        </form>
      )}

      {ropes.length > 0 && (
        <div className="keeper-rope-anchor" ref={menuRef}>
          <button
            type="button"
            className="btn btn-small btn-ghost"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((value) => !value)}
            data-testid="keeper-ropes-button"
          >
            <Icon name="link" size={14} />
            Touwtjes ({ropes.length})
            <Icon name="chevron" size={12} className="cover-menu-caret" />
          </button>
          {open && (
            <div className="cover-menu keeper-rope-menu" role="menu" aria-label="Touwtjes">
              {ropes.map((rope) => (
                <Link
                  key={`${rope.kind}:${rope.id}`}
                  role="menuitem"
                  href={rope.href}
                  onClick={() => setOpen(false)}
                >
                  <Icon name={KIND_ICON[rope.kind]} size={14} />
                  <span className="keeper-rope-name">{rope.name}</span>
                  {rope.keeperOnly && <Icon name="shield" size={12} className="keeper-rope-mark" />}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
