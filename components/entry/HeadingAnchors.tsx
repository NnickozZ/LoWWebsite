'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useUi } from '@/components/ui/UiProvider';
import { headingHref, headingIds } from '@/lib/wiki/anchors';
import { fill } from '@/lib/words';

/**
 * §104, ronde 67 (L7): een `#` naast elke kop, in Lezen.
 *
 * De koppen in de tekst en in de secties staan in een ProseMirror-weergave, en
 * die is van ProseMirror: een `id` of een knop die wij er in de DOM bij zetten,
 * ziet zijn waarnemer als een wijziging van het document en tekent hij weg —
 * en in een gedeelde tekst (§20) is dat geen plek om te knutselen. Dus leggen
 * de ankers er *overheen*: één laag in `.entry-main`, met per kop een `<a>` op
 * de plek van het eind van die kop. Het `<a>` draagt zelf het id, zodat
 * `…#de-haven` bij het openen daar uitkomt, en het is een gewone link: Tab
 * komt erop, Enter kopieert.
 *
 * Kijken doet dit alleen: de koppen worden gelezen (tekst en plek), nooit
 * aangeraakt. Een `ResizeObserver` en een `MutationObserver` houden de plekken
 * bij als er een plaatje laadt of iemand anders in de tekst typt.
 *
 * Beweging: het `#` verschijnt met een fade van `--dur-2` (alleen `opacity`),
 * en onder reduced motion zonder (leeskamer.css). Op een aanraakscherm is er
 * geen hover, dus daar staat het er zacht altijd.
 */

/** Wat een anker is: een kop in de tekst of in een sectie, en de titel van een sectie. */
const HEADINGS = [
  '.entry-body-block .ProseMirror h2',
  '.entry-body-block .ProseMirror h3',
  '.entry-section .entry-section-title',
  '.entry-section .ProseMirror h2',
  '.entry-section .ProseMirror h3',
].join(', ');

type Anchor = { id: string; text: string; top: number; left: number; height: number };

export function HeadingAnchors({ slug, scope }: { slug: string; scope: RefObject<HTMLElement | null> }) {
  const ui = useUi();
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [near, setNear] = useState<string | null>(null);
  const headingsRef = useRef<HTMLElement[]>([]);
  const jumped = useRef(false);

  const measure = useCallback(() => {
    const root = scope.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const headings = [...root.querySelectorAll<HTMLElement>(HEADINGS)].filter(
      (heading) => heading.offsetParent !== null && (heading.textContent ?? '').trim(),
    );
    headingsRef.current = headings;
    const texts = headings.map((heading) => (heading.textContent ?? '').trim());
    // Nooit een id dat de pagina al voor iets anders gebruikt.
    const ids = headingIds(texts, (id) => {
      const other = document.getElementById(id);
      return Boolean(other && !other.hasAttribute('data-kop-anker'));
    });
    const next = headings.map((heading, index) => {
      // Het eind van de kop: de laatste regel van zijn tekst, niet zijn hele blok.
      const range = document.createRange();
      range.selectNodeContents(heading);
      const lines = range.getClientRects();
      const last = lines.length ? lines[lines.length - 1] : heading.getBoundingClientRect();
      const width = root.clientWidth;
      return {
        id: ids[index],
        text: texts[index],
        top: last.top - box.top,
        // Na het laatste woord, maar nooit buiten de kolom (een telefoon scrolt dan opzij).
        left: Math.min(last.right - box.left + 6, Math.max(0, width - 22)),
        height: last.height,
      };
    });
    setAnchors((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, [scope]);

  // Meten: nu, bij elke maatverandering, en als de tekst eronder verandert.
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    soon();
    const resize = new ResizeObserver(soon);
    resize.observe(root);
    const mutation = new MutationObserver((records) => {
      // Onze eigen laag telt niet mee.
      if (records.every((record) => (record.target as Element).closest?.('[data-kop-lagen]'))) return;
      soon();
    });
    mutation.observe(root, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', soon);
    // Een lettertype dat laat binnenkomt, verschuift elke regel.
    void document.fonts?.ready.then(soon);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', soon);
    };
  }, [measure, scope]);

  // Een adres met een kop erin: de tekst komt pas na de pagina, dus springen we zelf, één keer.
  useEffect(() => {
    if (jumped.current || !anchors.length) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return;
    const target = anchors.find((anchor) => anchor.id === hash);
    if (!target) return;
    jumped.current = true;
    document.getElementById(target.id)?.scrollIntoView({ block: 'start' });
  }, [anchors]);

  // Welke kop de muis nadert: dan verschijnt zijn `#`.
  useEffect(() => {
    const root = scope.current;
    if (!root || !anchors.length) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const headings = headingsRef.current;
        let found: string | null = null;
        headings.forEach((heading, index) => {
          const rect = heading.getBoundingClientRect();
          if (event.clientY >= rect.top - 4 && event.clientY <= rect.bottom + 4) found = anchors[index]?.id ?? null;
        });
        setNear(found);
      });
    };
    const onLeave = () => setNear(null);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
    };
  }, [anchors, scope]);

  const copy = async (anchor: Anchor) => {
    const href = headingHref(window.location.origin, slug, anchor.id);
    let copied = false;
    try {
      await navigator.clipboard.writeText(href);
      copied = true;
    } catch {
      // Zonder klembord-toestemming: de ouderwetse weg.
      const box = document.createElement('textarea');
      box.value = href;
      box.setAttribute('readonly', '');
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      box.remove();
    }
    // Het adres in de balk wijst nu ook naar de kop (§94: `null`, nooit `history.state`).
    window.history.replaceState(null, '', `#${anchor.id}`);
    ui.toast(copied ? ui.words.headingLinkCopied : fill(ui.words.headingLinkNotCopied, { adres: href }));
  };

  if (!anchors.length) return null;
  return (
    <div className="kop-lagen" data-kop-lagen>
      {anchors.map((anchor) => (
        <a
          key={anchor.id}
          id={anchor.id}
          data-kop-anker
          href={`#${anchor.id}`}
          className={`kop-anker${near === anchor.id ? ' kop-anker-dichtbij' : ''}`}
          style={{ top: anchor.top, left: anchor.left, height: anchor.height, lineHeight: `${anchor.height}px` }}
          aria-label={fill(ui.words.headingLinkLabel, { kop: anchor.text })}
          title={ui.words.headingLinkTitle}
          onClick={(event) => {
            // Een gewone klik kopieert; Ctrl/⌘, middenknop en rechts zijn van de browser (§68).
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            void copy(anchor);
          }}
        >
          #
        </a>
      ))}
    </div>
  );
}
