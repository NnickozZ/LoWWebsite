import Link from 'next/link';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import type { SlotView } from '@/lib/kamers/service';
import type { Words } from '@/lib/words';
import { ClearButton } from './ClearButton';
import { PlaceButton } from './PlaceButton';
import { UnlockButton } from './UnlockButton';
import { munt, plekIcon, plekWord } from './plekWords';

export type PlekState = 'locked' | 'empty' | 'filled' | 'veiled';

/** Which of the four things this plek is. `veiled` is asked first: it is a *filled* plek. */
export function plekState(slot: SlotView): PlekState {
  if (slot.veiled) return 'veiled';
  if (slot.locked) return 'locked';
  return slot.item ? 'filled' : 'empty';
}

/**
 * §79: one plek, in one of four states, and each has to read differently at a
 * glance — which is the whole of this file's job.
 *
 *  - **locked** — its kind, its price, and a button for a hand that may spend.
 *    The price is there for *everybody*, including somebody who will never buy
 *    it: a kamer that shows only what you already own gives you nothing to look
 *    at and nothing to save up for.
 *  - **empty** — its kind, and a way in for a hand that may arrange.
 *  - **filled** — the voorwerp's own cover and name, linking to its artikel,
 *    because a voorwerp *is* an artikel (rule 3 of the round) and this is not a
 *    second place where it lives.
 *  - **veiled** — `words.slotVeiled`, and nothing else.
 *
 * That last one is §76's rule standing in a new place and it is the most
 * important line on the page. A plek holding something the looker may not see
 * is drawn **filled and nameless**: no name, no picture, no link, no kind, no
 * price, no button, and the same single phrase whether the voorwerp is
 * Keeper-only (§9) or on the other side (§44). Two things are being kept apart
 * here and both matter — showing it as *empty* would be a lie the owner never
 * told, and showing it as *anything more* would leak. The variation itself is
 * what leaks, which is why even the kind is left off: it is the one difference
 * that would let two veiled plekken be told apart, and nothing on this screen
 * needs that.
 *
 * The four states are distinguished by shape and by a dashed-or-solid rule in
 * `app/kamer.css`, never by a colour of their own: §45 has four colour schemes
 * and a Keeperkant on top of them.
 */
export function Plek({
  slot,
  roomId,
  balance,
  canArrange,
  words,
}: {
  slot: SlotView;
  roomId: string;
  balance: number;
  canArrange: boolean;
  words: Words;
}) {
  const state = plekState(slot);

  /*
   * The veiled plek returns early and on purpose: there is no shared frame to
   * fall through into, because every line of the frame below it (the kind, the
   * icon, the price, the buttons) is a thing this state may not say. An early
   * return is harder to add a leak to than a conditional inside a body.
   */
  if (state === 'veiled') {
    return (
      <li
        className="plek plek-veiled"
        data-testid="plek"
        data-state="veiled"
        data-plek={slot.id}
        data-sort={slot.sortOrder}
      >
        <p className="small plek-veiled-line" data-testid="plek-veiled">
          {words.slotVeiled}
        </p>
      </li>
    );
  }

  const kind = plekWord(slot.kind, words);

  return (
    <li
      className={`plek plek-${state}`}
      data-testid="plek"
      data-state={state}
      data-kind={slot.kind}
      data-plek={slot.id}
      data-sort={slot.sortOrder}
    >
      <p className="tiny plek-kind" data-testid="plek-kind">
        <Icon name={plekIcon(slot.kind)} size={12} />
        {kind}
      </p>

      {state === 'locked' && (
        <>
          <p className="plek-price" data-testid="plek-price" data-price={slot.price}>
            <span className="stamp">{munt(slot.price, words)}</span>
          </p>
          <p className="tiny muted plek-locked-line">{words.slotLocked}</p>
          {canArrange && (
            <UnlockButton
              roomId={roomId}
              slotId={slot.id}
              label={words.slotOpen}
              affordable={balance >= slot.price}
              short={`Je hebt nog ${munt(slot.price - balance, words)} nodig.`}
            />
          )}
        </>
      )}

      {state === 'empty' && (
        <>
          <p className="tiny muted plek-empty-line" data-testid="plek-empty">
            {words.slotEmpty}
          </p>
          {canArrange && (
            <PlaceButton
              roomId={roomId}
              slotId={slot.id}
              kind={slot.kind}
              kindLabel={kind}
              label={words.slotPlace}
            />
          )}
        </>
      )}

      {state === 'filled' && slot.item && (
        <>
          <Link className="plek-item" data-testid="plek-item" href={`/e/${slot.item.slug}`}>
            <Cover
              assetId={slot.item.coverAssetId}
              crop={slot.item.coverCrop}
              shape="portrait"
              alt=""
              icon={slot.item.typeIcon}
              colour={slot.item.typeColour}
              variant="thumb"
              className="plek-cover"
            />
            <span className="small plek-item-name">{slot.item.name}</span>
          </Link>
          {canArrange && <ClearButton roomId={roomId} slotId={slot.id} label={words.slotClear} />}
        </>
      )}
    </li>
  );
}
