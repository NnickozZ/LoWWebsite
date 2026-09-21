import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { MIN_PASSWORD_LENGTH, passwordProblem } from './rules.mjs';

/*
 * §63: "how long is long enough" is a rule, not a secret, and the signup form
 * in the browser needs it as badly as this module does. It lives in
 * `rules.mjs`, which imports nothing, and is re-exported here so that every
 * caller written before round 30 keeps importing it from the same place.
 */
export { MIN_PASSWORD_LENGTH, passwordProblem };

/**
 * §4, rewritten in round 50 (§89): **a Keeper gives a new password; nobody
 * reads an old one.**
 *
 * Until round 50 this module also kept an AES-256-GCM copy of every password
 * so a Keeper could "reveal" it. That copy went into every nightly backup and
 * every "Download alles" zip, with the key in `.env` on the same machine — so
 * anyone holding the box, a backup disk or a shared export held every
 * player's password, and every Keeper could read every other Keeper's. People
 * reuse passwords; a reversible copy is a leak waiting for a date.
 *
 * So only one thing is kept: an argon2id hash, consulted at login and never
 * turned back into text. A forgotten password is answered by Beheer →
 * "Nieuw wachtwoord instellen", which is what it always should have been.
 * Migration 0032 blanks and drops the old column.
 *
 * Plain JS so the CLI scripts (`make bootstrap`) and the app share one
 * implementation — there must never be two ways a password gets stored.
 */

/**
 * @param {string} plain
 * @returns {Promise<string>}
 */
export async function hashPassword(plain) {
  // OWASP-ish parameters that stay comfortable on a small VPS.
  return argonHash(plain, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

/**
 * @param {string} hash
 * @param {string} plain
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(hash, plain) {
  try {
    return await argonVerify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * §89: a hash of nothing anybody knows, made once per process. Login verifies
 * against it when the name does not exist, so an unknown name costs the same
 * argon2 work as a known one and the clock cannot tell them apart.
 * @type {Promise<string> | null}
 */
let decoyHash = null;
export function decoyPasswordHash() {
  decoyHash ??= hashPassword(randomBytes(24).toString('base64url'));
  return decoyHash;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function constantTimeEqual(a, b) {
  // §89: compared as SHA-256 digests, so the two sides are always 32 bytes and
  // neither the answer nor the time it takes says how long the secret is.
  const bufA = createHash('sha256').update(String(a)).digest();
  const bufB = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(bufA, bufB);
}
