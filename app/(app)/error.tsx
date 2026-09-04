'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { report } from '@/components/ErrorReporter';

/**
 * A page inside the archive failed to render. The shell — navigation, the
 * Keeper's tools — survives, so this only replaces the page itself.
 *
 * Before this existed, a throw here left React with no tree to update and every
 * button on the page stopped responding with nothing said. Now it is written to
 * `data/logs` and the person is told, which is the difference between "the site
 * is broken" and a line somebody can act on.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    report({
      kind: 'render error',
      message: `${error.message}${error.digest ? ` [digest ${error.digest}]` : ''}`,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="page">
      <div className="empty" style={{ textAlign: 'left' }}>
        <h1 style={{ margin: '0 0 0.4rem', fontSize: '1.3rem' }}>Deze pagina liep vast.</h1>
        <p className="small" style={{ margin: '0 0 0.8rem' }}>
          De rest van het archief werkt nog. Wat er misging staat in het logboek van de server.
        </p>
        {error.digest && (
          <p className="tiny muted" style={{ margin: '0 0 0.8rem' }}>
            Kenmerk: <code>{error.digest}</code>
          </p>
        )}
        <div className="row-wrap">
          <button type="button" className="btn btn-small btn-primary" onClick={reset}>
            Opnieuw proberen
          </button>
          <Link className="btn btn-small btn-ghost" href="/">
            Naar het begin
          </Link>
        </div>
      </div>
    </div>
  );
}
