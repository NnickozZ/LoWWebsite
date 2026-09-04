import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

export const MIN_PASSWORD_LENGTH = 8;

/**
 * §4: the Keeper must be able to recover a forgotten password. That requires
 * keeping something reversible, so we keep two things:
 *   - an argon2id hash, the only thing consulted at login;
 *   - an AES-256-GCM copy, read only when a Keeper explicitly reveals, audited.
 * The AES key lives in PASSWORD_RECOVERY_KEY, in the server environment only.
 *
 * Plain JS so the CLI scripts (`make bootstrap`) and the app share one
 * implementation — there must never be two ways a password gets stored.
 */

function recoveryKey() {
  const hex = process.env.PASSWORD_RECOVERY_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'PASSWORD_RECOVERY_KEY must be 64 hex characters (32 bytes). Run `make dev` once to generate one, or set it in .env',
    );
  }
  return Buffer.from(hex, 'hex');
}

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
 * Returns "iv.ciphertext.tag", all base64url.
 * @param {string} plain
 * @returns {string}
 */
export function encryptPassword(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', recoveryKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), enc.toString('base64url'), tag.toString('base64url')].join('.');
}

/**
 * Null when the stored copy cannot be read (a rotated or wrong key).
 * @param {string} stored
 * @returns {string | null}
 */
export function decryptPassword(stored) {
  try {
    const [ivB64, encB64, tagB64] = stored.split('.');
    if (!ivB64 || !encB64 || !tagB64) return null;
    const decipher = createDecipheriv('aes-256-gcm', recoveryKey(), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const out = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64url')), decipher.final()]);
    return out.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function constantTimeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * @param {string} plain
 * @returns {string | null}
 */
export function passwordProblem(plain) {
  if (plain.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}
