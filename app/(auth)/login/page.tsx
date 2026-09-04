import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AuthForm } from '../AuthForm';

export const dynamic = 'force-dynamic';

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
        <hr className="rule" />
        <p className="small muted" style={{ margin: 0 }}>
          Nieuw hier? <Link href="/signup">Gebruik je uitnodigingscode</Link>.
        </p>
      </div>
    </main>
  );
}
