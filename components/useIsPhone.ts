'use client';

import { useSyncExternalStore } from 'react';

const PHONE = '(max-width: 767px)';
/*
 * §25: the width at which the artikel page becomes three columns.
 *
 * **This number and the `@media (min-width: 1280px)` block around
 * `.entry-layout-wide` in `app/globals.css` are the same number and have to
 * stay the same number.** This one decides whether the outline rail and the
 * sidebar are rendered at all; that one decides where the grid puts them. Move
 * one alone and React renders a rail the stylesheet has nowhere to put — which
 * is exactly how the page ended up with two different wide layouts and an
 * outline that jumped between the picture and the text at 1280 px.
 */
const WIDE = '(min-width: 1280px)';

function subscribeTo(query: string) {
  return (onChange: () => void) => {
    if (typeof window === 'undefined') return () => undefined;
    const list = window.matchMedia(query);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  };
}

const subscribePhone = subscribeTo(PHONE);
const subscribeWide = subscribeTo(WIDE);
const phoneNow = () => window.matchMedia(PHONE).matches;
const wideNow = () => window.matchMedia(WIDE).matches;

/**
 * True under 768 px. Server-renders as false and corrects on hydration, so the
 * desktop layout is the one that appears in the HTML — anything that must work
 * without JavaScript should not depend on this.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, phoneNow, () => false);
}

/**
 * True from 1280 px: the width at which the artikel page has room for all
 * three of its columns — text, outline, sidebar (§25; see `WIDE` above, which
 * must agree with `app/globals.css`). Under it the page is one column with the
 * picture and the facts stacked under the header and the outline as a row of
 * chips. Server-renders as true, for the same reason as above.
 */
export function useIsWide(): boolean {
  return useSyncExternalStore(subscribeWide, wideNow, () => true);
}
