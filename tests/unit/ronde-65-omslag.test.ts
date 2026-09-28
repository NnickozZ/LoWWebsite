import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FLIP_NOTE, FLIP_SCRIPT } from '@/components/keeper/flipRoad';
import { PREVIEW_DELAY_MOUSE, PREVIEW_DELAY_TOUCH, PREVIEW_GRACE } from '@/components/EntryPreview';
import { DEFAULT_WORDS } from '@/lib/words';

/**
 * §102, ronde 65·c: de omslag-cirkel en de voorbeeldkaart.
 *
 * `FLIP_SCRIPT` is the one inline script in the archive: it runs in the root
 * layout's `<head>` before anything else, in every browser, so it is tested
 * here as the string it is — evaluated against a pretend window — rather than
 * trusted. The browser half (a real cross-document transition through the
 * 303) is `tests/e2e/ronde-65-kaartje-omslag.spec.ts`.
 */

type Listener = (event: unknown) => void;

function pretendWindow(opts: { reduce?: boolean; note?: string | null; noStorage?: boolean } = {}) {
  const listeners: Record<string, Listener[]> = {};
  const store = new Map<string, string>();
  if (opts.note !== undefined && opts.note !== null) store.set(FLIP_NOTE, opts.note);
  const props = new Map<string, string>();
  const w = {
    addEventListener: (name: string, fn: Listener) => {
      (listeners[name] ??= []).push(fn);
    },
    sessionStorage: opts.noStorage
      ? {
          getItem: () => {
            throw new Error('SecurityError');
          },
          removeItem: () => {
            throw new Error('SecurityError');
          },
        }
      : {
          getItem: (key: string) => store.get(key) ?? null,
          removeItem: (key: string) => void store.delete(key),
        },
    matchMedia: (query: string) => ({ matches: Boolean(opts.reduce) && query.includes('reduce') }),
    document: { documentElement: { style: { setProperty: (k: string, v: string) => void props.set(k, v) } } },
  };
  new Function('window', FLIP_SCRIPT)(w);
  const fire = (name: string, withTransition = true) => {
    const transition = withTransition ? { skipTransition: vi.fn() } : null;
    for (const fn of listeners[name] ?? []) fn({ viewTransition: transition });
    return transition;
  };
  return { fire, store, props, listeners };
}

const note = (ageMs: number, x = 1200, y = 22) => JSON.stringify({ x, y, at: Date.now() - ageMs });

describe('§102 FLIP_SCRIPT — alleen een omslag met een hand krijgt de cirkel', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('listens for pageswap and pagereveal and nothing else', () => {
    const { listeners } = pretendWindow();
    expect(Object.keys(listeners).sort()).toEqual(['pagereveal', 'pageswap']);
  });

  it('pageswap: no note → skipped; a fresh note → left alone', () => {
    expect(pretendWindow().fire('pageswap')!.skipTransition).toHaveBeenCalledOnce();
    expect(pretendWindow({ note: note(200) }).fire('pageswap')!.skipTransition).not.toHaveBeenCalled();
  });

  it('pageswap: a stale note (3 s or older) or one from the future → skipped', () => {
    expect(pretendWindow({ note: note(3000) }).fire('pageswap')!.skipTransition).toHaveBeenCalledOnce();
    expect(pretendWindow({ note: note(-5000) }).fire('pageswap')!.skipTransition).toHaveBeenCalledOnce();
  });

  it('pageswap: a note that is not ours (garbage, wrong shape) → skipped', () => {
    expect(pretendWindow({ note: '{nope' }).fire('pageswap')!.skipTransition).toHaveBeenCalledOnce();
    expect(
      pretendWindow({ note: JSON.stringify({ x: '1', y: 2, at: Date.now() }) }).fire('pageswap')!.skipTransition,
    ).toHaveBeenCalledOnce();
  });

  it('pagereveal with a fresh note: the origin goes on <html> and the note is spent', () => {
    const page = pretendWindow({ note: note(400, 1311, 22) });
    const t = page.fire('pagereveal')!;
    expect(t.skipTransition).not.toHaveBeenCalled();
    expect(page.props.get('--flip-x')).toBe('1311px');
    expect(page.props.get('--flip-y')).toBe('22px');
    expect(page.store.has(FLIP_NOTE)).toBe(false);
  });

  it('pagereveal without a note → skipped, and nothing is written', () => {
    const page = pretendWindow();
    expect(page.fire('pagereveal')!.skipTransition).toHaveBeenCalledOnce();
    expect(page.props.size).toBe(0);
  });

  it('pagereveal under reduced motion → skipped even with a fresh note, and the note is still spent', () => {
    const page = pretendWindow({ note: note(100), reduce: true });
    expect(page.fire('pagereveal')!.skipTransition).toHaveBeenCalledOnce();
    expect(page.props.size).toBe(0);
    expect(page.store.has(FLIP_NOTE)).toBe(false);
  });

  it('a landing with no transition at all (Firefox, a first load) still spends the note', () => {
    const page = pretendWindow({ note: note(100) });
    expect(page.fire('pagereveal', false)).toBeNull();
    expect(page.store.has(FLIP_NOTE)).toBe(false);
    expect(page.props.size).toBe(0);
  });

  it('a browser that will not give its storage gets no circle and no error', () => {
    const page = pretendWindow({ noStorage: true });
    expect(() => page.fire('pageswap')).not.toThrow();
    const t = page.fire('pagereveal')!;
    expect(t.skipTransition).toHaveBeenCalledOnce();
  });

  it('a window without addEventListener does not throw on load', () => {
    expect(() => new Function('window', FLIP_SCRIPT)({})).not.toThrow();
  });

  it('is small, and plain enough for any browser that runs it', () => {
    expect(FLIP_SCRIPT.length).toBeLessThan(1000);
    // No arrow functions, no let/const, no optional chaining: ES5 all the way.
    expect(FLIP_SCRIPT).not.toMatch(/=>|\blet\b|\bconst\b|\?\./);
  });
});

describe('§102 de omslag: wie schrijft er een briefje', () => {
  const toggle = readFileSync(resolve(__dirname, '../../components/keeper/SideToggle.tsx'), 'utf8');
  const shell = readFileSync(resolve(__dirname, '../../components/ui/UiProvider.tsx'), 'utf8');
  const palette = readFileSync(resolve(__dirname, '../../components/palette/CommandPalette.tsx'), 'utf8');

  it('the toggle writes the note only with an origin, and just before it leaves', () => {
    expect(toggle).toMatch(/if \(origin\) \{\s*try \{\s*sessionStorage\.setItem\(FLIP_NOTE/);
    const write = toggle.indexOf('sessionStorage.setItem(FLIP_NOTE');
    const leave = toggle.indexOf('window.location.assign(flipRoad(plan))');
    expect(write).toBeGreaterThan(0);
    expect(leave).toBeGreaterThan(write);
  });

  it('a keyboard press on the button has no origin (click `detail` 0)', () => {
    expect(toggle).toMatch(/flip\(event\.detail > 0 \? centreOf\(event\.currentTarget\) : null\)/);
  });

  it('the `k` key and `>` in the palet ring a plain event: no origin, no circle', () => {
    expect(shell).toMatch(/window\.dispatchEvent\(new Event\(FLIP_EVENT\)\)/);
    expect(palette).toMatch(/window\.dispatchEvent\(new Event\(FLIP_EVENT\)\)/);
  });

  it('the root layout carries the script in its <head>', () => {
    const layout = readFileSync(resolve(__dirname, '../../app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/<head>\s*<script dangerouslySetInnerHTML=\{\{ __html: FLIP_SCRIPT \}\} \/>\s*<\/head>/);
  });

  it('the wipe and the opt-in live together in kaartje.css, with a reduced-motion way out', () => {
    const css = readFileSync(resolve(__dirname, '../../app/kaartje.css'), 'utf8');
    expect(css).toMatch(/@view-transition \{\s*navigation: auto;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*@view-transition \{\s*navigation: none;/);
    expect(css).toMatch(/::view-transition-new\(root\) \{\s*animation: side-flip-wipe /);
  });
});

describe('§102 de voorbeeldkaart', () => {
  it('waits half a second for a mouse, keeps §6’s long press, and gives a quarter second of grace', () => {
    expect(PREVIEW_DELAY_MOUSE).toBe(500);
    expect(PREVIEW_DELAY_TOUCH).toBe(450);
    expect(PREVIEW_GRACE).toBe(250);
  });

  it('says its door and its name through lib/words.ts', () => {
    expect(DEFAULT_WORDS.previewOpen).toBe('Openen →');
    expect(DEFAULT_WORDS.previewLabel).toContain('{naam}');
  });

  it('the old preview rules left globals.css', () => {
    const globals = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8');
    expect(globals).not.toMatch(/^\.preview-card \{/m);
    expect(globals).not.toMatch(/side-flip-wipe/);
  });
});
