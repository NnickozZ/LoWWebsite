import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Refuses to build against a dependency tree that is not the one in
 * package.json.
 *
 * This exists because the same confusion cost several evenings. A server was
 * found building with **Next 16** while package.json said 15 — `npm ci` had not
 * run, or had failed, and `npm run build` cheerfully used whatever was left in
 * node_modules. The error you get is about Turbopack and webpack configs, which
 * sends you off migrating a build system when the actual problem is that the
 * install never happened. Meanwhile better-sqlite3 stayed on 11, which is the
 * version that aborts the whole process on Node 24.19+.
 *
 * A version mismatch is not a warning here. It stops the build and says which
 * command fixes it, because a build that silently uses the wrong Next produces
 * an artefact nobody can reason about.
 *
 * Wired into `npm run build` with `&&` rather than as a `prebuild` hook on
 * purpose: `.npmrc` sets `ignore-scripts=true`, which silently skips pre/post
 * hooks — a guard that can be skipped is not a guard.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** The four whose version has actually broken this project in production. */
const WATCHED = {
  next: 'the framework itself; a different major builds a different application',
  'better-sqlite3':
    'versions below 13 use the legacy node::ObjectWrap and abort the entire\n' +
    '    process on Node 24.19 or newer — this is the crash that kept taking the\n' +
    '    site down with everyone on it',
  react: 'must match the Next.js it was built against',
  'react-dom': 'must match the Next.js it was built against',
};

function installedVersion(name) {
  const file = join(root, 'node_modules', name, 'package.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')).version;
  } catch {
    return null;
  }
}

const parse = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);

/** Enough semver for the three range shapes this project uses, and no more. */
function satisfies(version, range) {
  const [vMajor, vMinor, vPatch] = parse(version);
  const bare = range.replace(/^[\^~]/, '');
  const [rMajor, rMinor, rPatch] = parse(bare);
  const atLeast =
    vMajor > rMajor ||
    (vMajor === rMajor && (vMinor > rMinor || (vMinor === rMinor && vPatch >= rPatch)));

  if (range.startsWith('^')) return vMajor === rMajor && atLeast;
  if (range.startsWith('~')) return vMajor === rMajor && vMinor === rMinor && vPatch >= rPatch;
  return version === bare;
}

const problems = [];

/**
 * The @tiptap/* packages are one library shipped as thirty, and they only work
 * together at a single major. Upgrading some of them and not others produces
 * `Could not resolve dependency: peer @tiptap/pm@3.x from @tiptap/core@3.x`,
 * which reads like an npm problem and is really a half-finished upgrade — and a
 * half-finished upgrade is how an install stops working entirely, which is how
 * a server ends up still running last month's Next and last month's SQLite.
 * StarterKit 3 also bundles Link, which this project registers itself, so a
 * split tree announces itself as `Duplicate extension names found: ['link']`.
 */
function tiptapMajors() {
  const dir = join(root, 'node_modules', '@tiptap');
  if (!existsSync(dir)) return new Map();
  const majors = new Map();
  for (const name of readdirSync(dir)) {
    const version = installedVersion(`@tiptap/${name}`);
    if (!version) continue;
    const major = parse(version)[0];
    if (!majors.has(major)) majors.set(major, []);
    majors.get(major).push(`@tiptap/${name}@${version}`);
  }
  return majors;
}

const majors = tiptapMajors();
if (majors.size > 1) {
  const shown = [...majors.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([major, names]) => `v${major}: ${names.slice(0, 3).join(', ')}` +
      (names.length > 3 ? ` and ${names.length - 3} more` : ''))
    .join('\n      ');
  problems.push(
    `@tiptap/*: installed across ${majors.size} major versions at once\n      ${shown}\n` +
      '    The editor packages must all be on the same major. This project is on 2.x.',
  );
}

for (const [name, why] of Object.entries(WATCHED)) {
  const wanted = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
  if (!wanted) continue;
  const found = installedVersion(name);
  if (!found) {
    problems.push(`${name}: not installed (package.json wants ${wanted})\n    ${why}`);
  } else if (!satisfies(found, wanted)) {
    problems.push(`${name}: ${found} is installed, package.json wants ${wanted}\n    ${why}`);
  }
}

if (problems.length) {
  console.error('');
  console.error('  The installed packages are not the ones this project asks for.');
  console.error('');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  console.error('  node_modules is stale, or `npm ci` failed and its error scrolled past.');
  console.error('  Nothing built from this tree can be trusted, so the build stops here.');
  console.error('');
  console.error('    rm -rf node_modules && npm ci');
  console.error('');
  console.error('  If `npm ci` itself fails, that message is the real problem — read it');
  console.error('  rather than this one.');
  console.error('');
  process.exit(1);
}

console.log(
  `✓ dependencies match: next ${installedVersion('next')}, ` +
    `react ${installedVersion('react')}, better-sqlite3 ${installedVersion('better-sqlite3')}`,
);
