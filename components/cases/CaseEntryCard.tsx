'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { borderClass } from '@/components/borders';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { MentionText } from '@/components/ui/MentionPopover';
import { useUi } from '@/components/ui/UiProvider';
import type { CaseEntry } from '@/lib/cases/service';

/**
 * §7: uniform 3:4 cover, name, short description clamped to two lines, the case
 * note in italics. The kebab edits the note or removes it from the case.
 *
 * Round 19: the cover is drawn with the artikel's own staand crop — the one
 * every list uses. A dossier no longer keeps a crop of its own, so there is
 * no crop mode here; "Bijsnijden" lives on the artikel.
 *
 * §53 (round 27): the kebab's menu is **portalled to the body**, the way
 * `MentionPopover` is. It used to be an absolutely positioned child of the
 * card, and `.card` is `overflow: hidden` — load-bearing, because a zoomed
 * cover crop is a `transform: scale()` that paints outside its box — so the
 * menu was cut off by the card rather than being drawn over it, and no
 * `z-index` can beat an overflow clip. It was also a hard 190 px inside a grid
 * column that is 150 px at its narrowest, so "Dossiernotitie bewerken" fell off
 * the side. Fixed, measured from the button's own rectangle, with a width floor
 * of its own and clamped to the window — and with the outside-click and Escape
 * every other menu in the app has.
 */
/**
 * §53: how wide the menu is, in screen pixels, and deliberately not the card's
 * width — the longest row ("Dossiernotitie toevoegen") is what has to fit, and
 * a column in this grid can be 150 px.
 */
const MENU_WIDTH = 232;

export function CaseEntryCard({
  caseId,
  entry,
  onChanged,
  readOnly = false,
}: {
  caseId: string;
  entry: CaseEntry;
  onChanged: () => void;
  /** §17: no note or remove for someone who may only look. */
  readOnly?: boolean;
}) {
  const ui = useUi();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(entry.caseNote);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null);

  /** Where the menu hangs: under the kebab, right edges together, inside the window. */
  function place() {
    const rect = kebabRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setMenuAt({ left, top: rect.bottom + 4 });
  }

  /*
   * The manners every other menu has (`KeeperSwitch`): a click anywhere else
   * closes it, Escape closes it, and moving the page under it makes it follow
   * the button rather than hang where the button no longer is. The outside
   * click is also what keeps two cards from having their menus open at once —
   * each card's own listener sees the click on the other card's kebab.
   */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || kebabRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    // Moving the page under it makes the menu *follow* the button rather than
    // shut: closing on scroll threw the menu away the moment anything scrolled
    // the item into view, which is what a hand on a trackpad — and Playwright —
    // both do on the way to clicking a row.
    const follow = () => place();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
    };
  }, [menuOpen]);

  async function saveNote(next: string) {
    setNote(next);
    setEditingNote(false);
    await fetch(`/api/cases/${caseId}/entries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, note: next, noteOnly: true }),
    });
    onChanged();
  }

  async function remove() {
    setMenuOpen(false);
    const previousNote = note;
    await fetch(`/api/cases/${caseId}/entries?entryId=${encodeURIComponent(entry.id)}`, {
      method: 'DELETE',
    });
    onChanged();
    router.refresh();
    ui.toast(`${entry.name} uit dit dossier gehaald.`, {
      label: 'Ongedaan maken',
      onAction: async () => {
        await fetch(`/api/cases/${caseId}/entries`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entryId: entry.id, note: previousNote }),
        });
        onChanged();
        router.refresh();
      },
    });
  }

  return (
    <div className={`card ${borderClass(entry.typeBorder)}`}>
      <Link href={`/e/${entry.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
        <Cover
          assetId={entry.coverAssetId}
          crop={entry.coverCrop}
          shape="portrait"
          alt=""
          icon={entry.typeIcon}
          colour={entry.typeColour}
        />
      </Link>

      {!readOnly && (
      <button
        type="button"
        ref={kebabRef}
        aria-label={`Opties voor ${entry.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-testid="case-entry-kebab"
        onClick={() => {
          place();
          setMenuOpen((open) => !open);
        }}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 32,
          height: 32,
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
          borderRadius: 2,
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        ⋯
      </button>
      )}

      {menuOpen && !readOnly && menuAt && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="cover-menu cover-menu-float"
            role="menu"
            aria-label={`Opties voor ${entry.name}`}
            data-testid="case-entry-menu"
            style={{ left: menuAt.left, top: menuAt.top, width: MENU_WIDTH }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setEditingNote(true);
              }}
            >
              <Icon name="file" size={15} />
              {note ? 'Dossiernotitie bewerken' : 'Dossiernotitie toevoegen'}
            </button>
            <button type="button" role="menuitem" className="cover-menu-danger" onClick={remove}>
              <Icon name="trash" size={15} />
              Uit dossier halen
            </button>
          </div>,
          document.body,
        )}

      <div className="card-body">
        <Link href={`/e/${entry.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
          <p className="card-name">{entry.name}</p>
          {entry.shortDescription && (
            <p className="tiny muted clamp-2" style={{ margin: 0 }}>
              {/* §48: flat chips — the card body is a link. */}
              <MentionText text={entry.shortDescription} flat />
            </p>
          )}
        </Link>

        {editingNote ? (
          <textarea
            className="textarea"
            autoFocus
            defaultValue={note}
            rows={2}
            placeholder="Waarom dit hier van belang is"
            style={{ marginTop: '0.4rem', minHeight: 56, fontSize: '0.85rem' }}
            onBlur={(event) => void saveNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditingNote(false);
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                void saveNote((event.target as HTMLTextAreaElement).value);
              }
            }}
          />
        ) : (
          note && (
            <p
              className="tiny clamp-2"
              style={{ margin: '0.35rem 0 0', fontStyle: 'italic', cursor: 'text' }}
              onClick={() => setEditingNote(true)}
            >
              {note}
            </p>
          )
        )}
      </div>
    </div>
  );
}
