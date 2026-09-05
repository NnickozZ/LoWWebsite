'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether a horizontally scrolling strip actually has more in it than fits.
 *
 * A strip with `overflow-x: auto` shows its scrollbar the moment its contents
 * are a pixel too wide — and on Windows that is a real bar, not an overlay.
 * The dossier's tab row was showing one with five tabs on a wide screen,
 * because `overflow-x: auto` also turns `overflow-y` into `auto` and the
 * active tab is a pixel taller than the row. The bar is hidden by CSS unless
 * this says there is something to scroll to; re-measured whenever the strip,
 * its contents, or the number of things in it changes.
 */
export function useOverflowing<T extends HTMLElement>(ref: RefObject<T | null>): boolean {
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    const sizes = new ResizeObserver(measure);
    const watchChildren = () => {
      sizes.disconnect();
      sizes.observe(element);
      for (const child of Array.from(element.children)) sizes.observe(child);
      measure();
    };
    watchChildren();
    const children = new MutationObserver(watchChildren);
    children.observe(element, { childList: true });
    return () => {
      sizes.disconnect();
      children.disconnect();
    };
  }, [ref]);

  return overflowing;
}
