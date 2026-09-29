import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { siteIdentity } from '@/lib/admin/identity';
import { safeReturnPath } from '@/lib/auth/paths';
import { getSessionUser } from '@/lib/auth/session';
import { getWords } from '@/lib/admin/words';
import { fill } from '@/lib/words';
import { AuthForm } from '../AuthForm';
import { Voordeur } from '../Voordeur';

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
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // §90: where the voordeur stopped them (the middleware's `?next=`). Vetted
  // here too, because a signed-in browser is sent straight on.
  const raw = (await searchParams).next;
  const next = safeReturnPath(Array.isArray(raw) ? raw[0] : raw);
  if (await getSessionUser()) redirect(next);

  // §90: the card says the archive's own name — the same reading the browser
  // tab has used since §88, and no session needed for it.
  const site = siteIdentity();

  const words = getWords();

  return (
    // §106: de toegangskaart (`Voordeur`); het formulier is dat van §63.
    <Voordeur stamp={words.doorStamp}>
      {site.tagline && <p className="eyebrow voordeur-eyebrow">{site.tagline}</p>}
      <h1 className="auth-title">{site.name}</h1>
      <p className="voordeur-lead">{words.doorLoginLead}</p>
      <AuthForm mode="login" next={next === '/' ? undefined : next} />

      <div className="auth-join">
        <p className="auth-join-head">{words.doorJoinHead}</p>
        <Link className="btn auth-join-btn" href="/signup">
          <Icon name="badge" size={16} />
          {words.doorJoinButton}
        </Link>
        <p className="auth-join-note">{fill(words.doorJoinNote, { keeper: words.keeper })}</p>
      </div>
    </Voordeur>
  );
}
