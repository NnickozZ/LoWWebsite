import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { lockedRestLine, roomFeedPhrase } from '@/components/kamer/plekWords';
import { announceBalance, announcedFor, resetSaldo, setShellRoom, shownBalance } from '@/components/kamer/saldo';
import { nextToasts, TOAST_MAX, type Toast } from '@/components/ui/UiProvider';
import { DEFAULT_WORDS, fill } from '@/lib/words';

/**
 * §103 golf H (h2): de economie na design-review 3 — wat daarvan zonder browser
 * te bewijzen is. De vorm (hoe een dichte tegel eruitziet, waar de balk zweeft)
 * staat in `tests/e2e/golf-h2-economie.spec.ts` en in de schermen.
 */

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function fresh(message: string, extra: Partial<Toast> = {}): Omit<Toast, 'id' | 'version'> {
  return { message, ms: 6000, pausable: true, ...extra };
}

describe('T15/D9: één melding per onderwerp, en hooguit twee', () => {
  it('replaces a toast with the same key in place, and restarts its clock', () => {
    let stack = nextToasts([], fresh('Inktpot ligt nu in je lade.', { key: 'ding:a' }), 1);
    stack = nextToasts(stack, fresh('Inktpot ligt nu op je bureau.', { key: 'ding:a' }), 2);
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({ id: 1, version: 1, message: 'Inktpot ligt nu op je bureau.' });
  });

  it('never shows more than two: the oldest leaves with its own way out', () => {
    let stack: Toast[] = [];
    stack = nextToasts(stack, fresh('een'), 1);
    stack = nextToasts(stack, fresh('twee'), 2);
    stack = nextToasts(stack, fresh('drie'), 3);
    expect(stack.filter((t) => !t.closing).map((t) => t.message)).toEqual(['twee', 'drie']);
    expect(stack.find((t) => t.message === 'een')?.closing).toBe(true);
    expect(TOAST_MAX).toBe(2);
  });

  it('adds two gifts of the Keeper up in one toast, keeping the newest reason', () => {
    let stack = nextToasts([], fresh('+20', { key: 'munt:keeper', munt: { delta: 20, reason: 'Sessie 13' } }), 1);
    stack = nextToasts(stack, fresh('+5', { key: 'munt:keeper', munt: { delta: 5, reason: 'De kaart' } }), 2);
    expect(stack).toHaveLength(1);
    expect(stack[0].munt).toEqual({ delta: 25, reason: 'De kaart' });
  });

  it('does not reuse a toast that is already on its way out', () => {
    const leaving: Toast = { ...fresh('oud', { key: 'ding:a' }), id: 1, version: 0, closing: true };
    const stack = nextToasts([leaving], fresh('nieuw', { key: 'ding:a' }), 2);
    expect(stack.map((t) => t.id)).toEqual([1, 2]);
  });

  it('keys every kamer melding by its thing or its plek', () => {
    for (const path of ['components/kamer/Verplaatsen.tsx', 'components/kamer/ClearButton.tsx', 'components/kamer/PlaceButton.tsx', 'components/kamer/buyToast.ts']) {
      expect(read(path), path).toContain('toastKeyOf(');
    }
    expect(read('components/kamer/UnlockButton.tsx')).toContain('key: `plek:${slotId}`');
    expect(read('components/kamer/ShellBeurs.tsx')).toContain("key: 'munt:keeper'");
  });

  it('closes the running toasts when a sheet opens (T6)', () => {
    const provider = read('components/ui/UiProvider.tsx');
    expect(provider).toContain("classList.contains('sheet-backdrop')");
    expect(read('app/globals.css')).toContain('body:has(.sheet-backdrop:not([data-closing])) .toast-wrap');
  });
});

describe('T8: het saldo volgt het antwoord van de server, en nooit een som', () => {
  beforeEach(() => resetSaldo());

  it('holds an announced balance only while the prop is still the one it came in on', () => {
    expect(shownBalance(20, null)).toBe(20);
    expect(shownBalance(20, { basis: 20, balance: 18 })).toBe(18);
    // De verversing bracht de serverwaarde: de prop wint.
    expect(shownBalance(18, { basis: 20, balance: 18 })).toBe(18);
    expect(shownBalance(38, { basis: 20, balance: 18 })).toBe(38);
  });

  it('finds the shell room when a number names none, and nothing for null', () => {
    announceBalance('kamer-a', 18);
    expect(announcedFor('kamer-a')?.balance).toBe(18);
    expect(announcedFor(undefined)).toBeNull();
    setShellRoom('kamer-a');
    expect(announcedFor(undefined)?.balance).toBe(18);
    expect(announcedFor(null)).toBeNull();
  });

  it('ignores anything that is not a number from the server', () => {
    announceBalance('kamer-a', undefined);
    announceBalance('kamer-a', Number.NaN);
    announceBalance(null, 3);
    expect(announcedFor('kamer-a')).toBeNull();
  });

  it('gives a Beurs no shell room by default — somebody else’s purse never gets yours', () => {
    expect(read('components/kamer/Beurs.tsx')).toMatch(/room = null/);
  });
});

describe('T11: de dichte plekken, kort', () => {
  it('says how many are folded away and what they cost', () => {
    expect(lockedRestLine([8, 12, 16, 20, 25, 30], DEFAULT_WORDS)).toBe('Nog 6 plekken op slot · 8 tot 30 munten');
    expect(lockedRestLine([30], DEFAULT_WORDS)).toBe('Nog 1 plek op slot · 30 munten');
    expect(lockedRestLine([5, 5], DEFAULT_WORDS)).toBe('Nog 2 plekken op slot · 5 munten');
    expect(lockedRestLine([], DEFAULT_WORDS)).toBe('');
  });

  it('draws a locked tile with one price and a bare Openen', () => {
    const plek = read('components/kamer/Plek.tsx');
    const locked = plek.slice(plek.indexOf("{state === 'locked' && ("), plek.indexOf("{state === 'empty' && ("));
    expect(locked).not.toContain('slotLocked');
    expect(locked).not.toContain('plek-slot-merk');
    expect(locked).toContain('bare');
  });
});

describe('D26/T16/D15: de woorden', () => {
  it('says "in de eigen kamer" once, without the name', () => {
    expect(roomFeedPhrase('room.opened', 'Bertus', true, DEFAULT_WORDS)).toEqual({
      verb: 'opende een plek in de eigen kamer',
      tail: '',
      bare: true,
    });
  });

  it('keeps every gap in the new words', () => {
    expect(fill(DEFAULT_WORDS.roomHeading, { kamer: 'kamer' })).toBe('kamer van');
    expect(fill(DEFAULT_WORDS.movedTo, { ding: 'Kaartenkast', plek: 'plank' })).toBe('Kaartenkast verplaatst naar de plank.');
    expect(fill(DEFAULT_WORDS.handoutDoneOne, { munten: '20 munten', naam: 'Dr. Elsje Kramer' })).toBe(
      '20 munten naar Dr. Elsje Kramer',
    );
    expect(fill(DEFAULT_WORDS.handoutDoneMany, { munten: '40 munten', kamers: '2 kamers' })).toBe('40 munten naar 2 kamers');
    expect(fill(DEFAULT_WORDS.shopOpenFirstShort, { plek: 'bureau', n: '12' })).toBe('Eerst bureau openen · 12');
    expect(DEFAULT_WORDS.grantMuntLine).toContain('{keeper}');
  });

  it('writes a real minus sign in the grootboek', () => {
    expect(read('components/kamer/Grootboek.tsx')).toContain("'\\u2212'");
  });
});
