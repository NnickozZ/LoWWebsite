'use client';

import type { CSSProperties } from 'react';
import type { SkeletonShape } from '@/components/shell/skeletonShape';
import { useUi } from '@/components/ui/UiProvider';

export { skeletonShapeFor, type SkeletonShape } from '@/components/shell/skeletonShape';

/**
 * §102 (ronde 65·b, J2): het skelet — een rustige versie van de pagina die
 * komt, voor zes routes: artikel, dossier, wiki-lijst, kamer, winkel en
 * spelerspagina. `NavProgress` tekent het over de inhoudskolom als een klik
 * op een link naar zo'n route na 150 ms nog niet binnen is.
 *
 * **Waarom geen `loading.tsx`.** Dat was het plan (ronde 65, J2), en het is
 * gebouwd en gemeten. Een `loading.tsx` is een Suspense-grens die ook bij het
 * laden van een document bestaat: de server streamt eerst de schil met het
 * skelet en daarna de pagina. De schil hydrateert eerder dan de pagina, en de
 * providers erin (`UiProvider`, `LiveProvider`, `AuthorProvider`) zetten in
 * hun eerste effecten state. Een contextwissel die een nog niet
 * gehydrateerde grens raakt, dwingt React die grens in de browser opnieuw te
 * renderen. Gemeten op `/e/middelburg` bij een eerste bezoek: de pagina
 * stond er na 62 ms, maakte om 160 ms weer plaats voor het skelet en stond er
 * om 374 ms opnieuw; en een keer stonden er 200 ms lang twee artikelen in de
 * DOM (één verborgen), waardoor `access-rights.spec.ts:94` op een dubbele
 * `.entry-mode-toggle` viel. Een skelet dat terugflitst over een pagina die
 * er al stond, is erger dan geen skelet. Daarbij kostte de grens een eigen
 * `layout.tsx` per route om de 404 een 404 te houden (§89), en een anker als
 * `#plek-…` na *Bekijk* landde niet meer, omdat Next één keer scrolt en dat
 * in het skelet deed.
 *
 * Dit skelet bestaat alleen in de browser, alleen tijdens een navigatie die
 * met een klik begon, en raakt de status, het anker en het laden van een
 * document dus nergens.
 *
 * Drie afspraken, uit de beslissingen van ronde 65:
 *
 *   - **Plat.** Vlakken in `--paper-dark` op het papier, zonder shimmer: rust
 *     hoort bij het productieve register, en een glans is decoratie.
 *   - **Pas na 150 ms**, en dan in `--dur-3` erbij. Een snelle navigatie ziet
 *     het nooit.
 *   - **De vorm van de inhoud**, zodat het oog al weet waar de titel komt. Het
 *     raster volgt de echte pagina op dezelfde breekpunten (1280 px voor de
 *     drie kolommen van een artikel, 768 px voor de rest).
 *
 * **Niet op de canvassen** (`b`, `maps`, `timelines`, `stambomen`, `web`):
 * het glas heeft zijn eigen lege staat (§34), en een skelet dat daarna
 * "opengaat" is een camerasprong. `skeletonShapeFor` kent ze niet.
 *
 * Voor een schermlezer is het één regel: *Pagina wordt geladen* (`navLoading`).
 * De vlakken zelf zijn `aria-hidden`.
 */

/** Eén vlak. `w` is een breedte (`60%`, `9rem`); de rest zit in de klasse. */
function B({ k, w, style }: { k: string; w?: string; style?: CSSProperties }) {
  return <span className={`skeleton sk-${k}`} style={w ? { ...style, width: w } : style} />;
}

/** Een alinea: regels van bijna vol, met een korte laatste. */
function Lines({ n, last = '58%' }: { n: number; last?: string }) {
  const widths = ['100%', '97%', '99%', '94%', '98%', '92%'];
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <B key={i} k="line" w={i === n - 1 ? last : widths[i % widths.length]} />
      ))}
    </>
  );
}

function Repeat({ n, children }: { n: number; children: (i: number) => React.ReactNode }) {
  return <>{Array.from({ length: n }, (_, i) => children(i))}</>;
}

/**
 * Een kader: papier met een rand, zoals een infobox, een paneel, een kaartje
 * of een tegel in het archief. De vlakken erin zijn de regels die komen.
 */
function Frame({ k, children }: { k: string; children?: React.ReactNode }) {
  return <span className={`sk-frame sk-${k}`}>{children}</span>;
}

/** Een kaartje in een lijst: het plaatje boven, de naam en een regel eronder. */
function Card() {
  return (
    <Frame k="card">
      <span className="skeleton sk-cover" />
      <span className="sk-card-text">
        <B k="line" w="78%" />
        <B k="line" w="54%" />
        <B k="line sk-small" w="66%" />
      </span>
    </Frame>
  );
}

function Entry() {
  return (
    <div className="sk-entry">
      <div className="sk-rail">
        <B k="eyebrow" w="55%" />
        <Repeat n={7}>{(i) => <B key={i} k="line sk-small" w={['62%', '74%', '80%', '48%', '70%', '66%', '84%'][i]} />}</Repeat>
      </div>
      <div className="sk-head">
        <B k="chip" />
        <B k="title" w="60%" />
        <B k="lead" w="100%" />
        <B k="lead" w="72%" />
        <div className="sk-row">
          <B k="btn" w="11rem" />
          <B k="btn" w="10rem" />
          <B k="btn" w="8.5rem" />
        </div>
      </div>
      <div className="sk-row sk-jumps">
        <B k="pill sk-pill-big" w="7.5rem" />
        <B k="pill sk-pill-big" w="6rem" />
        <B k="pill sk-pill-big" w="8.5rem" />
      </div>
      <div className="sk-aside">
        {/* §104 (golf H, D30): the cover's place, 3:4 in the side column (liggend
            under 1280 px). Most artikelen here have one; a frame that goes away
            on arrival jars less than a column that grows 400 px. */}
        <B k="omslag" />
        <Frame k="infobox">
          <B k="eyebrow" w="5rem" />
          <Repeat n={3}>
            {(i) => (
              <span key={i} className="sk-pair">
                <B k="line sk-small" w="30%" />
                <B k="line sk-small" w={['52%', '38%', '46%'][i]} />
              </span>
            )}
          </Repeat>
        </Frame>
      </div>
      <div className="sk-body">
        <B k="heading" w="22%" />
        <Lines n={4} />
        <span className="sk-gap" />
        <Lines n={3} last="44%" />
      </div>
    </div>
  );
}

function Case() {
  return (
    <div className="sk-case">
      <B k="stamp" />
      <B k="title" w="42%" />
      <B k="lead" w="68%" />
      <div className="sk-row">
        <B k="pill" w="7rem" />
        <B k="pill" w="8.5rem" />
      </div>
      <div className="sk-tabs">
        <Repeat n={8}>{(i) => <B key={i} k="tab" w={['6.5rem', '6rem', '5.5rem', '9rem', '7rem', '10rem', '5rem', '8rem'][i]} />}</Repeat>
      </div>
      <B k="eyebrow" w="9rem" />
      <Frame k="notes">
        <B k="line" w="72%" />
        <B k="line" w="58%" />
      </Frame>
      <B k="eyebrow" w="8rem" />
      <div className="sk-cards">
        <Repeat n={4}>{(i) => <Card key={i} />}</Repeat>
      </div>
    </div>
  );
}

function List() {
  return (
    <div className="sk-list">
      <B k="eyebrow" w="6rem" />
      <B k="title" w="34%" />
      <div className="sk-tabs sk-tabs-wrap">
        <Repeat n={12}>{(i) => <B key={i} k="tab" w={['5rem', '5.5rem', '7rem', '8rem', '6.5rem', '6rem', '7.5rem', '5.5rem', '8.5rem', '6rem', '9rem', '7rem'][i]} />}</Repeat>
      </div>
      <div className="sk-toolbar">
        <B k="line" w="7rem" />
        <span className="sk-toolbar-end">
          <B k="btn" w="6rem" />
          <B k="btn" w="10rem" />
        </span>
      </div>
      <div className="sk-cards">
        <Repeat n={14}>{(i) => <Card key={i} />}</Repeat>
      </div>
    </div>
  );
}

function Kamer() {
  return (
    <div className="sk-kamer">
      <B k="eyebrow" w="4rem" />
      <B k="title" w="44%" />
      <div className="sk-row">
        <B k="pill" w="6.5rem" />
        <B k="btn" w="9.5rem" />
      </div>
      <span className="sk-rule" />
      <B k="line" w="12rem" />
      <div className="sk-tiles">
        <Repeat n={12}>
          {(i) => (
            <Frame key={i} k="tile">
              <B k="eyebrow" w="3.5rem" />
              <span className="skeleton sk-tile-mark" />
            </Frame>
          )}
        </Repeat>
      </div>
    </div>
  );
}

function Winkel() {
  return (
    <div className="sk-winkel">
      <B k="eyebrow" w="9rem" />
      <B k="title" w="22%" />
      <B k="eyebrow" w="5rem" />
      <div className="sk-row">
        <B k="pill sk-pill-big" w="17rem" />
        <B k="pill sk-pill-big" w="13rem" />
      </div>
      <span className="sk-rule" />
      <B k="line" w="6rem" />
      <div className="sk-row">
        <Repeat n={5}>{(i) => <B key={i} k="pill" w={['4.5rem', '5.5rem', '5.5rem', '6.5rem', '5rem'][i]} />}</Repeat>
      </div>
      <div className="sk-rows">
        <Repeat n={4}>
          {(i) => (
            <Frame key={i} k="shoprow">
              <span className="skeleton sk-thumb" />
              <span className="sk-shoprow-text">
                <B k="line" w={['7rem', '8.5rem', '6rem', '8rem'][i]} />
                <B k="line sk-small" w="16rem" />
                <B k="line sk-small" w="9rem" />
              </span>
              <span className="skeleton sk-price" />
            </Frame>
          )}
        </Repeat>
      </div>
    </div>
  );
}

function Panel({ k, rows }: { k: string; rows: number }) {
  return (
    <Frame k={k}>
      <B k="heading" w="7rem" />
      <span className="sk-panel-rule" />
      <Repeat n={rows}>{(i) => <B key={i} k="line" w={['64%', '48%', '72%', '40%'][i % 4]} />}</Repeat>
    </Frame>
  );
}

function Speler() {
  return (
    <div className="sk-speler">
      <B k="eyebrow" w="8rem" />
      <B k="title" w="18%" />
      <B k="line sk-small" w="4rem" />
      <div className="sk-row sk-row-center">
        <span className="skeleton sk-avatar" />
        <B k="line" w="9rem" />
        <B k="pill" w="7rem" />
        <B k="btn" w="9.5rem" />
        <B k="btn" w="9.5rem" />
      </div>
      <Panel k="panel-wide" rows={2} />
      <div className="sk-panels">
        <Panel k="panel" rows={3} />
        <Panel k="panel" rows={1} />
        <Panel k="panel" rows={4} />
      </div>
    </div>
  );
}

/**
 * §102, golf h1 (T7): de kop van een lijst achter een tab — wenkbrauw, titel met de
 * knop *Nieuw …* rechts, en de regel met de telling en de filters.
 */
function ListHead({ title }: { title: string }) {
  return (
    <>
      <div className="sk-listhead">
        <span className="sk-listhead-text">
          <B k="eyebrow" w="7rem" />
          <B k="title" w={title} />
        </span>
        <B k="btn sk-btn-new" w="9rem" />
      </div>
      <div className="sk-toolbar">
        <B k="line" w="6rem" />
        <span className="sk-toolbar-end">
          <B k="btn" w="6rem" />
          <B k="btn" w="13rem" />
        </span>
      </div>
    </>
  );
}

/** Prikborden, landkaarten, tijdlijnen, stambomen: rijen met een plaatje. */
function Rows() {
  return (
    <div className="sk-rowlist">
      <ListHead title="38%" />
      <Repeat n={6}>
        {(i) => (
          <span key={i} className="sk-listrow">
            <span className="skeleton sk-listrow-thumb" />
            <span className="sk-listrow-text">
              <B k="line" w={['34%', '28%', '40%', '31%', '36%', '25%'][i]} />
              <B k="line sk-small" w={['62%', '48%', '70%', '44%', '58%', '52%'][i]} />
            </span>
            <B k="line sk-small sk-listrow-date" w="5.5rem" />
          </span>
        )}
      </Repeat>
    </div>
  );
}

/** De dossiers: een kop en een raster van staande kaarten. */
function Cases() {
  return (
    <div className="sk-casegrid">
      <ListHead title="26%" />
      <div className="sk-cards">
        <Repeat n={5}>{(i) => <Card key={i} />}</Repeat>
      </div>
    </div>
  );
}

/** De hal: per speler een rij, met de kamerlinks eronder. */
function Hal() {
  return (
    <div className="sk-hal">
      <B k="eyebrow" w="4.5rem" />
      <B k="title" w="44%" />
      <Repeat n={6}>
        {(i) => (
          <span key={i} className="sk-hal-speler">
            <Frame k="hal-row">
              <B k="line" w={['4rem', '3.5rem', '3rem', '4.5rem', '5rem', '3.5rem'][i]} />
              <B k="line sk-small" w="7rem" />
            </Frame>
            <B k="line sk-small sk-hal-kamers" w="11rem" />
          </span>
        )}
      </Repeat>
    </div>
  );
}

/** Start en de wiki: een kop, een alinea, en de blokken eronder. */
function Voordeur() {
  return (
    <div className="sk-voordeur">
      <B k="eyebrow" w="6rem" />
      <B k="title" w="38%" />
      <div className="sk-voordeur-lead">
        <Lines n={3} last="46%" />
      </div>
      <div className="sk-voordeur-blocks">
        <span className="sk-voordeur-col">
          <B k="eyebrow" w="8rem" />
          <Frame k="voordeur-box">
            <B k="line" w="70%" />
            <B k="line" w="88%" />
            <B k="line sk-small" w="52%" />
          </Frame>
        </span>
        <span className="sk-voordeur-col">
          <B k="eyebrow" w="9rem" />
          <Repeat n={3}>
            {(i) => (
              <span key={i} className="sk-listrow">
                <span className="skeleton sk-listrow-thumb sk-thumb-staand" />
                <span className="sk-listrow-text">
                  <B k="line sk-small" w="5rem" />
                  <B k="line" w={['58%', '46%', '64%'][i]} />
                </span>
              </span>
            )}
          </Repeat>
        </span>
      </div>
    </div>
  );
}

const SHAPES: Record<SkeletonShape, { wide: boolean; draw: () => React.ReactNode }> = {
  entry: { wide: true, draw: Entry },
  case: { wide: true, draw: Case },
  list: { wide: true, draw: List },
  kamer: { wide: false, draw: Kamer },
  winkel: { wide: false, draw: Winkel },
  speler: { wide: false, draw: Speler },
  rows: { wide: false, draw: Rows },
  cases: { wide: true, draw: Cases },
  hal: { wide: false, draw: Hal },
  voordeur: { wide: true, draw: Voordeur },
};

export function SkeletonPage({ shape }: { shape: SkeletonShape }) {
  const words = useUi().words;
  const { wide, draw: Draw } = SHAPES[shape];
  return (
    <div
      className={`${wide ? 'page-wide' : 'page skeleton-narrow'} skeleton-page`}
      data-shape={shape}
      data-testid="skeleton"
      aria-busy="true"
    >
      <p className="visually-hidden" role="status">
        {words.navLoading}
      </p>
      <div aria-hidden="true">
        <Draw />
      </div>
    </div>
  );
}
