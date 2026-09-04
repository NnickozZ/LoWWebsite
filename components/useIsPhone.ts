'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  const list = window.matchMedia(QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

/**
 * True under 768 px. Server-renders as false and corrects on hydration, so the
 * desktop layout is the one that appears in the HTML — anything that must work
 * without JavaScript should not depend on this.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
