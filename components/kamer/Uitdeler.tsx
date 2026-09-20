'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useHoldRefresh } from '@/components/live/refreshHold';
import { useUi } from '@/components/ui/UiProvider';
import type { HandOutTarget } from '@/lib/kamers/service';
import { fill, type Words } from '@/lib/words';
import { MEANING, munt } from './plekWords';
import { kamerPost } from './post';

/**
 * §83: de uitdeler — één getal bovenaan, één reden, en één regel per kamer.
 *
 * Nick, ronde 44: *"dat ze dan gewoon de namen van de spelers invullen en dan
 * iedereen x aantal munten geeft omdat ze samen wat gedaan hebben. Een globale
 * munten aantal in deze 'gever' en dan per persoon kun je het nog aanpassen.
 * Als je het globale nummer weer aanpast dan reset alles naar dat."*
 *
 * Three things about the shape, and each of them is a decision rather than a
 * detail.
 *
 * **Typing in the global box overwrites every amount below it**, including the
 * ones that were just typed by hand. That is exactly what was asked for, and it
 * is the sort of behaviour that has to be obvious while it happens: the boxes
 * all move at once, under the hand that is still on the global box.
 *
 * **The tick and the amount are two different questions.** The tick is *who*,
 * the amount is *how much*, and the global number only ever touches the second
 * one — otherwise setting everyone to 3 would quietly re-invite somebody who
 * had been deliberately left out. Unticking, and typing a 0, both mean *deze
 * niet*: they agree rather than fight, so neither is a trap.
 *
 * **It is one button and one reason.** An uitdeling is one thing that happened
 * at the table, so it writes one sentence into every grootboek it touches, and
 * `handOut` writes them in a single transaction — either everyone gets theirs
 * or nobody does. Half an uitdeling cannot be seen from this screen, and that
 * is precisely why it may not be allowed to exist.
 *
 * Like `GrantForm`, this is an ordinary controlled form rather than
 * `useActionState`: what was typed has to survive a refusal (§63), and a form
 * that owns its own state has nothing to reset.
 *
 * **§85 gave it a foot, a stripe and a verdict.**
 *
 * The screen was right and unreadable. The sum of what you were about to do
 * was a `.tiny` span glued onto the end of the button — *Uitdelen — 36 munten
 * / 12* — which is the one number a Keeper checks before pressing, written
 * smaller than everything else on the page and phrased as a fraction. It is
 * now a sentence in a sticky foot that is on screen whatever you have scrolled
 * to, which on a table of twelve is the difference between reading it and
 * taking the button's word for it. The rows got zebra stripes for the ordinary
 * reason — four columns of digits without them is a place to lose your line —
 * and the saldo moved next to the box, because "what have they got" and "what
 * am I giving them" is one question asked twice and the answers were at
 * opposite ends of the row.
 *
 * And it says when it is done. A toast is gone in four seconds and this is a
 * thing you do once an evening: the button holds *Uitgedeeld* for a beat and a
 * door to the hall appears beside it, because after handing out the next thing
 * anybody wants is to look at what everyone has.
 */
export function Uitdeler({ targets, words }: { targets: HandOutTarget[]; words: Words }) {
  const ui = useUi();
  const router = useRouter();

  const [all, setAll] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(targets.map((target) => [target.roomId, ''])),
  );
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(targets.map((target) => [target.roomId, true])),
  );
  /** §85: de knop houdt zijn uitkomst even vast. Zie de docblock hierboven. */
  const [done, setDone] = useState(false);

  /*
   * §59: niets landt terwijl hier een half ingevuld formulier staat. Een
   * uitdeling is twaalf vakjes en een reden, en een `router.refresh()` van een
   * speler die ergens anders iets koopt zou daar dwars doorheen komen.
   */
  useHoldRefresh(Boolean(all.trim() || reason.trim() || busy));

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 4000);
    return () => clearTimeout(timer);
  }, [done]);

  /** What the button says it is about to do — the same sum `handOut` will write. */
  const summary = useMemo(() => {
    let rooms = 0;
    let total = 0;
    for (const target of targets) {
      if (!on[target.roomId]) continue;
      const delta = Number(String(amounts[target.roomId] ?? '').trim());
      if (!Number.isFinite(delta) || delta === 0) continue;
      rooms += 1;
      total += delta;
    }
    return { rooms, total };
  }, [targets, amounts, on]);

  /**
   * The reset Nick asked for, and it is deliberately blunt: every row takes the
   * new number, whatever was in it.
   */
  function setGlobal(value: string) {
    setAll(value);
    setAmounts(Object.fromEntries(targets.map((target) => [target.roomId, value])));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const rows = targets
        .filter((target) => on[target.roomId])
        .map((target) => ({ roomId: target.roomId, delta: amounts[target.roomId] ?? '' }));
      const error = await kamerPost('/api/kamers/uitdelen', { rows, reason });
      if (error) {
        ui.toast(error);
        return;
      }
      ui.toast(words.handoutDone);
      setDone(true);
      setReason('');
      setGlobal('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form data-testid="uitdelen-form" onSubmit={(event) => void submit(event)}>
      <div className="uitdelen-head">
        <label className="uitdelen-all">
          <span className="small">{words.handoutAll}</span>
          <input
            className="input uitdelen-all-input"
            data-testid="uitdelen-iedereen"
            value={all}
            inputMode="numeric"
            /*
             * §85: leeg, niet "3". Een placeholder van een getal in een vak
             * waar een getal in moet leest als een waarde die er al staat —
             * en het vak eronder zegt dan 0 terwijl je denkt dat het 3 is.
             */
            placeholder=""
            readOnly={busy}
            onChange={(event) => setGlobal(event.target.value)}
          />
        </label>

        <label className="uitdelen-why">
          <span className="small">{words.handoutWhy}</span>
          <input
            className="input"
            data-testid="uitdelen-reden"
            value={reason}
            placeholder={words.handoutWhy}
            readOnly={busy}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      </div>

      <p className="tiny muted uitdelen-hint">{words.handoutHint}</p>

      <ul className="uitdelen-lijst" aria-label={words.handoutTitle}>
        {targets.map((target) => (
          <li key={target.roomId} className="uitdelen-rij" data-testid="uitdelen-rij" data-room={target.roomId}>
            <label className="uitdelen-wie">
              <input
                type="checkbox"
                data-testid="uitdelen-aan"
                checked={on[target.roomId] ?? false}
                disabled={busy}
                onChange={(event) =>
                  setOn((prev) => ({ ...prev, [target.roomId]: event.target.checked }))
                }
              />
              <span>
                <strong>{target.name}</strong>{' '}
                {/* §83: de naam die Nick zoekt staat erbij, maar de beurs is van
                    de onderzoeker — wie er twee draagt heeft er twee. */}
                <span className="tiny muted">({target.player})</span>
              </span>
            </label>

            {/* §85: het saldo staat naast het vakje en niet aan de andere kant
                van de rij — wat iemand heeft en wat je die geeft is één vraag,
                twee keer gesteld, en de antwoorden stonden op de uiteinden. */}
            <span className="tiny muted uitdelen-saldo" data-testid="uitdelen-saldo">
              {munt(target.balance, words)}
            </span>

            <input
              className="input uitdelen-bedrag"
              data-testid="uitdelen-bedrag"
              aria-label={`${words.handoutAmount} — ${target.name}`}
              value={amounts[target.roomId] ?? ''}
              inputMode="numeric"
              placeholder="0"
              readOnly={busy}
              onChange={(event) =>
                setAmounts((prev) => ({ ...prev, [target.roomId]: event.target.value }))
              }
            />
          </li>
        ))}
      </ul>

      {/*
        §85: de voet plakt, want het totaal is het enige wat je nog nakijkt.
        Op een tafel van twaalf staat de knop anders onder de vouw en lees je
        de som niet meer; hier staat hij naast de knop die hem gaat uitvoeren.
        Hij telt op wat er in déze vakjes staat en nooit iets uit het archief
        (rule 78) — het is een echo van je eigen hand, geen bevinding.
      */}
      <div className="uitdelen-voet">
        <p className="small uitdelen-totaal" data-testid="uitdelen-totaal" data-total={summary.total}>
          {summary.rooms > 0
            ? fill(words.handoutRunning, {
                munten: munt(summary.total, words),
                kamers: `${summary.rooms} ${summary.rooms === 1 ? words.room : words.roomPlural}`,
              })
            : ''}
        </p>

        <span className="row-wrap uitdelen-voet-knoppen">
          {done && (
            <Link className="btn btn-small" href="/spelers" data-testid="uitdelen-naar-spelers">
              <Icon name={MEANING.onderzoeker} size={13} />
              {fill(words.toPlayers, { spelers: words.playerPlural })}
            </Link>
          )}
          <button
            type="submit"
            className="btn btn-primary uitdelen-knop"
            data-testid="uitdelen-geef"
            data-rooms={summary.rooms}
            disabled={busy || summary.rooms === 0}
          >
            <Icon name={MEANING.geven} size={14} />
            {done ? words.handoutDoneShort : words.handout}
          </button>
        </span>
      </div>
    </form>
  );
}
