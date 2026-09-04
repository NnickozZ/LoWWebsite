import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { getSessionUser } from '@/lib/auth/session';
import { relativeTime } from '@/lib/diff';
import { listMyProposals } from '@/lib/entries/review';
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

  return (
    <div className="page">
      <p className="eyebrow">Jouw account</p>
      <h1>{user?.username}</h1>
      {user?.isKeeper && (
        <p className="row-wrap">
          <span className="stamp">Keeper</span>
          <Link className="btn btn-small" href="/admin">
            <Icon name="shield" size={15} />
            Beheer
          </Link>
        </p>
      )}

      {proposals.length > 0 && (
        <>
          <hr className="rule" />
          <h2>Jouw voorstellen</h2>
          <p className="small muted">
            Bewerkingen die je op een vergrendelde fiche hebt voorgesteld.
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
