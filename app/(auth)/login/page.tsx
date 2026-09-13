import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { getSessionUser } from '@/lib/auth/session';
import { AuthForm } from '../AuthForm';

export const dynamic = 'force-dynamic';

/**
 * §63: two doors, and the second one is a door.
 *
 * The road to an account used to be eight grey words at the bottom of the card
 * — "Nieuw hier? Gebruik je uitnodigingscode." — in the same `.small .muted` as
 * the warning above it, with the word that actually described the destination
 * ("uitnodigingscode") standing where a person looks for a *noun*, not a verb.
 * Somebody who had never seen the archive read the login form, failed, and read
 * it again; they did not read the footnote.
 *
 * So the way in is now a panel of its own, below the rule, with its own heading,
 * its own full-width button and the one precondition underneath it. Not a second
 * `btn-primary`: the red stamp on this page is *Inloggen*, which is what the
 * people who already have an account came for, and two red buttons would make
 * the page ask a question instead of answering one. A raised, full-width, dashed
 * panel is loud in shape rather than in colour — and shape is what reads from
 * across the room, which is this archive's whole idea about cards anyway.
 */
export default async function LoginPage() {
  if (await getSessionUser()) redirect('/');

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Zeeland &middot; 1934</p>
        <h1 className="auth-title">Case Files</h1>
        <p className="muted small" style={{ marginBottom: '1.2rem' }}>
          Log in bij het archief.
        </p>
        <AuthForm mode="login" />

        <div className="auth-join">
          <p className="auth-join-head">Nog geen account?</p>
          <Link className="btn auth-join-btn" href="/signup">
            <Icon name="badge" size={16} />
            Registreer je nu
          </Link>
          <p className="auth-join-note">
            Je hebt de uitnodigingscode van je Keeper nodig — die staat in je uitnodiging.
          </p>
        </div>
      </div>
    </main>
  );
}
