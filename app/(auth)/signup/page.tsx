import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getWords } from '@/lib/admin/words';
import { siteIdentity } from '@/lib/admin/identity';
import { getSessionUser } from '@/lib/auth/session';
import { fill } from '@/lib/words';
import { formatInvite } from '@/lib/eerste-keer/stappen';
import { AuthForm } from '../AuthForm';
import { Voordeur } from '../Voordeur';

export const dynamic = 'force-dynamic';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getSessionUser()) redirect('/');

  const count = db.select({ n: sql<number>`count(*)` }).from(schema.users).get();
  const isEmpty = (count?.n ?? 0) === 0;
  // §90: the archive's own name on the card, as on the login card and the tab.
  const site = siteIdentity();
  const words = getWords();
  /*
   * §106: the Keeper's invitation link (`/signup?code=…`, from Start or the
   * hall) puts the code in the box. It is only ever echoed back into this
   * browser's own box — nothing is looked up with it and nothing about the
   * real code is said until the form is sent (§89).
   */
  const raw = (await searchParams).code;
  const fromLink = formatInvite(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')).slice(0, 40);

  return (
    <Voordeur stamp={words.doorStamp} signup>
      {/* §106 (na review 4, M12): dezelfde bovenregel als op /login — één regel. */}
      <p className="eyebrow voordeur-eyebrow">{site.tagline || site.name}</p>
      <h1 className="auth-title">{words.doorSignupTitle}</h1>
      {/*
        §89: an empty archive is not an open door. The first Keeper is made by
        `make bootstrap` on the server; until then signing up is refused, and
        this page says why instead of offering the Keeper's chair to whoever
        finds the address first.
      */}
      {isEmpty ? (
        <p className="small voordeur-lead">
          Dit archief is nog niet ingericht. De beheerder moet eerst <code>make bootstrap</code> uitvoeren.
        </p>
      ) : (
        <p className="voordeur-lead">{fill(words.doorSignupLead, { keeper: words.keeper })}</p>
      )}
      <AuthForm
        mode="signup"
        initialCode={fromLink || undefined}
        codeWords={{
          doorCodeLabel: words.doorCodeLabel,
          doorCodeHint: words.doorCodeHint,
          doorCodeFromLink: words.doorCodeFromLink,
        }}
        passwordNote={fill(words.passwordReset, { keeper: words.keeper })}
      />
      <hr className="rule" />
      <p className="small muted" style={{ margin: 0 }}>
        {words.doorHaveAccount} <Link href="/login">{words.doorToLogin}</Link>.
      </p>
    </Voordeur>
  );
}
