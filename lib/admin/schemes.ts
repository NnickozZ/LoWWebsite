import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { logAudit } from '@/lib/entries/service';
import {
  cleanSchemes,
  isColour,
  TOKENS,
  SCHEME_KEYS,
  type Palette,
  type SchemeKey,
  type Schemes,
} from '@/lib/theme/schemes';

/**
 * §45's Kleuren pane, server half. `lib/theme/schemes.ts` holds the tokens, the
 * defaults and the CSS and stays pure so client components can import it; this
 * is the only place that reads or writes the settings row — the same division
 * `lib/words.ts` and `lib/admin/words.ts` have kept since §11.
 */

/** The four palettes as they are today: the Keeper's where they set one, the archive's elsewhere. */
export function getSchemes(): Schemes {
  const row = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).get();
  const theme = row?.theme ?? {};
  return cleanSchemes(theme.schemes, theme.accent);
}

/**
 * Stores the four palettes.
 *
 * Everything is written, defaults included, rather than only what differs.
 * Words are stored as a sparse override so that a later change to a default
 * still reaches a Keeper who never touched that word; colours are not like
 * that — a palette is a whole, and a Keeper who tuned three of nineteen
 * colours does not want the other sixteen moving under them in a later round.
 */
export function saveSchemes(input: unknown, keeperId: string): void {
  const schemes = cleanSchemes(input);
  const row = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).get();
  const theme = { ...(row?.theme ?? {}) };
  theme.schemes = schemes;
  db.update(schema.siteSettings).set({ theme }).where(eq(schema.siteSettings.id, 1)).run();
  logAudit({
    actorId: keeperId,
    action: 'site.schemes_changed',
    targetType: 'site',
    targetId: '1',
  });
}

/** The form's fields, `<schemeKey>.<tokenKey>`, read back off a FormData. */
export function schemesFromForm(get: (name: string) => string | null): Schemes {
  const out: Partial<Record<SchemeKey, Partial<Palette>>> = {};
  for (const key of SCHEME_KEYS) {
    const palette: Partial<Palette> = {};
    for (const token of TOKENS) {
      const value = get(`${key}.${token.key}`);
      if (isColour(value)) palette[token.key] = value;
    }
    out[key] = palette;
  }
  return cleanSchemes(out);
}
