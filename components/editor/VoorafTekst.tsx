'use client';

import { createContext, Fragment, useContext, type CSSProperties, type ReactNode } from 'react';
import { knownChip, usePageChips, type ShortChipMap } from '@/components/ui/ShortChips';
import { naadHoofd, naadSneden, type NaadStuk } from '@/lib/wiki/naad';

/**
 * §104, golf J (j4): de tekst van een artikel in de eerste verf.
 *
 * De lopende tekst is een gedeelde editor (§20) en die bestaat alleen in de
 * browser (`next/dynamic`, `ssr: false`). Tot hij er is, stond er niets — en
 * als hij kwam, duwde hij alles eronder een scherm omlaag, op een telefoon
 * midden in het eerste scherm (CLS 0,05–0,11, stuk 12 van de meting). Dit is
 * dezelfde tekst, op de server getekend in dezelfde opmaak als ProseMirror hem
 * tekent (`.ProseMirror.prose`, een lege alinea met een `<br>`, een chip als
 * `a.entry-chip`, de naad van `lib/wiki/naad.ts` rond wat deze lezer niet mag
 * zien), zodat de editor hem op dezelfde hoogte vervangt. Alleen in Lezen: in
 * Bewerken wacht je op de editor om te typen.
 *
 * Geen ProseMirror en geen DOM: dit loopt op de server. De namen van chips
 * komen uit de pagina (`ShortChips`, §97), net als bij de editor zelf; wat de
 * pagina niet kent, is hier niets, zoals in de editor tot hij het gevraagd
 * heeft.
 */

type Mark = { type: string; attrs?: Record<string, unknown> };
type DocNode = {
  type?: string;
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, unknown>;
  content?: DocNode[];
};

/** Wat `LiveBody` en `RichEditor` tonen tot de editor er is. */
export const Vooraf = createContext<ReactNode>(null);

/** De plek voor de laadtekst van `next/dynamic`, die geen props krijgt. */
export function VoorafPlek() {
  const vooraf = useContext(Vooraf);
  return <>{vooraf ?? <div className="editor-body" aria-busy="true" />}</>;
}

export function VoorafTekst({ doc }: { doc: unknown }) {
  const page = usePageChips();
  const root = doc as DocNode | null;
  if (!root || !Array.isArray(root.content)) return <div className="editor-body" aria-busy="true" />;
  return (
    /* Dezelfde nesting als `RichEditor`: zijn omhulsel, `.editor-body`, de div van `EditorContent`. */
    <div data-vooraf="tekst">
      <div className="editor-body">
        <div>
          <div className="tiptap ProseMirror prose vooraf-tekst" contentEditable={false} translate="no">
            {root.content.map((node, index) => blok(node, index, page))}
          </div>
        </div>
      </div>
    </div>
  );
}

function blok(node: DocNode, key: number, page: ShortChipMap): ReactNode {
  const inhoud = () => (node.content ?? []).map((child, index) => blok(child, index, page));
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{regel(node.content ?? [], page)}</p>;
    case 'heading': {
      const level = node.attrs?.level === 3 ? 3 : 2;
      const Kop = level === 3 ? 'h3' : 'h2';
      return <Kop key={key}>{regel(node.content ?? [], page)}</Kop>;
    }
    case 'bulletList':
      return <ul key={key}>{inhoud()}</ul>;
    case 'orderedList': {
      const start = typeof node.attrs?.start === 'number' && node.attrs.start !== 1 ? node.attrs.start : undefined;
      return (
        <ol key={key} start={start}>
          {inhoud()}
        </ol>
      );
    }
    case 'listItem':
      return <li key={key}>{inhoud()}</li>;
    case 'blockquote':
      return <blockquote key={key}>{inhoud()}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{(node.content ?? []).map((child) => child.text ?? '').join('')}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} />;
    case 'image': {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
      if (!src) return null;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={src}
          alt={typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''}
          title={typeof node.attrs?.title === 'string' ? node.attrs.title : undefined}
        />
      );
    }
    default:
      // Een blok dat hier niet bekend is: zijn inhoud, zodat de hoogte er ongeveer is.
      return node.content ? <div key={key}>{inhoud()}</div> : null;
  }
}

/** Eén regel inline-inhoud, met de naad rond verborgen chips zoals `naadDecorations` hem legt. */
function regel(content: DocNode[], page: ShortChipMap): ReactNode {
  // Leeg: ProseMirror zet er een `<br>` in, zodat de alinea een regel hoog is.
  if (!content.length) return <br className="ProseMirror-trailingBreak" />;
  const stukken: NaadStuk[] = content.map((child) => {
    if (child.type === 'text') return { tekst: child.text ?? '' };
    if (child.type === 'hardBreak') return { breuk: true };
    if (child.type === 'entryLink') return knownChip(page, String(child.attrs?.handle ?? '')) ? { vast: true } : { verborgen: true };
    return { vast: true };
  });
  const verborgen = stukken.some((stuk) => 'verborgen' in stuk);
  const sneden = verborgen ? naadSneden(stukken) : [];
  const hoofd = verborgen ? naadHoofd(stukken, sneden) : null;

  return content.map((child, index) => {
    if (child.type === 'hardBreak') return <br key={index} />;
    if (child.type === 'entryLink') return <Chip key={index} handle={String(child.attrs?.handle ?? '')} page={page} />;
    if (child.type !== 'text') return null;
    const text = child.text ?? '';
    // Wat wegvalt (`naad`, in Lezen `display: none`) en de hoofdletter na een gat.
    const marks: Array<{ van: number; tot: number; klasse: string }> = (sneden[index] ?? []).map(([van, tot]) => ({
      van,
      tot,
      klasse: /^\s+$/.test(text.slice(van, tot)) ? 'naad naad-wit' : 'naad',
    }));
    if (hoofd && hoofd.stuk === index) marks.push({ van: hoofd.van, tot: hoofd.tot, klasse: 'naad-hoofd' });
    marks.sort((a, b) => a.van - b.van);
    const delen: ReactNode[] = [];
    let at = 0;
    marks.forEach((mark, n) => {
      if (mark.van > at) delen.push(text.slice(at, mark.van));
      delen.push(
        <span key={`n${n}`} className={mark.klasse}>
          {text.slice(mark.van, mark.tot)}
        </span>,
      );
      at = mark.tot;
    });
    if (at < text.length) delen.push(text.slice(at));
    return <Fragment key={index}>{metMarks(delen, child.marks ?? [])}</Fragment>;
  });
}

function metMarks(inner: ReactNode, marks: Mark[]): ReactNode {
  return marks.reduceRight<ReactNode>((kind, mark) => {
    switch (mark.type) {
      case 'bold':
        return <strong>{kind}</strong>;
      case 'italic':
        return <em>{kind}</em>;
      case 'strike':
        return <s>{kind}</s>;
      case 'code':
        return <code>{kind}</code>;
      case 'link': {
        const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : undefined;
        // Alleen een gewoon adres; wat de editor anders tekent, is hier geen link.
        if (!href || !/^(https?:|mailto:|\/)/i.test(href)) return kind;
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {kind}
          </a>
        );
      }
      default:
        return kind;
    }
  }, inner);
}

/** Zoals de node-view van `EntryLink` hem tekent. */
function Chip({ handle, page }: { handle: string; page: ShortChipMap }) {
  const chip = knownChip(page, handle);
  if (!chip) return <a className="entry-chip-none" contentEditable={false} data-entry-handle={handle} aria-hidden="true" />;
  // §89: alleen zes hexcijfers komen in een style.
  const style =
    chip.colour && /^#[0-9a-fA-F]{6}$/.test(chip.colour) ? ({ ['--chip-colour' as string]: chip.colour } as CSSProperties) : undefined;
  return (
    <a
      className="entry-chip"
      contentEditable={false}
      data-entry-handle={handle}
      href={`/e/${chip.slug}`}
      data-entry-slug={chip.slug}
      data-entry-icon={chip.icon ?? ''}
      data-entry-id={chip.entryId}
      style={style}
    >
      {chip.name}
    </a>
  );
}
