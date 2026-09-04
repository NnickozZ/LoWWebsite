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
