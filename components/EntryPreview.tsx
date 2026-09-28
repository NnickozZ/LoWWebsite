'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { assetUrl, coverClass, coverStyle } from './Cover';
import { Icon } from './Icon';
import { MentionText } from './ui/MentionPopover';
import { useUi } from './ui/UiProvider';
import type { CoverCrops } from '@/lib/images/shapes';
import { fill } from '@/lib/words';

type Preview = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  coverAssetId: string | null;
  /** Round 19: drawn with the staand crop, like the feed thumb it is the size of. */
  coverCrop?: CoverCrops | null;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
};

const cache = new Map<string, Preview | null>();

/**
 * §102 (ronde 65, J5): the numbers of the card, in one place.
 *
 * A mouse rests half a second before the card comes — long enough that
 * sweeping across a paragraph of chips raises nothing, short enough to feel
 * like an answer. A finger keeps §6's long press of 450 ms. And leaving the
 * chip is not yet leaving: for a quarter of a second the card waits, so a hand
 * on its way to *Openen →* crosses the gap and finds it still there.
 */
export const PREVIEW_DELAY_MOUSE = 500;
export const PREVIEW_DELAY_TOUCH = 450;
export const PREVIEW_GRACE = 250;
/** Between the chip and the card. */
const GAP = 8;
/** The card never touches the edge of the window. */
const EDGE = 8;

type Anchor = { left: number; top: number; bottom: number };
type Shown = { data: Preview; at: Anchor; anchor: Element; touch: boolean };

async function load(id: string): Promise<Preview | null> {
  if (cache.has(id)) return cache.get(id) ?? null;
  try {
    const response = await fetch(`/api/preview?id=${encodeURIComponent(id)}`);
    const data = response.ok ? (((await response.json()) as { entry: Preview | null }).entry ?? null) : null;
    // A refusal is an answer worth keeping; a failed request is not.
    if (response.ok) cache.set(id, data);
    return data;
  } catch {
    return null;
  }
}

/**
 * §6: hovering a chip on desktop, or long-pressing one on a phone, shows a
 * preview card. One document-level listener covers chips in prose, in the
 * editor, and anywhere else `data-entry-id` appears.
 *
 * §102 (ronde 65, J5): and the card is a thing you can reach. It used to be
 * `pointer-events: none` and closed the instant the pointer left the chip, so
 * a card with nothing to press in it was all it could be. Now:
 *
 *  - it has a door, *Openen →* (`/e/<slug>`, which `/api/preview` already
 *    returns through the same visibility rule as the rest of the card);
 *  - leaving the chip starts `PREVIEW_GRACE`, and a pointer that arrives on
 *    the card in that time keeps it;
 *  - the capture-phase press that dismisses it skips a press *inside* it;
 *  - Escape closes it, and is listened for only while it is open — and it is
 *    the card's alone, one layer at a time, like everything else Escape does;
 *  - it fades in over `--dur-2` and is simply gone on the way out (a hover
 *    card that lingers is in the way of whatever you moved on to).
 *
 * One thing on purpose: while the mouse still rests on the chip the card lets
 * presses through (`data-reach="nee"`, `pointer-events: none`). It only
 * catches the pointer once the pointer leaves the chip, which is the only way
 * to reach it. So a card that happens to open over the next thing you meant to
 * press never swallows that press while you are still on the chip.
 *
 * On a phone a long press shows it and lifting the finger leaves it standing
 * (the lift is not a tap on the chip underneath), so the link can be tapped;
 * any press elsewhere, a scroll or a navigation puts it away.
 */
export function EntryPreview() {
  const { words } = useUi();
  const [shown, setShown] = useState<Shown | null>(null);
  /** False while the mouse is still on the chip: the card lets presses through. */
  const [reach, setReach] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const shownRef = useRef<Shown | null>(null);
  shownRef.current = shown;
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped by every cancel, so a fetch that lands late paints nothing. */
  const ask = useRef(0);
  /** The chip a card is on its way for. */
  const pending = useRef<Element | null>(null);
  const pathname = usePathname();

  const cancelShow = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = null;
    pending.current = null;
    ask.current += 1;
  }, []);
  const cancelHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);
  const clear = useCallback(() => {
    cancelShow();
    cancelHide();
    setShown(null);
  }, [cancelShow, cancelHide]);
  const hideSoon = useCallback(() => {
    cancelHide();
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      setShown(null);
    }, PREVIEW_GRACE);
  }, [cancelHide]);

  // Clicking a chip navigates, so the element the pointer was over is gone and
  // no pointerout ever arrives — the card would hang around over the new page.
  useEffect(() => {
    clear();
  }, [pathname, clear]);

  useEffect(() => {
    const inCard = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest('.preview-card'));

    const show = (element: HTMLElement, delay: number, touch: boolean) => {
      const id = element.getAttribute('data-entry-id');
      if (!id) return;
      cancelShow();
      pending.current = element;
      const mine = ask.current;
      const began = performance.now();
      // A cached card waits the whole delay and paints at once; an unknown one
      // starts its fetch halfway, so a pointer that only sweeps past asks for
      // nothing, and one that rests is answered on time.
      const first = cache.has(id) ? delay : Math.round(delay / 2);
      showTimer.current = setTimeout(async () => {
        showTimer.current = null;
        const data = await load(id);
        const rest = delay - (performance.now() - began);
        if (rest > 0) await new Promise((done) => setTimeout(done, rest));
        if (mine !== ask.current || !data || !element.isConnected) return;
        pending.current = null;
        const rect = element.getBoundingClientRect();
        cancelHide();
        setReach(touch);
        setShown({ data, at: { left: rect.left, top: rect.top, bottom: rect.bottom }, anchor: element, touch });
      }, first);
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      if (inCard(event.target)) return; // the card keeps itself (and its own chips raise nothing)
      const element = (event.target as Element | null)?.closest?.('[data-entry-id]');
      if (!(element instanceof HTMLElement)) return;
      const now = shownRef.current;
      if (now && now.anchor === element) {
        // Back on the chip before the grace ran out.
        cancelHide();
        setReach(false);
        return;
      }
      // Moving between the chip's own children is not a new arrival.
      if (pending.current === element) return;
      show(element, PREVIEW_DELAY_MOUSE, false);
    };

    const onOut = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      if (inCard(event.target)) return; // the card's own leave is `onPointerLeave`
      const element = (event.target as Element | null)?.closest?.('[data-entry-id]');
      if (!element) return;
      const to = event.relatedTarget;
      if (to instanceof Node && element.contains(to)) return; // still on the chip
      if (pending.current === element) cancelShow();
      if (shownRef.current?.anchor === element) {
        setReach(true);
        hideSoon();
      }
    };

    // Any press dismisses it, so it never sits on top of what you just clicked
    // — except a press on the card itself, which is what the card is for.
    const onPress = (event: PointerEvent) => {
      if (inCard(event.target)) return;
      clear();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (inCard(event.target)) return;
      const element = (event.target as Element | null)?.closest?.('[data-entry-id]');
      if (!(element instanceof HTMLElement)) return;
      show(element, PREVIEW_DELAY_TOUCH, true);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (inCard(event.target)) return;
      // Lifted before the card came: that was a tap, and the chip is its link.
      if (showTimer.current || pending.current) {
        cancelShow();
        return;
      }
      // Lifted after a long press raised it: the card stays, and the lift is
      // not a tap on the chip underneath (no click, no navigation).
      const now = shownRef.current;
      if (now?.touch && event.target instanceof Node && now.anchor.contains(event.target) && event.cancelable) {
        event.preventDefault();
      }
    };
    const onTouchMove = () => {
      // A finger that moves is scrolling; a card already standing goes with the scroll.
      if (showTimer.current || pending.current) cancelShow();
    };
    // The card is what a long press on a chip gives, instead of the browser's menu.
    const onContextMenu = (event: MouseEvent) => {
      const now = shownRef.current;
      if (now?.touch && event.target instanceof Node && now.anchor.contains(event.target)) event.preventDefault();
    };
    const onScroll = (event: Event) => {
      if (inCard(event.target)) return;
      clear();
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointerdown', onPress, true);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('scroll', onScroll, true);
      cancelShow();
      cancelHide();
    };
  }, [cancelShow, cancelHide, clear, hideSoon]);

  // Escape closes the card, and only while there is one: the listener is not
  // there otherwise. Capture, and stopped, so it peels this layer only — a sheet
  // under the card stays open until the next Escape.
  const open = shown !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      clear();
    };
    // On the window, in capture: the first ear on the road, ahead of a
    // sheet's own (`Sheet` listens on the document, in capture).
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, clear]);

  // Placed once its own size is known, before the first paint: below the chip,
  // or above it when there is no room below; never over the edge of the window.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !shown) return;
    const { left, top, bottom } = shown.at;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const x = Math.min(Math.max(EDGE, left), window.innerWidth - width - EDGE);
    const below = window.innerHeight - bottom - GAP - EDGE >= height;
    const y = below ? bottom + GAP : Math.max(EDGE, top - GAP - height);
    card.style.left = `${Math.max(EDGE, x)}px`;
    card.style.top = `${y}px`;
    card.dataset.side = below ? 'below' : 'above';
  }, [shown]);

  if (!shown) return null;
  const { data } = shown;
  const kind = { ['--kind' as string]: data.typeColour || 'var(--stamp-red)' } as CSSProperties;

  return (
    <div
      ref={cardRef}
      className="preview-card"
      data-testid="preview-card"
      data-reach={reach ? undefined : 'nee'}
      role="group"
      aria-label={fill(words.previewLabel, { naam: data.name })}
      style={kind}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') cancelHide();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        const to = event.relatedTarget;
        if (to instanceof Node && shown.anchor.contains(to)) return;
        hideSoon();
      }}
    >
      <div className="preview-body">
        {data.coverAssetId ? (
          <span className={`preview-thumb ${coverClass('portrait')}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(data.coverAssetId, 'thumb')} alt="" style={coverStyle(data.coverCrop, 'portrait')} />
          </span>
        ) : (
          <span className={`preview-thumb preview-thumb-icon ${coverClass('portrait')}`} aria-hidden="true">
            <Icon name={data.typeIcon} size={22} />
          </span>
        )}
        <div className="preview-text">
          <p className="preview-name">{data.name}</p>
          <span className="preview-kind">{data.typeLabel}</span>
          {data.shortDescription ? (
            <p className="preview-desc">
              {/* §48: flat chips — the card is not a link, but its chips must not
                  raise a second card or lead anywhere but *Openen →*. */}
              <MentionText text={data.shortDescription} flat tokens />
            </p>
          ) : null}
        </div>
      </div>
      <div className="preview-foot">
        <Link className="preview-open" href={`/e/${data.slug}`} data-testid="preview-open" onClick={clear}>
          {words.previewOpen}
        </Link>
      </div>
    </div>
  );
}
