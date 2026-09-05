'use client';

import { useSyncExternalStore } from 'react';

const PHONE = '(max-width: 767px)';
const WIDE = '(min-width: 1024px)';

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
 * True from 1024 px: the width at which the artikel page has room for its
 * sidebar. Server-renders as true, for the same reason as above.
 */
export function useIsWide(): boolean {
  return useSyncExternalStore(subscribeWide, wideNow, () => true);
}
