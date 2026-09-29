'use client';

import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from '@/components/Icon';

/**
 * §105 (golf i1) — de lege staat van een tekenvlak: één zin, één knop, en een
 * klein plaatje uit het archief.
 *
 * Elk vlak had zijn eigen lege zin, en ze zeiden allemaal twee of drie dingen:
 * waar het zoekvak stond ("hierboven"), welk gebaar een telefoon in plaats van
 * een dubbelklik kreeg, en wat Lezen niet deed. Een lege tafel is het moment
 * waarop je het minst weet, dus daar hoort het minst te staan: wat dit is (de
 * zin), wat je nu doet (één werkwoord), en een tekening die zegt waar je bent
 * zonder één woord — een fiche met een punaise, een speld op een gevouwen
 * kaart, een as met één ruit, drie kaartjes met een haak ertussen. In
 * inkt, met één stip stempelrood; geen emoji (regel 8).
 *
 * De knop is wat dit vlak het eerst maakt. In Lezen is hij *Beginnen*: hij zet
 * het vlak in Bewerken (§73), want daar is maken. Wie niet mag bewerken krijgt
 * alleen de zin.
 *
 * Het omhulsel houdt de oude klasse van elk vlak (`.board-empty`, `.map-empty`,
 * `.timeline-empty`, `.tree-empty`), zodat specs die daarop leunen blijven
 * vinden wat ze zochten. Het ligt in het glas maar vangt niets: alleen de knop
 * is aanraakbaar, en die houdt zijn druk voor zich, zodat het glas er geen
 * pan of sleep van maakt (CLAUDE.md §6: wat over een canvas zweeft en
 * ingedrukt kan worden, mag de stage niet bereiken).
 */

export type EmptyKind = 'board' | 'map' | 'timeline' | 'tree';

export function CanvasEmpty({
  kind,
  className,
  sentence,
  action,
  strook = false,
}: {
  kind: EmptyKind;
  /** The surface's own class, kept for the specs (`tree-empty`, …). */
  className: string;
  sentence: string;
  /**
   * The one verb — a maker's props, or the switch to Bewerken. `primary`
   * only where nothing else on the screen is the red button: in Bewerken the
   * round `+` already is (review 4, L11).
   */
  action?: {
    label: string;
    icon?: IconName;
    primary?: boolean;
    props: ButtonHTMLAttributes<HTMLButtonElement> & Record<string, unknown>;
  };
  /**
   * Review 4 (H3): a strip along the foot of the glass instead of a card in
   * its middle — for a vlak that already shows something of its own (the
   * Keeper's scan on a landkaart, the axis of a tijdlijn), which a card would
   * cover. A prikbord and a stamboom are bare paper, and keep the card.
   */
  strook?: boolean;
}) {
  return (
    <div
      className={`canvas-leeg ${className}${strook ? ' is-strook' : ''}`}
      data-kind={kind}
      data-testid="canvas-leeg"
    >
      <div className="canvas-leeg-fiche">
        <EmptyPicture kind={kind} />
        <p className="canvas-leeg-zin">{sentence}</p>
        {action && (
          <button
            type="button"
            className={`btn${action.primary ? ' btn-primary' : ''} canvas-leeg-doe`}
            {...action.props}
            onPointerDown={(event) => {
              // The glass never sees this press: no pan, no capture, no make-on-empty.
              event.stopPropagation();
              action.props.onPointerDown?.(event);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <Icon name={action.icon ?? 'plus'} size={15} />
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Four small drawings, 72 × 52, in the ink of the page (`currentColor`) with
 * one mark in `--stamp-red`. Decorative: the sentence says it in words.
 */
function EmptyPicture({ kind }: { kind: EmptyKind }) {
  const common = {
    className: 'canvas-leeg-beeld',
    width: 72,
    height: 52,
    viewBox: '0 0 72 52',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
  if (kind === 'board') {
    // Een fiche, schuin geprikt, met een draadje dat nergens heen gaat.
    return (
      <svg {...common}>
        <g transform="rotate(-4 30 28)">
          <rect x="14" y="12" width="32" height="30" rx="1.5" className="canvas-leeg-papier" />
          <path d="M19 24h20M19 29h16M19 34h12" opacity="0.55" />
        </g>
        <path d="M31 13 C 44 8, 52 16, 62 12" strokeDasharray="2 2.5" opacity="0.7" />
        <circle cx="31" cy="13" r="3.2" className="canvas-leeg-rood" />
      </svg>
    );
  }
  if (kind === 'map') {
    // Een gevouwen kaart met één speld.
    return (
      <svg {...common}>
        <path d="M8 14 L24 9 L40 14 L56 9 V41 L40 46 L24 41 L8 46 Z" className="canvas-leeg-papier" />
        <path d="M24 9 V41 M40 14 V46" opacity="0.5" />
        <path d="M12 34 C 20 30, 26 36, 34 31 S 48 26, 52 29" opacity="0.55" />
        <path d="M46 25 C 46 19, 38 19, 38 25 C 38 29, 42 32, 42 35 C 42 32, 46 29, 46 25 Z" className="canvas-leeg-rood" />
        <circle cx="42" cy="24.5" r="1.3" fill="var(--paper-raised)" stroke="none" />
      </svg>
    );
  }
  if (kind === 'timeline') {
    // Een as met streepjes en één ruit.
    return (
      <svg {...common}>
        <path d="M6 30 H66" />
        <path d="M14 27v6M26 27v6M50 27v6M62 27v6" opacity="0.5" />
        <path d="M38 22 L46 30 L38 38 L30 30 Z" className="canvas-leeg-rood" />
        <path d="M38 22 V12" strokeDasharray="2 2.5" opacity="0.6" />
        <rect x="31" y="6" width="22" height="7" rx="1" className="canvas-leeg-papier" />
      </svg>
    );
  }
  // Twee kaartjes met een haak naar een derde.
  return (
    <svg {...common}>
      <rect x="8" y="6" width="20" height="15" rx="1.5" className="canvas-leeg-papier" />
      <rect x="44" y="6" width="20" height="15" rx="1.5" className="canvas-leeg-papier" />
      <path d="M28 13.5 H44" />
      <path d="M18 21 V27 H54 V21 M36 27 V31" />
      <rect x="26" y="31" width="20" height="15" rx="1.5" strokeDasharray="2.5 2" className="canvas-leeg-rand-rood" />
    </svg>
  );
}
