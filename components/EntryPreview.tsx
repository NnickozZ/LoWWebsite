'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { assetUrl } from './Cover';
import { Icon } from './Icon';

type Preview = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  coverAssetId: string | null;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
};

const cache = new Map<string, Preview | null>();

/**
 * §6: hovering a chip on desktop, or long-pressing one on a phone, shows a
 * preview card. One document-level listener covers chips in prose, in the
 * editor, and anywhere else `data-entry-id` appears.
 */
export function EntryPreview() {
  const [preview, setPreview] = useState<{ data: Preview; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  // Clicking a chip navigates, so the element the pointer was over is gone and
  // no pointerout ever arrives — the card would hang around over the new page.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    setPreview(null);
  }, [pathname]);

  useEffect(() => {
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setPreview(null);
    };

    const show = async (element: HTMLElement, delay: number) => {
      const id = element.getAttribute('data-entry-id');
      if (!id) return;
      const rect = element.getBoundingClientRect();

      const paint = (data: Preview | null) => {
        if (!data) return;
        const x = Math.min(Math.max(8, rect.left), window.innerWidth - 276);
        const below = window.innerHeight - rect.bottom > 140;
        const y = below ? rect.bottom + 8 : Math.max(8, rect.top - 132);
        setPreview({ data, x, y });
      };

      if (cache.has(id)) {
        timer.current = setTimeout(() => paint(cache.get(id) ?? null), delay);
        return;
      }

      timer.current = setTimeout(async () => {
        try {
          const response = await fetch(`/api/preview?id=${encodeURIComponent(id)}`);
          const data = response.ok ? ((await response.json()).entry as Preview | null) : null;
          cache.set(id, data);
          paint(data);
        } catch {
          /* nothing to show */
        }
      }, delay);
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const element = (event.target as HTMLElement | null)?.closest?.('[data-entry-id]');
      if (!(element instanceof HTMLElement)) return;
      clear();
      void show(element, 350);
    };

    const onOut = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const element = (event.target as HTMLElement | null)?.closest?.('[data-entry-id]');
      if (element) clear();
    };

    const onTouchStart = (event: TouchEvent) => {
      const element = (event.target as HTMLElement | null)?.closest?.('[data-entry-id]');
      if (!(element instanceof HTMLElement)) return;
      void show(element, 450);
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    // Any press dismisses it, so it never sits on top of what you just clicked.
    document.addEventListener('pointerdown', clear, true);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', clear);
    document.addEventListener('touchmove', clear, { passive: true });
    window.addEventListener('scroll', clear, true);

    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointerdown', clear, true);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', clear);
      document.removeEventListener('touchmove', clear);
      window.removeEventListener('scroll', clear, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!preview) return null;
  const { data, x, y } = preview;

  return (
    <div className="preview-card" style={{ left: x, top: y }} role="tooltip">
      {data.coverAssetId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(data.coverAssetId, 'thumb')} alt="" />
      ) : (
        <div
          style={{
            width: 54,
            height: 72,
            border: '1px solid var(--rule)',
            background: 'var(--paper-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto',
          }}
        >
          <Icon name={data.typeIcon} size={22} style={{ color: data.typeColour, opacity: 0.6 }} />
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontFamily: 'var(--serif)' }}>{data.name}</p>
        <p className="tiny muted" style={{ margin: '0 0 0.2rem' }}>
          {data.typeLabel}
        </p>
        <p className="tiny clamp-2" style={{ margin: 0 }}>
          {data.shortDescription}
        </p>
      </div>
    </div>
  );
}
