'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * The CSS size of an element, kept current through a ResizeObserver.
 *
 * §67: `clientWidth`/`clientHeight`, not the bounding rectangle — the padding
 * box, not the border box. What this measures is a stage a tekenlaag is laid
 * over with `inset: 0`, and an absolutely placed child is laid out against the
 * padding box; a stage with a 1 px border therefore got a canvas two pixels
 * wider than the box it was stretched into, and everything on it was drawn a
 * pixel off. The same border comes off the hand's coordinates in
 * `contentPanZoom` (`components/ink/panZoom.ts`).
 */
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
