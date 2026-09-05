import Link from 'next/link';
import { LivePage } from '@/components/live/LivePage';
import { Icon } from '@/components/Icon';
import { CharacterWardrobe } from '@/components/you/CharacterSwitcher';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { activeCharacter, listCharacters } from '@/lib/characters';
import { relativeTime } from '@/lib/diff';
import { listMyProposals } from '@/lib/entries/review';
import { ArticleModeForm } from './ArticleModeForm';
import { ChangePasswordForm } from './ChangePasswordForm';
import { logoutAction, logoutEverywhereAction } from './actions';

export const dynamic = 'force-dynamic';

const PROPOSAL_STATUS: Record<string, string> = {
  pending: 'In behandeling',
  approved: 'Goedgekeurd',
  rejected: 'Afgewezen',
};

export default async function YouPage() {
  const user = await getSessionUser();
  // §10: a locked entry sends a player's edit to the Keeper. This is where they
  // find out what came of it, and read the Keeper's note back.
  const proposals = user ? listMyProposals(user.id) : [];
  const words = getWords();

  // §18: the wardrobe. A Keeper's is empty by rule, not by accident.
  const me = user
    ? {
        id: user.id,
        username: user.username,
        isKeeper: user.isKeeper,
        characters: user.isKeeper ? [] : listCharacters(user.id),
        activeId: user.isKeeper ? null : (activeCharacter(user.id)?.entryId ?? null),
      }
    : null;
  const worn = me?.characters.find((c) => c.entryId === me.activeId) ?? null;

  return (
    <div className="page">
      <LivePage place="page:/you" watch={['characters', 'users', 'entries']} />
      <p className="eyebrow">Jouw account</p>
      <h1>{user?.username}</h1>
      {user?.isKeeper && (
        <p className="row-wrap">
          <span className="stamp">{words.keeper}</span>
          <Link className="btn btn-small" href="/admin">
            <Icon name="shield" size={15} />
            {words.navAdmin}
          </Link>
        </p>
      )}
      {worn && (
        <p className="small muted" style={{ marginTop: 0 }}>
          {words.playsAs} <strong>{worn.name}</strong>.
        </p>
      )}

      {me && (
        <>
          <hr className="rule" />
          <h2 id="karakters">{words.yourCharacters}</h2>
          <CharacterWardrobe me={me} />
        </>
      )}

      {proposals.length > 0 && (
        <>
          <hr className="rule" />
          <h2>Jouw voorstellen</h2>
          <p className="small muted">
            Bewerkingen die je op een vergrendeld {words.entry} hebt voorgesteld.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {proposals.map((proposal) => (
              <li
                key={proposal.id}
                style={{ borderBottom: '1px solid var(--rule)', padding: '0.5rem 0' }}
              >
                <div className="row-wrap">
                  <span
                    className={`chip${proposal.status === 'rejected' ? '' : ' chip-active'}`}
                  >
                    {PROPOSAL_STATUS[proposal.status] ?? proposal.status}
                  </span>
                  <Link href={`/e/${proposal.entrySlug}`} style={{ flex: 1, minWidth: 0 }}>
                    {proposal.entryName}
                  </Link>
                  <span className="tiny muted">
                    {relativeTime(proposal.reviewedAt ?? proposal.createdAt)}
                  </span>
                </div>
                {proposal.reviewNote && (
                  <p className="small" style={{ margin: '0.3rem 0 0', fontStyle: 'italic' }}>
                    “{proposal.reviewNote}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {user && (
        <>
          <hr className="rule" />
          <h2 id="lezen-of-bewerken">Lezen of bewerken</h2>
          <p className="small muted">
            Hoe een {words.entry} opengaat als je erop klikt.
          </p>
          <ArticleModeForm current={user.articleMode} isKeeper={user.isKeeper} />
        </>
      )}

      <hr className="rule" />

      <h2>Wachtwoord wijzigen</h2>
      <ChangePasswordForm />

      <hr className="rule" />

      <div className="row-wrap">
        <form action={logoutAction}>
          <button className="btn" type="submit">
            Uitloggen
          </button>
        </form>
        <form action={logoutEverywhereAction}>
          <button className="btn btn-ghost" type="submit">
            Overal uitloggen
          </button>
        </form>
      </div>

      <p className="tiny muted" style={{ marginTop: '1.5rem' }}>
        De Keeper kan je wachtwoord terughalen als je het vergeet. Gebruik geen wachtwoord dat je
        ook ergens anders gebruikt.
      </p>
    </div>
  );
}
