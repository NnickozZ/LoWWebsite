import { randomBytes, randomUUID } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Short, URL-safe, collision-resistant enough for a 40-player campaign. */
export function newId(prefix = ''): string {
  const bytes = randomBytes(16);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}

export function uuid(): string {
  return randomUUID();
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
