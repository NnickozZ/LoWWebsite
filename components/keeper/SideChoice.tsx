'use client';

import { Icon } from '@/components/Icon';
import type { Words } from '@/lib/words';

/**
 * §48: which side a thing is being born on, said out loud at the moment it is
 * made.
 *
 * Until round 25 nothing said it, because nothing *did* it: every record was
 * born on the players' side and the switch on the finished page was the only
 * way over. A Keeper standing on their own side, in their own dossier, made a
 * prikbord the whole table could read — and the only tell was the palette,
 * which had not changed, because the page they were on had not changed either.
 *
 * So the answer is here, one line, in every sheet that makes something: a
 * tickbox that is already ticked where the archive would tick it, and a
 * sentence saying what that means. Two rules it draws:
 *
 *   - **Nobody but a Keeper ever sees it.** `show` is false for a player and
 *     for a Keeper looking through a player's eyes, and then this renders
 *     nothing at all — not a disabled control, nothing (§44's habit: absent,
 *     never hidden).
 *   - **A container can take the choice away.** Something made inside a
 *     Keeper-only dossier is the Keeper's whatever anybody ticks, because the
 *     dossier's *name* travels with it into lists a player reads. Then the box
 *     is ticked, switched off, and says why.
 */
export function SideChoice({
  show,
  keeper,
  locked,
  lockedWhy,
  onChange,
  words,
}: {
  /** §44: a real Keeper, not looking as a player. False renders nothing. */
  show: boolean;
  keeper: boolean;
  /** The answer is not this hand's to give — see above. */
  locked?: boolean;
  lockedWhy?: string;
  onChange: (keeper: boolean) => void;
  words: Words;
}) {
  if (!show) return null;
  return (
    <label
      className="field row side-choice"
      style={{ gap: '0.5rem', alignItems: 'flex-start' }}
      data-testid="side-choice"
    >
      <input
        type="checkbox"
        checked={keeper}
        disabled={locked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="row" style={{ gap: '0.35rem' }}>
          <Icon name="eyeOff" size={14} />
          {`Alleen op de ${words.keeperSide}`}
        </span>
        <span className="tiny muted" style={{ display: 'block' }}>
          {locked
            ? (lockedWhy ?? `Dit kan hier niet anders.`)
            : keeper
              ? 'De tafel ziet dit niet.'
              : 'Iedereen die het archief mag lezen ziet dit.'}
        </span>
      </span>
    </label>
  );
}
