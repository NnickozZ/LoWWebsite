import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §102, ronde 65 (J1) — het bewegingscontract, gemeten.
 *
 * `docs/beweging.md` zegt: elke `transition` en `animation` in het archief
 * gebruikt een token (`--dur-1`..`--dur-5`), en een losse duur is een
 * uitzondering met een reden. §84: een UX-regel die niet gemeten wordt, slijt.
 * Dit bestand is die meting.
 *
 * Het leest **elk** `.css`-bestand onder `app/` — ook de lagen die na ronde 65
 * gevuld worden (`navigatie.css`, `kaartje.css`, `moment.css`,
 * `leeskamer.css`) en elk bestand dat er later bij komt. Er staat hier dus
 * geen lijst van bestanden die bijgehouden moet worden.
 *
 * De CSS wordt geknipt op **declaraties** (tot de `;` of de `}`), niet op
 * regels: `kamer.css` schrijft een `transition:` over drie regels, en een
 * meting per regel zag daar niets.
 */

const APP = join(import.meta.dirname, '..', '..', 'app');

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...cssFiles(path));
    else if (name.endsWith('.css')) out.push(path);
  }
  return out.sort();
}

/** Comments out, newlines kept — so a line number still means something. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

type Declaration = {
  file: string;
  line: number;
  /** The rule the declaration stands in, without the `@media` around it. */
  selector: string;
  property: string;
  value: string;
};

const MOTION = /(?:^|[;{\s])((?:transition|animation)(?:-duration|-delay)?)\s*:([^;{}]*)/g;

function motionDeclarations(file: string, source: string): Declaration[] {
  const css = stripComments(source);
  const out: Declaration[] = [];
  for (const match of css.matchAll(MOTION)) {
    const at = match.index ?? 0;
    const before = css.slice(0, at);
    const open = before.lastIndexOf('{');
    const close = before.lastIndexOf('}', open);
    const head = before.slice(close + 1, open);
    const selector = head.split('{').pop()!.replace(/\s+/g, ' ').trim();
    out.push({
      file,
      line: before.split('\n').length,
      selector,
      property: match[1],
      value: match[2].replace(/\s+/g, ' ').trim(),
    });
  }
  return out;
}

/** Every number with a time unit in a value — `var(--dur-3)` has none, `0.18s` has one. */
function literalTimes(value: string): string[] {
  return [...value.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)]
    .filter((m) => Number(m[1]) !== 0)
    .map((m) => m[0]);
}

/**
 * De uitzonderingen. Elke regel: waar (bestand en selector), welke duur, en
 * één zin waarom die géén token is. Een nieuwe regel hier is een beslissing,
 * geen reparatie: schrijf hem ook in `docs/beweging.md`.
 */
const EXCEPTIONS: { file: string; selector: string; times: string[]; reason: string }[] = [
  {
    file: 'globals.css',
    selector: '.save-state-busy',
    times: ['900ms'],
    reason: 'Een spinner draait rond, hij reist niet: een omwenteling is een tempo, geen duur (§100, SaveStatus).',
  },
  {
    file: 'globals.css',
    selector: '::view-transition-new(root)',
    times: ['550ms'],
    reason: 'De omslag-cirkel van de Keeperkant (§46/§57): het ene expressieve moment dat de hele pagina omslaat.',
  },
  {
    file: 'globals.css',
    selector: '.canvas-peek',
    times: ['0.18s'],
    reason: 'Schuld: de peek op de telefoon beweegt op max-height, tegen regel 3 in; herbouwen hoort niet bij ronde 65.',
  },
  {
    file: 'globals.css',
    selector: '.board-cursor',
    times: ['70ms'],
    reason: 'Het glas (§69): een cursor van een ander volgt het tempo van de stroom, niet een register.',
  },
  {
    file: 'globals.css',
    selector: '.board-card.board-card-carried, .board-held.board-card-carried',
    times: ['70ms'],
    reason: 'Het glas (§69): een kaartje in de hand van een ander loopt mee met de stroom van de server.',
  },
  {
    file: 'globals.css',
    selector: '.live-cursor',
    times: ['120ms'],
    reason: 'Het glas (§69): de cursor van een ander in een gedeeld vak, afgestemd op de stroom.',
  },
  {
    file: 'globals.css',
    selector: '.map-pin.map-pin-carried, .map-cursor',
    times: ['70ms'],
    reason: 'Het glas (§69): een speld of cursor van een ander op de landkaart, afgestemd op de stroom.',
  },
  {
    file: 'stambomen.css',
    selector: '.tree-node',
    times: ['220ms'],
    reason: 'Het glas (§69): de stamboom die herschikt na een wijziging — een tween op het vlak, niet een register.',
  },
  {
    file: 'stambomen.css',
    selector: '.tree-node.is-carried',
    times: ['70ms'],
    reason: 'Het glas (§69): een kaartje in de hand van een ander loopt mee met de stroom van de server.',
  },
  {
    file: 'timelines.css',
    selector: '.timeline-event-carried',
    times: ['70ms'],
    reason: 'Het glas (§69): een gebeurtenis in de hand van een ander loopt mee met de stroom van de server.',
  },
  {
    file: 'kamer.css',
    selector: '.plek:target',
    times: ['1.4s'],
    reason: 'K1: de landingsring na *Bekijk* is een aanwijzing, geen reis — hij moet lang genoeg staan om je oog te vinden.',
  },
];

function isException(d: Declaration, time: string): boolean {
  return EXCEPTIONS.some(
    (e) => d.file.endsWith(e.file) && d.selector === e.selector && e.times.includes(time),
  );
}

const files = cssFiles(APP).map((path) => ({ path, name: relative(APP, path), source: readFileSync(path, 'utf8') }));

describe('§102 het bewegingscontract', () => {
  it('leest elk css-bestand onder app/, ook de nieuwe lagen', () => {
    const names = files.map((f) => f.name);
    for (const layer of ['globals.css', 'navigatie.css', 'kaartje.css', 'moment.css', 'leeskamer.css']) {
      expect(names).toContain(layer);
    }
  });

  it('knipt op declaraties, niet op regels', () => {
    const found = motionDeclarations(
      'x.css',
      '.a {\n  transition:\n    transform 120ms ease,\n    box-shadow 90ms ease;\n}\n/* transition: 5s */',
    );
    expect(found).toHaveLength(1);
    expect(found[0].selector).toBe('.a');
    expect(literalTimes(found[0].value)).toEqual(['120ms', '90ms']);
    expect(literalTimes('transform var(--dur-1) var(--ease-standard), opacity 0s')).toEqual([]);
    expect(literalTimes('plek-aangewezen 1.4s steps(1, end)')).toEqual(['1.4s']);
    const nested = motionDeclarations('x.css', '@media (prefers-reduced-motion: reduce) {\n  .b { animation: x 2s; }\n}');
    expect(nested[0].selector).toBe('.b');
  });

  it('geen losse duur in een transition of animation, buiten de uitzonderingen', () => {
    const loose: string[] = [];
    for (const f of files) {
      for (const d of motionDeclarations(f.name, f.source)) {
        for (const time of literalTimes(d.value)) {
          if (!isException(d, time)) {
            loose.push(`${f.name}:${d.line} ${d.selector} { ${d.property}: ${d.value} } — ${time}`);
          }
        }
      }
    }
    expect(loose, 'gebruik var(--dur-1..5), of zet de regel met een reden in EXCEPTIONS').toEqual([]);
  });

  it('elke uitzondering heeft een reden', () => {
    for (const e of EXCEPTIONS) expect(e.reason.length, e.selector).toBeGreaterThan(20);
  });

  it('elke @keyframes-naam komt precies één keer voor, over alle css-bestanden', () => {
    const seen = new Map<string, string[]>();
    for (const f of files) {
      const css = stripComments(f.source);
      for (const m of css.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/g)) {
        const line = css.slice(0, m.index).split('\n').length;
        seen.set(m[1], [...(seen.get(m[1]) ?? []), `${f.name}:${line}`]);
      }
    }
    const twice = [...seen].filter(([, where]) => where.length > 1).map(([name, where]) => `${name}: ${where.join(', ')}`);
    // K1: `plek-aangewezen` stond twee keer in kamer.css, en de tweede won stil.
    expect(twice).toEqual([]);
    expect(seen.has('plek-aangewezen')).toBe(true);
  });

  it('de tokens staan één keer op :root, met de waarden uit het contract', () => {
    const globals = stripComments(files.find((f) => f.name === 'globals.css')!.source);
    const want: Record<string, string> = {
      '--dur-1': '70ms',
      '--dur-2': '110ms',
      '--dur-3': '150ms',
      '--dur-4': '240ms',
      '--dur-5': '400ms',
      '--ease-standard': 'cubic-bezier(0.2, 0, 0.38, 0.9)',
      '--ease-enter': 'cubic-bezier(0, 0, 0.38, 0.9)',
      '--ease-exit': 'cubic-bezier(0.2, 0, 1, 0.9)',
      '--ease-expressive': 'cubic-bezier(0.4, 0.14, 0.3, 1)',
      '--ease-land': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    };
    for (const [token, value] of Object.entries(want)) {
      const defs = [...globals.matchAll(new RegExp(`${token}\\s*:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim());
      expect(defs, token).toEqual([value]);
    }
  });

  it('een var(--dur-…) noemt alleen een token dat bestaat', () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const d of motionDeclarations(f.name, f.source)) {
        for (const m of d.value.matchAll(/var\(--dur-(\w+)\)/g)) {
          if (!['1', '2', '3', '4', '5'].includes(m[1])) bad.push(`${f.name}:${d.line} --dur-${m[1]}`);
        }
        for (const m of d.value.matchAll(/var\(--ease-([\w-]+)\)/g)) {
          if (!['standard', 'enter', 'exit', 'expressive', 'land'].includes(m[1])) bad.push(`${f.name}:${d.line} --ease-${m[1]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
