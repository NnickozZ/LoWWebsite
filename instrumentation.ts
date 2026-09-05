import type { Instrumentation } from 'next';

/**
 * Next.js runs `register()` once when the server starts, before any request,
 * and calls `onRequestError` for every error thrown on the server — in a page,
 * a layout, a route handler or a server action. It is the only place that sees
 * all of them, which is why the diagnostics hang off it rather than off a
 * try/catch in each route.
 *
 * The import is dynamic because this file is also loaded in the edge runtime,
 * where `node:fs` does not exist.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { installProcessHandlers } = await import('./lib/diagnostics');
  installProcessHandlers();

  /**
   * §27: fill `entry_mentions` in the first time a server that has it opens an
   * archive that does not. It is a *derived* table — every row is rebuilt from
   * its source on save — so an empty one is not a state, it is a table that has
   * never been built, and nobody is going to re-save four hundred dossiers by
   * hand to build it. This is next to the migrations in spirit but not in
   * `migrations.mjs`: reading a board's cards or a dossier's notes needs
   * `normaliseState` and `extractEntryLinks`, which are TypeScript the `.mjs`
   * files may not import (rule 4), and a second reading of those documents
   * written in plain JS is exactly how two readings start to disagree.
   *
   * A failure here must not stop the server: "Genoemd in" is thinner than it
   * should be, which is a great deal better than an archive that will not open.
   */
  try {
    const { ensureMentionsBackfilled } = await import('./lib/entries/mentions');
    if (ensureMentionsBackfilled()) {
      const { logEvent } = await import('./lib/diagnostics');
      logEvent('info', 'entry_mentions was empty and has been rebuilt from the archive');
    }
  } catch (err) {
    const { logEvent } = await import('./lib/diagnostics');
    logEvent('error', 'could not build entry_mentions at start-up', {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { logEvent } = await import('./lib/diagnostics');

  logEvent('error', `server error in ${context.routerKind} ${context.routePath}`, {
    where: `${context.routeType} (${context.renderSource ?? 'n/a'})`,
    method: request.method,
    path: request.path,
    // A server action failing is the "the button did nothing" case, so it is
    // worth naming explicitly rather than leaving it in `routeType`.
    action: request.headers?.['next-action'] ? 'server action' : undefined,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
};
