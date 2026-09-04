import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadEnv } from './ensure-env.mjs';

loadEnv();

const { openDb } = await import('../lib/db/open.mjs');
const { seedBaseline } = await import('../lib/db/seed.mjs');
const { hashPassword, encryptPassword, passwordProblem } = await import('../lib/auth/password.mjs');
const { usernameProblem, usernameKey } = await import('../lib/auth/username.mjs');
const { randomBytes } = await import('node:crypto');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
function newId() {
  let out = '';
  for (const b of randomBytes(16)) out += ALPHABET[b % ALPHABET.length];
  return out;
}

const db = openDb();
seedBaseline(db);

const settings = db.prepare('SELECT invite_code FROM site_settings WHERE id = 1').get();
const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get();

/** Flags let CI and the Playwright fixtures bootstrap without a terminal. */
function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const flagUsername = flag('username');
const flagPassword = flag('password');

if (flagUsername && flagPassword) {
  const problem = usernameProblem(flagUsername) ?? passwordProblem(flagPassword);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  const key = usernameKey(flagUsername);
  if (db.prepare('SELECT id FROM users WHERE username_lower = ?').get(key)) {
    console.log(`"${flagUsername}" already exists. Nothing was changed.`);
    process.exit(0);
  }
  db.prepare(
    `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper)
     VALUES (?, ?, ?, ?, ?, 1)`,
  ).run(newId(), flagUsername, key, await hashPassword(flagPassword), encryptPassword(flagPassword));
  console.log(`Keeper "${flagUsername}" created. Invite code: ${settings.invite_code}`);
  process.exit(0);
}

const rl = createInterface({ input: stdin, output: stdout });

try {
  if (existing.n > 0) {
    console.log(`\nThere are already ${existing.n} account(s) in this archive.`);
    console.log(`Invite code: ${settings.invite_code}\n`);
    const answer = (await rl.question('Add another Keeper anyway? (y/N) ')).trim().toLowerCase();
    if (answer !== 'y') process.exit(0);
  }

  console.log('\nCreating the Keeper account.\n');
  let username = '';
  for (;;) {
    username = (await rl.question('Name: ')).trim();
    const problem = usernameProblem(username);
    if (!problem) break;
    console.log(`  ${problem}`);
  }

  let password = '';
  for (;;) {
    password = await rl.question('Password (min 8 characters): ');
    const problem = passwordProblem(password);
    if (!problem) break;
    console.log(`  ${problem}`);
  }

  const key = usernameKey(username);
  const clash = db.prepare('SELECT id FROM users WHERE username_lower = ?').get(key);
  if (clash) {
    console.log('\nThat name is already in the register. Nothing was changed.');
    process.exit(1);
  }

  db.prepare(
    `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper)
     VALUES (?, ?, ?, ?, ?, 1)`,
  ).run(newId(), username, key, await hashPassword(password), encryptPassword(password));

  console.log(`\n  Keeper "${username}" created.`);
  console.log(`  Invite code for everyone else: ${settings.invite_code}`);
  console.log(`\n  Now run: npm run dev\n`);
} finally {
  rl.close();
}
