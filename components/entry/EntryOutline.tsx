'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';

export type OutlineItem = {
  /** The id of the element on the page. */
  id: string;
  label: string;
  /** 0 for a block, 1 for something inside one (a section's title). */
  level?: 0 | 1;
  icon?: string;
};

/**
 * "Op deze pagina": the parts of an artikel, in the order they are on it, with
 * the one you are reading marked. Two shapes of the same list — a column that
 * scrolls along beside the text on a wide screen, a row of chips on a phone —
 * the way Notion, Craft and Google Docs keep an outline beside a document:
 * a long page is navigable when you can see where you are (Nielsen's
 * "visibility of system status") and jump without scrolling.
 *
 * The marked item is the last one whose top has passed a line a third of the
 * way down the window; measured on scroll with a small throttle, which is
 * cheaper and steadier than an IntersectionObserver per heading.
 */
export function EntryOutline({
  items,
  shape,
  label,
}: {
  items: OutlineItem[];
  shape: 'column' | 'row';
  label: string;
}) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (!items.length) return;
    let ticking = false;
    const measure = () => {
      ticking = false;
      const line = window.innerHeight * 0.33;
      let found: string | null = items[0].id;
      for (const item of items) {
        const element = document.getElementById(item.id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= line) found = item.id;
        else break;
      }
      setCurrent(found);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [items]);

  if (!items.length) return null;

  const jump = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    // A folded block opens before the jump, so the jump lands on something —
    // whether the anchor is the fold itself or a wrapper round it.
    const fold =
      element instanceof HTMLDetailsElement ? element : element.querySelector<HTMLDetailsElement>(':scope > details');
    if (fold) fold.open = true;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrent(id);
  };

  return (
    <nav className={`entry-outline entry-outline-${shape}`} aria-label={label}>
      {shape === 'column' && <p className="entry-outline-title">{label}</p>}
      <ul className="entry-outline-list">
        {items.map((item) => (
          <li key={item.id} className={item.level ? 'entry-outline-sub' : undefined}>
            <a
              href={`#${item.id}`}
              className={`entry-outline-link${current === item.id ? ' entry-outline-current' : ''}`}
              aria-current={current === item.id ? 'location' : undefined}
              onClick={(event) => {
                event.preventDefault();
                jump(item.id);
              }}
            >
              {item.icon && <Icon name={item.icon} size={13} />}
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
