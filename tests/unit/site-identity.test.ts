import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * §88: de naam in de tab is de naam van het archief.
 *
 * Drie dingen worden hier vastgelegd, en alle drie zijn ze het soort ding dat
 * stilletjes kan wegslijten omdat er niets van breekt:
 *
 *  1. `siteIdentity()` leest de rij die Beheer → Site schrijft, en valt terug
 *     op de standaardnaam als die rij leeg of weggehaald is — nooit op een
 *     lege titel, want een tab zonder naam draagt het adres van de pagina.
 *  2. Het icoontje valt terug op het **logo**. Dat is een keuze (zie de
 *     docblock van `lib/admin/identity.ts`) en dus een test: wie het ooit
 *     weghaalt moet dat hier expres doen.
 *  3. Migratie `0031` hernoemt **alleen** een archief dat nog de oude
 *     standaardnaam draagt. Een Keeper die zijn archief zelf een naam gaf,
 *     houdt die naam. Dat is de hele betekenis van die ene `WHERE`, en zonder
 *     test is het een regel die een volgende migratie achteloos breder maakt.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-identity-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  siteIdentity: typeof import('@/lib/admin/identity').siteIdentity;
  DEFAULT_SITE_NAME: typeof import('@/lib/admin/identity').DEFAULT_SITE_NAME;
};
let deps: Deps;
/** De naam zoals de seed hem net heeft gezet, vóór deze zaak er iets aan doet. */
let seededName = '';

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const identity = await import('@/lib/admin/identity');
  deps = {
    sqlite: dbModule.sqlite,
    siteIdentity: identity.siteIdentity,
    DEFAULT_SITE_NAME: identity.DEFAULT_SITE_NAME,
  };
  seededName = (
    deps.sqlite.prepare(`SELECT name FROM site_settings WHERE id = 1`).get() as { name: string }
  ).name;
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const set = (columns: Record<string, unknown>) => {
  const keys = Object.keys(columns);
  deps.sqlite
    .prepare(`UPDATE site_settings SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = 1`)
    .run(...keys.map((k) => columns[k]));
};

beforeEach(() => {
  set({
    name: deps.DEFAULT_SITE_NAME,
    tagline: 'Archief van het Eiland',
    logo_asset_id: null,
    favicon_asset_id: null,
  });
});

describe('§88 — het archief noemt zichzelf', () => {
  it('leest de naam en de ondertitel uit de instellingen', () => {
    set({ name: 'Het Grijze Archief', tagline: 'Wat er overbleef' });
    const site = deps.siteIdentity();
    expect(site.name).toBe('Het Grijze Archief');
    expect(site.tagline).toBe('Wat er overbleef');
  });

  it('valt terug op de standaardnaam in plaats van op een lege titel', () => {
    // Een lege naam kan er komen door een oude rij of een handmatige ingreep;
    // de `saveSiteAction` weigert hem. Een tab zonder titel toont het adres.
    set({ name: '   ' });
    expect(deps.siteIdentity().name).toBe(deps.DEFAULT_SITE_NAME);
    expect(deps.siteIdentity().name).toBe('LoW: Land over Water Archief');
  });

  it('heeft geen icoontje zolang er geen logo en geen favicon is', () => {
    expect(deps.siteIdentity().iconUrl).toBeNull();
  });

  it('draagt het logo in de tab zolang er geen eigen icoontje is', () => {
    set({ logo_asset_id: 'asset-logo' });
    expect(deps.siteIdentity().iconUrl).toBe('/api/assets/asset-logo?s=thumb');
  });

  it('geeft het eigen icoontje voorrang op het logo', () => {
    set({ logo_asset_id: 'asset-logo', favicon_asset_id: 'asset-icoon' });
    expect(deps.siteIdentity().iconUrl).toBe('/api/assets/asset-icoon?s=thumb');
  });

  it('draagt het icoontje ook zonder logo', () => {
    set({ favicon_asset_id: 'asset-icoon' });
    expect(deps.siteIdentity().iconUrl).toBe('/api/assets/asset-icoon?s=thumb');
  });
});

describe('§88 — wat migratie 0031 doet en laat', () => {
  it('heeft de kolom voor het icoontje gezet', () => {
    const columns = deps.sqlite
      .prepare(`PRAGMA table_info(site_settings)`)
      .all() as { name: string }[];
    expect(columns.map((c) => c.name)).toContain('favicon_asset_id');
  });

  it('hernoemt alleen een archief dat nog de oorspronkelijke naam droeg', () => {
    // De migratie is al gedraaid toen `@/lib/db` werd geïmporteerd, dus dit is
    // de tweede helft van de proef: draai diezelfde ene regel opnieuw, nu met
    // twee archieven naast elkaar, en kijk welke meebeweegt.
    const rename = () =>
      deps.sqlite
        .prepare(
          `UPDATE site_settings SET name = 'LoW: Land over Water Archief' WHERE name = 'Zeeland Case Files'`,
        )
        .run();

    set({ name: 'Zeeland Case Files' });
    rename();
    expect(deps.siteIdentity().name).toBe('LoW: Land over Water Archief');

    set({ name: 'Het Grijze Archief' });
    rename();
    expect(deps.siteIdentity().name).toBe('Het Grijze Archief');
  });

  it('gaf dit verse archief de nieuwe naam in de seed', () => {
    // `seededName` is gelezen voordat deze zaak ook maar iets schreef. Een
    // nieuw archief is nooit 'Zeeland Case Files' geweest en heeft dus niets
    // te hernoemen — het krijgt de naam rechtstreeks uit `lib/db/seed.mjs`.
    // De seed, de kolomstandaard in `schema.ts` en `DEFAULT_SITE_NAME` moeten
    // dezelfde naam zeggen (§17 regel 4); dit is de plek waar dat blijkt.
    expect(seededName).toBe(deps.DEFAULT_SITE_NAME);
  });
});
