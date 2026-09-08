'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { KIND_ICON, type KeeperKind, type KeeperRef } from '@/lib/keeper/kinds';
import { createTwinAction } from './actions';
import { KeeperTiePicker } from './KeeperTiePicker';

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
 * §53 adds one button to each of the two *no twin* states and one to each of
 * the two others. A Keeper preps on their own side while the table writes the
 * wiki page about the same thing, so the two faces usually already exist and
 * only need to be told about each other: **"Link met bestaande …"** opens the
 * twin picker, and **"Ontkoppelen"** takes the pair apart again without
 * touching either page. The state that used to be a dead phrase — the Keeper's
 * own page with no player-facing face — is exactly the one this fills.
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
  twinTieId = null,
  ropes,
}: {
  kind: KeeperKind;
  id: string;
  keeperOnly: boolean;
  /** The other face, already read through `keeperRef` on the server. */
  twin: KeeperRef | null;
  /** §53: the tie itself, which is what "Ontkoppelen" cuts. */
  twinTieId?: string | null;
  /** Every other tie, both directions, this viewer may see. */
  ropes: KeeperRef[];
}) {
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // §53: what the other face is called, from this side of the pair.
  const otherName = keeperOnly ? words.playerVersion : words.keeperVersion;

  async function untie() {
    if (!twinTieId || !twin) return;
    const yes = await ui.confirm({
      title: `${twin.name} loskoppelen van deze pagina?`,
      message: `Allebei de pagina's blijven staan; alleen de knop ertussen verdwijnt. De ${words.keeperNotes} zijn één tekst geworden en blijven staan waar ze nu staan — op de ${words.keeperSide}.`,
      confirmLabel: 'Ontkoppelen',
      danger: true,
    });
    if (!yes) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/keeper/ties?id=${encodeURIComponent(twinTieId)}&kind=${kind}&from=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        ui.toast(data.error ?? 'Dat lukte niet.');
        return;
      }
      router.refresh();
    } catch {
      ui.toast('Geen verbinding.');
    } finally {
      setBusy(false);
    }
  }

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
    <div className="keeper-switch-block">
    <div className="keeper-switch row-wrap" data-testid="keeper-switch">
      {twin ? (
        <>
        <Link
          className="btn btn-small btn-primary keeper-switch-go"
          href={twin.href}
          data-testid="keeper-switch-link"
        >
          <Icon name="shield" size={14} />
          {keeperOnly ? words.playerVersion : words.keeperVersion}
        </Link>
        {twinTieId && (
          <button
            type="button"
            className="btn btn-small btn-ghost keeper-twin-untie"
            disabled={busy}
            data-testid="keeper-twin-untie"
            onClick={() => void untie()}
          >
            <Icon name="close" size={13} />
            Ontkoppelen
          </button>
        )}
        </>
      ) : (
        <>
        {/* The Keeper's own page has no "maken" button: a second page for the
            table, made out of a page written for nobody but the Keeper, is not
            something a button should do by itself. Linking one that already
            exists is (§53). */}
        {!keeperOnly && (
          <form action={createTwinAction}>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={id} />
            <button className="btn btn-small keeper-switch-make" type="submit" data-testid="keeper-switch-make">
              <Icon name="shield" size={14} />
              {words.keeperVersion} maken
            </button>
          </form>
        )}
        <button
          type="button"
          className="btn btn-small keeper-twin-link"
          aria-expanded={linking}
          data-testid="keeper-twin-link"
          onClick={() => setLinking((value) => !value)}
        >
          <Icon name="link" size={14} />
          Link met bestaande {otherName.toLowerCase()}
        </button>
        </>
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
    {/* §53: the picker for the other face, under the row rather than in a
        popover — it is a search box with a list, and a list of pages is a
        thing to read. */}
    {!twin && linking && (
      <div className="keeper-twin-picker">
        <p className="tiny muted keeper-panel-hint">
          Zoek de {otherName.toLowerCase()} die al bestaat. Daarna springt de knop hierboven tussen
          de twee heen en weer, en delen ze één set {words.keeperNotes}.
        </p>
        <KeeperTiePicker
          self={{ kind, id }}
          mode="twin"
          keeperOnly={keeperOnly}
          onTied={() => {
            setLinking(false);
            router.refresh();
          }}
        />
      </div>
    )}
    </div>
  );
}
