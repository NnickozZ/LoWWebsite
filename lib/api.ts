import { NextResponse } from 'next/server';
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
  const message = err instanceof Error ? err.message : 'Er is iets misgegaan.';
  return NextResponse.json({ error: message }, { status: 400 });
}
