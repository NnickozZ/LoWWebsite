'use client';

import { useEffect } from 'react';
import { report } from '@/components/ErrorReporter';

/**
 * The last resort: an error thrown so high up that the layout itself is gone.
 * Next replaces the whole document with this, so it carries its own <html>.
 *
 * It exists to do one thing the default white screen does not: write the error
 * down where a Keeper can find it, and show the digest, which is the only handle
 * on the matching line in `data/logs` once a production build has stripped the
 * message.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    report({
      kind: 'render error (global)',
      message: `${error.message}${error.digest ? ` [digest ${error.digest}]` : ''}`,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html lang="nl">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          maxWidth: '32rem',
          margin: '4rem auto',
          padding: '0 1.5rem',
          lineHeight: 1.6,
        }}
      >
        <h1 style={{ fontSize: '1.4rem' }}>Het archief struikelde.</h1>
        <p>
          Er is iets misgegaan waar de pagina niet omheen kon. Het is opgeschreven in het logboek
          van de server.
        </p>
        {error.digest && (
          <p style={{ color: '#666', fontSize: '0.9rem' }}>
            Kenmerk: <code>{error.digest}</code>
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{ padding: '0.5rem 1rem', fontSize: '1rem', cursor: 'pointer' }}
        >
          Opnieuw proberen
        </button>
      </body>
    </html>
  );
}
