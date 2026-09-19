import '@/app/kamer.css';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Grootboek } from '@/components/kamer/Grootboek';
import { Plek } from '@/components/kamer/Plek';
import { RoomEffects } from '@/components/kamer/RoomEffects';
import { munt } from '@/components/kamer/plekWords';
import { LivePage } from '@/components/live/LivePage';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { ledgerOf, viewRoomBySlug } from '@/lib/kamers/service';
import { roomKey } from '@/lib/live/keys';
import { capitalise } from '@/lib/words';

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
 * (not a canvas, not an illustration), and — for a Keeper only — the grootboek
 * that the balance is the sum of.
 *
 * Rule 78 is the boundary this page is drawn inside, and it shows in what is
 * *not* here: no bonus, no total, no stat, no roll. What a voorwerp does is
 * prose on its artikel, and the link on the tile is how you go and read it.
 */
export default async function KamerPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser();
  const { slug } = await params;

  const room = viewRoomBySlug(slug, user);
  if (!room) notFound();

  const words = getWords();
  // §9: the grootboek is the Keeper's, so it is not even read for anybody else.
  const lines = room.canGrant ? ledgerOf(room.id) : [];

  return (
    <div className="page kamer-page" data-testid="kamer-page" data-room={room.id}>
      {/*
       * §21: this page stands in the kamer. `entries` because a voorwerp on a
       * shelf is an artikel and may be renamed, re-covered or hidden under
       * somebody else's hand; `characters` and `users` because the heading is a
       * name somebody wears and the kamer dies with them (§17/§18).
       */}
      <LivePage place={roomKey(room.id)} watch={['entries', 'users', 'characters']} />

      <p className="eyebrow">{capitalise(words.room)}</p>
      <h1 className="kamer-title">
        <span className="kamer-title-of">{capitalise(words.roomOf)} </span>
        <Link href={`/e/${room.character.slug}`} data-testid="kamer-onderzoeker">
          {room.character.name}
        </Link>
      </h1>

      <p className="kamer-balance row-wrap" data-testid="kamer-balance" data-balance={room.balance}>
        <span className="stamp">{munt(room.balance, words)}</span>
        {/* §82: naast de beurs, want dat is waar je hem uitgeeft — de winkel
            is de etalage waar deze kamer uit gevuld wordt. */}
        <Link className="btn btn-small" href="/winkel" data-testid="kamer-winkel">
          <Icon name="box" size={14} />
          {words.shop}
        </Link>
      </p>

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

      {/*
       * §80: wat er in deze kamer ligt en wat het zegt dat het doet — onder
       * het raster, want het raster is waar de kamer over gaat en dit is wat
       * eruit volgt. Een lijst en nooit een optelling (rule 78): zie
       * `RoomEffects`. Staat er niets, dan staat er ook geen kop.
       */}
      <RoomEffects effects={room.effects} words={words} />

      {room.canGrant && <Grootboek roomId={room.id} lines={lines} words={words} />}
    </div>
  );
}
