import { describe, expect, it } from 'vitest';
import { dayKey, dayLabel, groupByDay, timeOf } from '@/lib/wiki/geschiedenis';
import { zijbalkCookie, zijbalkDicht, ZIJBALK_COOKIE } from '@/lib/zijbalk';
import { RESERVED_WIKI_SLUGS } from '@/lib/slug';
import { DEFAULT_WORDS } from '@/lib/words';
import { ICON_PATHS } from '@/components/Icon';

// 1 oktober 2026, 10:00 in Nederland (08:00 UTC).
const NOW = Date.UTC(2026, 9, 1, 8, 0, 0);
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe('golf O: de geschiedenis van de wiki, per dag', () => {
  it('telt de dag van het archief, niet die van de server', () => {
    // 30 september 23:30 in Nederland is 21:30 UTC: dezelfde dag, niet "morgen".
    expect(dayKey(at('2026-09-30T21:30:00Z'))).toBe('2026-09-30');
    // 22:30 UTC is in Nederland al 1 oktober.
    expect(dayKey(at('2026-09-30T22:30:00Z'))).toBe('2026-10-01');
  });

  it('zegt Vandaag, Gisteren, en daarvoor de dag met de weekdag', () => {
    expect(dayLabel(at('2026-10-01T07:00:00Z'), NOW)).toBe('Vandaag');
    expect(dayLabel(at('2026-09-30T12:00:00Z'), NOW)).toBe('Gisteren');
    expect(dayLabel(at('2026-09-28T12:00:00Z'), NOW)).toBe('Maandag 28 september');
    expect(dayLabel(at('2025-09-28T12:00:00Z'), NOW)).toMatch(/2025/);
  });

  it('geeft het uur in het archief', () => {
    expect(timeOf(at('2026-10-01T07:05:00Z'))).toBe('09:05');
  });

  it('groepeert nieuwste eerst, in dezelfde volgorde', () => {
    const items = [
      { id: 'a', createdAt: at('2026-10-01T07:00:00Z') },
      { id: 'b', createdAt: at('2026-10-01T06:00:00Z') },
      { id: 'c', createdAt: at('2026-09-29T06:00:00Z') },
    ];
    const days = groupByDay(items, NOW);
    expect(days.map((day) => day.label)).toEqual(['Vandaag', 'Dinsdag 29 september']);
    expect(days[0].items.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('heeft een adres dat geen soort mag pakken, en een woord voor de tab', () => {
    expect(RESERVED_WIKI_SLUGS).toContain('geschiedenis');
    expect(DEFAULT_WORDS.wikiHistory).toBe('Wiki geschiedenis');
  });
});

describe('golf O: de zijbalk in en uit', () => {
  it('leest en schrijft één koekje', () => {
    expect(zijbalkDicht('dicht')).toBe(true);
    expect(zijbalkDicht(undefined)).toBe(false);
    expect(zijbalkDicht('open')).toBe(false);
    expect(zijbalkCookie(true)).toContain(`${ZIJBALK_COOKIE}=dicht`);
    expect(zijbalkCookie(false)).toContain('max-age=0');
  });

  it('heeft een teken en twee woorden', () => {
    expect(ICON_PATHS.sidebar).toBeTruthy();
    expect(DEFAULT_WORDS.navCollapse).toBe('Menu inklappen');
    expect(DEFAULT_WORDS.navExpand).toBe('Menu uitklappen');
  });
});
