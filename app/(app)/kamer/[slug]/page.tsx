import '@/app/kamer.css';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Beurs } from '@/components/kamer/Beurs';
import { Grootboek } from '@/components/kamer/Grootboek';
import { Plek } from '@/components/kamer/Plek';
import { RoomEffects } from '@/components/kamer/RoomEffects';
import { MEANING } from '@/components/kamer/plekWords';
import { LivePage } from '@/components/live/LivePage';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { ledgerOf, viewRoomBySlug } from '@/lib/kamers/service';
import { roomKey } from '@/lib/live/keys';
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
        {ownerName ?? capitalise(words.room)}
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
      {isGuest && (
        <p className="kamer-guest" data-testid="kamer-guest">
          <Icon name={MEANING.onderzoeker} size={14} />
          <span>
            {fill(words.keeperGuest, { naam: ownerName ?? room.character.name })}{' '}
            <span className="muted">
              {fill(words.keeperGuestGift, { naam: ownerName ?? room.character.name })}
            </span>
          </span>
        </p>
      )}

      <p className="kamer-balance row-wrap" data-testid="kamer-balance" data-balance={room.balance}>
        {/* §84: de beurs, niet nóg een stempel — zie `components/kamer/Beurs.tsx`
            voor waarom wat je hébt er anders uit moet zien dan wat iets kost. */}
        <Beurs balance={room.balance} words={words} />
        {/* §82: naast de beurs, want dat is waar je hem uitgeeft — de winkel
            is de etalage waar deze kamer uit gevuld wordt. */}
        <Link className="btn" href="/winkel" data-testid="kamer-winkel">
          <Icon name={MEANING.winkel} size={15} />
          {words.shop}
        </Link>
      </p>

      {/*
       * §85: wat deze kamer je geeft staat **boven** het raster.
       *
       * Het stond eronder, en op een telefoon betekende dat: twaalf tegels
       * scrollen voor de enige regel die zegt waar al dat sparen goed voor
       * was. Het raster blijft waar de kamer over gaat — maar dit is waar hij
       * *voor* is, en dat hoort boven de vouw. Zie `RoomEffects` voor waarom
       * de lege variant nu ook getekend wordt.
       */}
      <RoomEffects effects={room.effects} words={words} />

      <ul className="kamer-grid" data-testid="kamer-grid" aria-label={words.slotPlural}>
        {room.slots.map((slot) => (
          <Plek
            key={slot.id}
            slot={slot}
            roomId={room.id}
            balance={room.balance}
            canArrange={room.canArrange}
            words={words}
          />
        ))}
      </ul>

      <Grootboek roomId={room.id} lines={lines} canGrant={room.canGrant} words={words} />
    </div>
  );
}
