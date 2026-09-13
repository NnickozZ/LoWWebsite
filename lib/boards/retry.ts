/**
 * §61: what a save that did not land should do next.
 *
 * Before this round a save had exactly one answer to trouble: set `error` and
 * stop. A POST that never settled held the in-flight latch for the life of the
 * tab, so every later change said "again" and returned, and the wall went on
 * saying *Opgeslagen* while nothing was being saved at all. And a card the
 * server refused — §50, a reference on the other side of the archive — was kept
 * by the client and posted again with every save afterwards, so one bad card
 * poisoned every later write.
 *
 * Both halves are decided here, pure, so the schedule and the reading of an
 * error body can be tested without a network:
 * `tests/unit/board-sync-retry.test.ts`.
 */

/** A save that has not answered in this long has not answered. */
export const SAVE_TIMEOUT_MS = 10_000;
/** The first wait after a failure; it doubles from there. */
export const RETRY_BASE_MS = 1_000;
/** And never waits longer than this, however long the archive is away. */
export const RETRY_MAX_MS = 15_000;

/**
 * 1 s, 2 s, 4 s, 8 s, 15 s, 15 s… with a little jitter either side, so twenty
 * tabs that lost the same server do not all come back in the same millisecond.
 * `random` is injected for the test; it is `Math.random` everywhere else.
 */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  const step = Math.max(1, Math.floor(attempt));
  const base = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (step - 1));
  // ±15%, which is enough to spread a crowd and not enough to look like a bug.
  const spread = base * 0.3 * (random() - 0.5);
  return Math.max(RETRY_BASE_MS / 2, Math.min(RETRY_MAX_MS, Math.round(base + spread)));
}

/**
 * What went wrong, in the only four flavours the wall can act on.
 *
 * - `network`: nothing answered — the one case that may honestly say
 *   "controleer je verbinding". Retried.
 * - `server`: the archive answered, badly (5xx). Retried, in its own words.
 * - `cards`: the archive refused *named cards* (§50). They leave the local
 *   document and the save is tried again without them.
 * - `terminal`: a reason that will not change by waiting — signed out, not
 *   allowed, the wall is gone. No retry; the sentence is the archive's own.
 */
export type SaveFailure =
  | { kind: 'network'; message: string; retry: true }
  | { kind: 'server'; message: string; retry: true }
  | { kind: 'cards'; message: string; cardIds: string[]; retry: true }
  | { kind: 'terminal'; message: string; retry: false };

/** The one sentence this round is allowed to keep saying about a dead line. */
export const OFFLINE_MESSAGE = 'Niet opgeslagen — controleer je verbinding';

function sentence(message: unknown, fallback: string): string {
  const text = typeof message === 'string' ? message.trim() : '';
  return text ? `Niet opgeslagen. ${text}` : fallback;
}

/**
 * Reads the answer. `status` is null when the fetch itself failed or was
 * aborted by the timeout — that, and nothing else, is a connection problem.
 */
export function classifySaveFailure(input: {
  status: number | null;
  body?: unknown;
}): SaveFailure {
  const body = (input.body ?? {}) as { error?: unknown; code?: unknown; cardIds?: unknown };
  if (input.status === null) return { kind: 'network', message: OFFLINE_MESSAGE, retry: true };

  if (input.status >= 500) {
    return {
      kind: 'server',
      message: sentence(body.error, 'Niet opgeslagen — het archief antwoordde niet.'),
      retry: true,
    };
  }

  // A 4xx that names cards is a 4xx this wall can do something about.
  const cardIds = Array.isArray(body.cardIds)
    ? body.cardIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (input.status < 500 && cardIds.length) {
    return {
      kind: 'cards',
      message: sentence(body.error, 'Niet opgeslagen — die kaart mocht hier niet hangen.'),
      cardIds,
      retry: true,
    };
  }

  if (input.status === 401) {
    return { kind: 'terminal', message: sentence(body.error, 'Niet opgeslagen — log eerst in.'), retry: false };
  }
  return {
    kind: 'terminal',
    message: sentence(body.error, 'Niet opgeslagen — het archief nam dit niet aan.'),
    retry: false,
  };
}
