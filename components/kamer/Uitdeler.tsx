'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { HandOutTarget } from '@/lib/kamers/service';
import type { Words } from '@/lib/words';
import { munt } from './plekWords';
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
      setReason('');
      setGlobal('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="uitdelen-form" data-testid="uitdelen-form" onSubmit={(event) => void submit(event)}>
      <div className="uitdelen-head">
        <label className="uitdelen-all">
          <span className="small">{words.handoutAll}</span>
          <input
            className="input uitdelen-all-input"
            data-testid="uitdelen-iedereen"
            value={all}
            inputMode="numeric"
            placeholder="3"
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

            <span className="tiny muted uitdelen-saldo" data-testid="uitdelen-saldo">
              {munt(target.balance, words)}
            </span>

            <input
              className="input uitdelen-bedrag"
              data-testid="uitdelen-bedrag"
              aria-label={`${words.handoutAll} — ${target.name}`}
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

      <button
        type="submit"
        className="btn btn-primary uitdelen-knop"
        data-testid="uitdelen-geef"
        data-rooms={summary.rooms}
        disabled={busy || summary.rooms === 0}
      >
        <Icon name="plus" size={14} />
        {words.handout}
        {summary.rooms > 0 && (
          <span className="tiny">
            {' '}
            — {munt(summary.total, words)} / {summary.rooms}
          </span>
        )}
      </button>
    </form>
  );
}
