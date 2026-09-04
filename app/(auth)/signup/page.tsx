import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';
import { AuthForm } from '../AuthForm';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  if (await getSessionUser()) redirect('/');

  const count = db.select({ n: sql<number>`count(*)` }).from(schema.users).get();
  const isFirst = (count?.n ?? 0) === 0;

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Zeeland &middot; 1934</p>
        <h1 className="auth-title">Word lid van het archief</h1>
        {isFirst ? (
          <p className="small" style={{ marginBottom: '1.2rem' }}>
            Er heeft zich nog niemand ingeschreven, dus dit eerste account wordt de <strong>Keeper</strong>.
          </p>
        ) : (
          <p className="muted small" style={{ marginBottom: '1.2rem' }}>
            Je hebt de uitnodigingscode van je Keeper nodig.
          </p>
        )}
        <AuthForm mode="signup" />
        <hr className="rule" />
        <p className="small muted" style={{ margin: 0 }}>
          Al ingeschreven? <Link href="/login">Inloggen</Link>.
        </p>
      </div>
    </main>
  );
}
