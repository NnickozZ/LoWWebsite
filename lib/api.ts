import { NextResponse } from 'next/server';
import { NoAuthorError } from '@/lib/auth/author';
import { ForbiddenError, UnauthorizedError } from '@/lib/auth/session';
import { logEvent } from '@/lib/diagnostics';
import { InkRefused } from '@/lib/ink/service';
import { KamerError } from '@/lib/kamers/service';

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/**
 * §89: which errors may speak to the browser in their own words.
 *
 * Every refusal in this archive is written as a plain `new Error('…')` with a
 * Dutch sentence meant for a person ("Je mag dit dossier niet bewerken.") —
 * or as one of the few named refusals below. Those are passed on as they are.
 *
 * Everything else is *not* a sentence for a person: a `SqliteError` names the
 * table and column that clashed, a `SyntaxError` from `request.json()` quotes
 * what was posted, a `TypeError` names the code that tripped. Echoing those
 * handed anybody who asked a plan of the database. They are logged in full to
 * `data/logs` (where a Keeper can find them by the time in the answer) and
 * the browser is told only that something went wrong.
 *
 * A new refusal is therefore a plain `Error`. A new `class … extends Error`
 * speaks only once it is added to `SPOKEN` here.
 */
const SPOKEN: (abstract new (...args: never[]) => Error)[] = [KamerError, InkRefused];

function speaks(err: Error): boolean {
  if (err.constructor === Error) return true;
  return SPOKEN.some((kind) => err instanceof kind);
}

export function apiError(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: 'Log eerst in.' }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: 'Alleen voor Keepers.' }, { status: 403 });
  }
  if (err instanceof NoAuthorError) {
    // §18b: not a failure, a question. `needsAuthor` is what tells the browser
    // to ask "Met wie ben je nu aan het schrijven?" instead of showing an error.
    return NextResponse.json({ error: err.message, needsAuthor: true }, { status: 400 });
  }
  if (err instanceof Error && speaks(err)) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  // A body that is not JSON is the caller's mistake, not ours: still a 400,
  // still without quoting what was sent.
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: 'Dat verzoek kon niet gelezen worden.' }, { status: 400 });
  }
  logEvent('error', 'api: an error that is not a sentence for a person', err instanceof Error ? err : { err: String(err) });
  return NextResponse.json({ error: 'Er is iets misgegaan.' }, { status: 500 });
}
