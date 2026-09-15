'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Size } from '@/lib/canvas/clamp';

/**
 * §69 (3.4) — hoe groot is dit zwevende paneel echt.
 *
 * The half of `lib/canvas/clamp.ts` that needs a browser. The arithmetic there
 * is pure and tested; this is the one line of it that cannot be: asking the
 * element how tall it turned out to be.
 *
 * `useLayoutEffect`, not `useEffect`, because the answer is used to position
 * the very element being measured — reading it after the browser has painted
 * means the panel is visibly in the wrong place for a frame. And a
 * `ResizeObserver` after that, because these panels change height while they
 * are open: the kiezer grows a list of suggestions as you type, which is
 * exactly when a clamp worked out once at open time stops being true.
 *
 * `guess` is what is used until the first measurement lands. Pass the number
 * the code used to guess, so a panel that was placed acceptably before this
 * hook is still placed the same way in that first frame rather than jumping.
 */
export function useFloatBox<T extends HTMLElement>(ref: RefObject<T | null>, guess: Size): Size {
  const [size, setSize] = useState<Size>(guess);
  /* The guess is a fresh object literal at every render; only its numbers matter. */
  const guessRef = useRef(guess);
  guessRef.current = guess;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = el.offsetWidth || guessRef.current.width;
      const height = el.offsetHeight || guessRef.current.height;
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
