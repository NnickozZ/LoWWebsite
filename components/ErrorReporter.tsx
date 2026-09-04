'use client';

import { useEffect } from 'react';

/**
 * Sends browser exceptions to `data/logs` on the server.
 *
 * When a client component throws, React tears down the interactive tree and the
 * page keeps *looking* fine — the Keeper who reported "I could not press any
 * buttons to create new entries" was looking at exactly that. Nothing reaches
 * the server, so the request log shows a healthy site right up to the moment it
 * stopped working.
 *
 * Two listeners cover what React's error boundaries cannot: an exception in an
 * event handler or a timer (`error`), and a promise nobody awaited
 * (`unhandledrejection`) — which is what a failed `fetch` becomes.
 */
export function report(payload: {
  kind: string;
  message: string;
  stack?: string;
  componentStack?: string;
}) {
  try {
    const body = JSON.stringify({ ...payload, url: window.location.href });
    // `keepalive` so a report survives the navigation that an error often
    // triggers; a plain fetch would be cancelled on the way out.
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* reporting must never be the thing that throws */
  }
}

export function ErrorReporter() {
  useEffect(() => {
    // The same error can fire repeatedly — a broken render loop, a timer — and
    // a browser must not be able to write a thousand identical lines.
    const seen = new Set<string>();
    const once = (key: string) => {
      if (seen.has(key) || seen.size > 20) return false;
      seen.add(key);
      return true;
    };

    const onError = (event: ErrorEvent) => {
      const message = event.message || String(event.error);
      if (!once(`e:${message}`)) return;
      report({
        kind: 'uncaught exception',
        message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      if (!once(`r:${message}`)) return;
      report({
        kind: 'unhandled promise rejection',
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
