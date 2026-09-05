import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { defaultIntro, introParagraphs } from '@/lib/intro';
import { DEFAULT_WORDS } from '@/lib/words';

// `lib/assets` opens the database on import; give it one of its own.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'zcf-uploads-'));

type Assets = typeof import('@/lib/assets');
let assets: Assets;

beforeAll(async () => {
  assets = await import('@/lib/assets');
});

describe('the start page welcome', () => {
  it('speaks in the word list, so a renamed archive is welcomed in its own words', () => {
    expect(defaultIntro(DEFAULT_WORDS)).toContain('artikelen');
    expect(defaultIntro({ ...DEFAULT_WORDS, entryPlural: 'kaarten', entry: 'kaart' })).toContain('kaarten');
    expect(defaultIntro(DEFAULT_WORDS)).not.toContain('fiche');
  });

  it('splits the Keeper’s text on blank lines and ignores the rest of the whitespace', () => {
    expect(introParagraphs('Eén.\r\n\r\n  Twee.  \n\n\n\nDrie.')).toEqual(['Eén.', 'Twee.', 'Drie.']);
    expect(introParagraphs('')).toEqual([]);
    expect(introParagraphs('Een regel\nzonder witregel')).toEqual(['Een regel\nzonder witregel']);
  });
});

describe('upload limits', () => {
  it('a player gets 10 MB, a Keeper 100 MB', () => {
    expect(assets.uploadLimitFor({ isKeeper: false })).toBe(assets.PLAYER_UPLOAD_BYTES);
    expect(assets.uploadLimitFor({ isKeeper: true })).toBe(assets.KEEPER_UPLOAD_BYTES);
    expect(assets.uploadLimitFor(null)).toBe(assets.PLAYER_UPLOAD_BYTES);
    expect(assets.PLAYER_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(assets.KEEPER_UPLOAD_BYTES).toBe(100 * 1024 * 1024);
  });

  it('says the limit in the message', () => {
    expect(assets.uploadLimitLabel(assets.PLAYER_UPLOAD_BYTES)).toBe('10 MB');
    expect(assets.tooLargeMessage(assets.KEEPER_UPLOAD_BYTES)).toBe('Die afbeelding is groter dan de limiet van 100 MB.');
  });

  it('refuses a player’s picture over the ceiling before looking at it', async () => {
    const big = Buffer.alloc(assets.PLAYER_UPLOAD_BYTES + 1);
    await expect(assets.storeImage(big, 'groot.png', 'image/png', 'bram')).rejects.toThrow(/10 MB/);
    await expect(
      assets.storeImage(big, 'groot.png', 'image/png', 'keeper', { limitBytes: assets.KEEPER_UPLOAD_BYTES }),
    ).rejects.not.toThrow(/10 MB/);
  });
});
