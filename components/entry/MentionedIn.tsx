import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import type { EntrySummary } from '@/lib/entries/service';
import { mentionKey, type Mention } from '@/lib/entries/mentions';
import type { Snippet } from '@/lib/wiki/snippet';

/**
 * §27 → §104 (ronde 67, L3): *Genoemd in*, als een rij citaten.
 *
 * Tot deze ronde was dit een raster van kaartjes (de artikelen die hier in hun
 * tekst naar linken) met daaronder namen per soort bron. Een naam zegt dát er
 * iets naar je wijst; de zin zegt *waarom*, en dat is wat een lezer die iets
 * zoekt nodig heeft om te beslissen of hij verder klikt (het onderzoek, §A3–A4:
 * "hunters" en de sprong vanuit de lead). Dus nu: per bron één regel met zijn
 * naam en soort, en eronder het fragment waarin dit artikel genoemd wordt, met
 * de naam vet.
 *
 * Dit is een **servercomponent** en blijft dat: wat erin staat is een lezing
 * van het archief per kijker (rule 7), en die reist nooit als props naar de
 * browser. De rijen komen van `getBacklinks` en `listMentions`, de zinnen van
 * `mentionSentences` — dezelfde weg als altijd, met de zin erbij.
 *
 * Artikelen die hier in hun lopende tekst naar linken, staan nu in dezelfde
 * groep als een veld of een sectie van een artikel (*In artikelen*): voor een
 * lezer is het allemaal "een artikel noemt dit", en de zin eronder zegt waar.
 */
export function MentionedIn({
  heading,
  note,
  open,
  backlinks,
  groups,
  words,
  empty,
}: {
  heading: string;
  note?: string;
  open: boolean;
  backlinks: { entry: EntrySummary; sentence: Snippet | null }[];
  groups: { key: string; word: string; icon: string; items: { mention: Mention; sentence: Snippet | null }[] }[];
  words: Record<string, string>;
  empty: ReactNode;
}) {
  const count = backlinks.length + groups.reduce((n, group) => n + group.items.length, 0);

  // §104: de artikelen die hier in hun tekst naar linken, bovenaan de groep
  // "In artikelen" — ook als er verder geen veld of sectie is — en die groep
  // eerst, want een ander artikel is verreweg de gewoonste bron.
  const entryGroup = groups.find((group) => group.key === 'entry') ??
    (backlinks.length ? { key: 'entry', word: 'mentionedInEntries', icon: 'file', items: [] } : null);
  const shown = [...(entryGroup ? [entryGroup] : []), ...groups.filter((group) => group.key !== 'entry')];

  /*
   * §104 (ronde 67·herstel, #13): nothing mentions it — one quiet line with the
   * heading in it, not a fold that opens onto the same sentence. The outline
   * leaves it out (`emptyBlocks` in `EntryView`).
   */
  if (count === 0) {
    return (
      <p className="blok-leeg" data-testid="genoemd-in" data-leeg="ja">
        <span className="blok-leeg-kop">{heading}</span>
        <span className="blok-leeg-zin">{empty}</span>
      </p>
    );
  }

  return (
    <details className="section genoemd" open={open} data-testid="genoemd-in">
      <summary>
        {heading} <span className="muted">({count})</span>
      </summary>
      <div className="genoemd-body">
        {note && <p className="tiny muted genoemd-note">{note}</p>}
        {shown.map((group) => (
          <section key={group.key} className="genoemd-groep" aria-label={words[group.word]}>
            <h3 className="genoemd-kop">{words[group.word]}</h3>
            <ul className="genoemd-lijst">
              {group.key === 'entry' &&
                backlinks.map(({ entry, sentence }) => (
                  <Row
                    key={`body:${entry.id}`}
                    href={`/e/${entry.slug}`}
                    name={entry.name}
                    icon={entry.typeIcon}
                    colour={entry.typeColour}
                    kind={entry.typeLabel}
                    sentence={sentence}
                  />
                ))}
              {group.items.map(({ mention, sentence }) => (
                <Row
                  key={mentionKey(mention)}
                  href={mention.href}
                  name={mention.name}
                  icon={group.icon}
                  detail={mention.detail}
                  sentence={sentence}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}

function Row({
  href,
  name,
  icon,
  colour,
  kind,
  detail,
  sentence,
}: {
  href: string;
  name: string;
  icon: string;
  colour?: string;
  kind?: string;
  detail?: string;
  sentence: Snippet | null;
}) {
  return (
    <li className={`genoemd-rij${sentence ? ' genoemd-rij-zin' : ''}`}>
      <p className="genoemd-bron">
        <Icon
          name={icon}
          size={14}
          className={`genoemd-icoon${colour ? ' soort-inkt' : ''}`}
          style={colour ? { ['--soort' as string]: colour } : undefined}
        />
        <Link className="genoemd-naam" href={href}>
          {name}
        </Link>
        {(detail || kind) && <span className="genoemd-waar">{detail || kind}</span>}
      </p>
      {sentence && (
        <blockquote className="genoemd-zin" data-testid="genoemd-zin">
          {sentence.parts.map((part, index) =>
            part.own ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>,
          )}
        </blockquote>
      )}
    </li>
  );
}
