import { NextResponse } from 'next/server';
import { NoAuthorError } from '@/lib/auth/author';
import { ForbiddenError, UnauthorizedError } from '@/lib/auth/session';

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
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
  const message = err instanceof Error ? err.message : 'Er is iets misgegaan.';
  return NextResponse.json({ error: message }, { status: 400 });
}
