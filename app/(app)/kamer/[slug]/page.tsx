import '@/app/kamer.css';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Beurs } from '@/components/kamer/Beurs';
import { GrantForm } from '@/components/kamer/GrantForm';
import { Grootboek } from '@/components/kamer/Grootboek';
import { Plek } from '@/components/kamer/Plek';
import { RoomEffects } from '@/components/kamer/RoomEffects';
import { KamerGrid } from '@/components/kamer/Verplaatsen';
import { MEANING } from '@/components/kamer/plekWords';
import { LivePage } from '@/components/live/LivePage';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { ledgerOf, roomsOf, viewRoomBySlug } from '@/lib/kamers/service';
import { roomKey } from '@/lib/live/keys';
import { spelerHref } from '@/lib/spelers/service';
import { capitalise, fill } from '@/lib/words';

export const dynamic = 'force-dynamic';

/**
 * §79: de kamer van één onderzoeker.
 *
 * The address is the karakter's own artikel-slug — `/kamer/van-dijk` — so
 * there is one kamer per onderzoeker and no second id for anybody to learn.
 * `viewRoomBySlug` is the whole read: the plekken, the balance and the two
 * permissions come back in one call, already narrowed to what this pair of
 * eyes may see, so this file asks no rights question of its own. A slug that
 * answers nothing — no such artikel, an onderzoeker nobody wears, a kamer this
 * viewer may not open — is a 404 and not a locked door, the same answer a
 * private artikel or dossier gives at its own URL (§40).
 *
 * The shape is the round's four decisions made visible: a heading that points
 * back at the person, the balance in `words.currency`, a **grid of plekken**
 * (not a canvas, not an illustration), and the grootboek that the balance is
 * the sum of — since §83 for everybody who may stand here, with only the
 * writing of a line still the Keeper's.
 *
 * Rule 78 is the boundary this page is drawn inside, and it shows in what is
 * *not* here: no bonus, no total, no stat, no roll. What a voorwerp does is
 * prose on its artikel, and the link on the tile is how you go and read it.
 */
export default async function KamerPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireViewer();
  const { slug } = await params;

  const room = viewRoomBySlug(slug, user);
  if (!room) notFound();

  const words = getWords();
  /*
   * §83: het grootboek is van iedereen die de kamer mag zien — Nick, ronde 44:
   * *"Spelers mogen het 'grootboek' ook wel kunnen inzien."* Alleen het
   * formulier eronder blijft van de Keeper, en dat weet `Grootboek` zelf.
   *
   * De kijker gaat mee omdat een regel die iets gekocht heeft de **naam** van
   * dat artikel draagt: wie hier binnen mag maar dat ding niet mag zien, leest
   * de naam anders alsnog. `ledgerOf` versluiert die regels (§76).
   */
  const lines = ledgerOf(room.id, user);

  /*
   * §84: van wie is deze kamer, en kijkt de Keeper mee?
   *
   * `ownerId` staat al in de `RoomView` (§79) en werd door niets gelezen. Het
   * antwoordt allebei de vragen: de naam boven de kop, en of de hand op deze
   * pagina die van de eigenaar is.
   */
  const ownerName = room.ownerName;
  const isGuest = Boolean(user?.isKeeper) && room.ownerId !== user?.id;
  /*
   * §90: wiens kamer is dit, van waar de kijker staat? Drie antwoorden, en ze
   * zeiden alle drie "je":
   *
   *  - je eigen kamer (`canArrange` en je bent de drager) — "je", de winkel;
   *  - die van een ander (`!canArrange`) — de naam, en géén winkelknop, want
   *    die ging naar jóúw winkel terwijl je in andermans kamer stond;
   *  - de Keeper als gast — hij richt in, maar koopt niet (hij draagt niemand).
   */
  const isOwn = room.canArrange && room.ownerId === user?.id;
  const addressee = isOwn ? null : room.character.name;
  // S14: de eyebrow is een deur naar de spelerspagina van de drager.
  const ownerHref = spelerHref(room.ownerId);
  // S14: wie zelf meer kamers heeft, wisselt hier in één tik.
  const mine = roomsOf(user);

  return (
    <div className="page kamer-page" data-testid="kamer-page" data-room={room.id}>
      {/*
       * §21: this page stands in the kamer. `entries` because a voorwerp on a
       * shelf is an artikel and may be renamed, re-covered or hidden under
       * somebody else's hand; `characters` and `users` because the heading is a
       * name somebody wears and the kamer dies with them (§17/§18).
       */}
      <LivePage place={roomKey(room.id)} watch={['entries', 'users', 'characters']} />

      {/*
        §84: de eyebrow zegt van wíé deze kamer is. Hij zei "Kamer" — net als de
        eyebrow van de winkel en die van de uitdeler — en een kruimelpad dat op
        drie pagina's hetzelfde zegt, zegt niets. De naam van de speler hoort
        hier omdat de kop de *onderzoeker* noemt: dat zijn twee dingen en op een
        spelerspagina staan ze uit elkaar (§77).
      */}
      <p className="eyebrow" data-testid="kamer-eyebrow">
        {ownerName && ownerHref ? (
          <Link href={ownerHref} className="kamer-eyebrow-deur" data-testid="kamer-eyebrow-deur">
            {ownerName}
          </Link>
        ) : (
          (ownerName ?? capitalise(words.room))
        )}
      </p>
      <h1 className="kamer-title">
        <span className="kamer-title-of">{capitalise(words.roomOf)} </span>
        <Link href={`/e/${room.character.slug}`} data-testid="kamer-onderzoeker">
          {room.character.name}
        </Link>
      </h1>

      {/*
        §84: de Keeper staat hier met de knoppen van iemand anders en diens
        beurs, en niets zei dat. Openen betaalt zíj — `unlockSlot` kijkt naar het
        saldo van de kamer en dat is het hare — en neerzetten is gratis (§79:
        cadeau doen kost niets en schrijft geen regel). Dat verschil is precies
        het soort ding dat je één keer per ongeluk doet.
      */}
      {/*
        §90: een kamer die niemand draagt (§86) kreeg dezelfde zin als die van
        een speler — "openen betaalt Adriaan Sinke zelf" — en Adriaan Sinke kan
        niets betalen, want niemand draagt hem. Die kamer heeft zijn eigen zin.
      */}
      {isGuest && (
        <p className="kamer-guest" data-testid="kamer-guest" data-nobody={room.ownerId ? 'nee' : 'ja'}>
          <Icon name={MEANING.onderzoeker} size={14} />
          {room.ownerId ? (
            <span>
              {fill(words.keeperGuest, { naam: ownerName ?? room.character.name })}{' '}
              <span className="muted">
                {fill(words.keeperGuestGift, { naam: ownerName ?? room.character.name })}
              </span>
            </span>
          ) : (
            <span>
              {fill(words.keeperGuestNobody, { naam: room.character.name })}{' '}
              <span className="muted">{words.keeperGuestNobodyGift}</span>
            </span>
          )}
        </p>
      )}

      {/* S14: de wissel tussen je eigen kamers (Kamer van: Cornelis · Jan), alleen voor wie er zelf meer dan één heeft. */}
      {mine.length > 1 && (
        <nav className="row-wrap kamer-wissel" aria-label={words.roomSwitch} data-testid="kamer-wissel">
          <span className="tiny muted kamer-wissel-label">{words.roomSwitch}</span>
          {mine.map((option) => (
            <Link
              key={option.id}
              href={`/kamer/${option.slug}`}
              className={`chip chip-selectable${option.id === room.id ? ' chip-active' : ''}`}
              aria-current={option.id === room.id ? 'page' : undefined}
              data-testid="kamer-wissel-kamer"
              data-room={option.id}
            >
              {option.name}
            </Link>
          ))}
        </nav>
      )}

      <p className="kamer-balance row-wrap" data-testid="kamer-balance" data-balance={room.balance}>
        {/* §84: de beurs, niet nóg een stempel — zie `components/kamer/Beurs.tsx`
            voor waarom wat je hébt er anders uit moet zien dan wat iets kost. */}
        <Beurs balance={room.balance} words={words} />
        {/* §82: naast de beurs, want dat is waar je hem uitgeeft — de winkel
            is de etalage waar deze kamer uit gevuld wordt.
            §90: alleen in je eigen kamer, en de deur draagt déze kamer mee
            (`?kamer=`), anders kocht je voor het karakter dat toevallig
            bovenaan stond. En het is de énige winkelknop op deze pagina (E12). */}
        {isOwn && (
          <Link
            className="btn"
            href={`/winkel?kamer=${encodeURIComponent(room.id)}`}
            data-testid="kamer-winkel"
          >
            <Icon name={MEANING.winkel} size={15} />
            {fill(words.toShop, { winkel: words.shop.toLowerCase() })}
          </Link>
        )}
      </p>

      {/*
        §90 (E8): de Keeper komt hier om te géven, dus het formulier staat
        bovenaan naast de beurs in plaats van onder het hele raster (op een
        telefoon stond het op y≈1500). Het grootboek zelf blijft onderaan.
      */}
      {room.canGrant && <GrantForm roomId={room.id} name={room.character.name} words={words} />}

      {/*
       * §85: wat deze kamer je geeft staat **boven** het raster.
       *
       * Het stond eronder, en op een telefoon betekende dat: twaalf tegels
       * scrollen voor de enige regel die zegt waar al dat sparen goed voor
       * was. Het raster blijft waar de kamer over gaat — maar dit is waar hij
       * *voor* is, en dat hoort boven de vouw. Zie `RoomEffects` voor waarom
       * de lege variant nu ook getekend wordt.
       */}
      <RoomEffects effects={room.effects} words={words} addressee={addressee} />

      {/* §93 (E10): het raster weet wat er verplaatst wordt — `KamerGrid` is de
          `<ul>`, met de staat van *Verplaatsen* eromheen. */}
      <KamerGrid
        label={words.slotPlural}
        targets={room.slots
          .filter((slot) => !slot.locked && !slot.item && !slot.veiled)
          .map((slot) => ({ id: slot.id, kind: slot.kind }))}
        words={words}
      >
        {room.slots.map((slot) => (
          <Plek
            key={slot.id}
            slot={slot}
            roomId={room.id}
            balance={room.balance}
            canArrange={room.canArrange}
            guestOf={isOwn ? null : room.character.name}
            words={words}
          />
        ))}
      </KamerGrid>

      {/*
        §93: de lade — wat deze kamer bezit en nergens heeft staan. Alleen als er
        iets in ligt; neerzetten gaat via *Neerzetten* op een lege plek, waar het
        onder *Wat je al hebt* bovenaan staat.
      */}
      {room.drawer.length > 0 && (
        <section className="kamer-lade" data-testid="kamer-lade" aria-labelledby="kamer-lade-title">
          <h2 id="kamer-lade-title" className="tiny muted kamer-lade-title">
            {words.drawer}
          </h2>
          <ul className="kamer-lade-list">
            {room.drawer.map((thing) => (
              <li key={thing.id} data-testid="kamer-lade-ding" data-entry-id={thing.id}>
                <Link href={`/e/${thing.slug}`}>{thing.name}</Link>
                {thing.count > 1 && <span className="tiny muted"> ×{thing.count}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Grootboek lines={lines} canGrant={room.canGrant} words={words} />
    </div>
  );
}
