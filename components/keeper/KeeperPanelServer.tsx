import { getWords } from '@/lib/admin/words';
import { presenceColour } from '@/lib/boards/live';
import { windowPresenceName } from '@/lib/characters';
import type { SessionUser } from '@/lib/auth/session';
import type { KeeperKind } from '@/lib/keeper/kinds';
import { notesTarget, readKeeperNotes } from '@/lib/keeper/notes';
import { keeperRef } from '@/lib/keeper/side';
import { tiesFor } from '@/lib/keeper/ties';
import { keeperNotesRoomKey } from '@/lib/live/keys';
import { snapshot } from '@/lib/live/docs';
import { admit } from '@/lib/live/rooms';
import { KeeperPanel } from './KeeperPanel';

/**
 * §44: everything the Keeper's corner needs, read on the server, once, for all
 * five kinds.
 *
 * Five pages ask the same four questions — may I see this, is it mine, what is
 * it tied to, where do its notes live — so they are asked in one place. Every
 * one of them goes through the module that owns it (`keeperRef`, `tiesFor`,
 * `notesTarget`), and this file adds no rule of its own.
 *
 * The room key is the one thing here that is not the page's own id. A twin's
 * notes live on the pair's Keeper side, so the key is resolved with
 * `notesTarget` *first*: ask for `keeper:{this page}:notes` on a page whose
 * notes live next door and the gate in `lib/live/rooms.ts` answers null, on
 * purpose — that refusal is what stops one text becoming two.
 */
export function KeeperPanelServer({
  kind,
  id,
  user,
}: {
  kind: KeeperKind;
  id: string;
  user: SessionUser | null;
}) {
  if (!user?.isKeeper) return null;
  const self = keeperRef(kind, id, user);
  if (!self) return null;

  const ties = tiesFor(kind, id, user);
  const target = notesTarget(kind, id);
  const admission = admit(keeperNotesRoomKey(target.kind, target.id), user);
  const live = admission
    ? {
        room: admission.spec.key,
        state: snapshot(admission.spec).state,
        canEdit: admission.canEdit,
        user: {
          // §21: a caret says who is here, so a Keeper is their account name.
          name: windowPresenceName(user, getWords().keeper),
          colour: presenceColour(user.id),
        },
      }
    : null;

  return (
    <KeeperPanel
      kind={kind}
      id={id}
      keeperOnly={self.keeperOnly}
      twin={ties.twin?.other ?? null}
      /* §53: the tie itself, not only where it goes — "Ontkoppelen" needs its id. */
      twinTieId={ties.twin?.id ?? null}
      ropes={ties.ropes.map((tie) => ({ tieId: tie.id, other: tie.other }))}
      notes={readKeeperNotes(kind, id, user)}
      live={live}
    />
  );
}
