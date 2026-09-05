import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { ASSETS_DIR, db, schema } from '@/lib/db';
import { newId } from '@/lib/ids';

/**
 * How much one upload may weigh. Two ceilings (Nick, 5 Sep 2026): a player's
 * photo of a handout is a phone picture, 10 MB is plenty; a Keeper hanging a
 * scanned map or a full-resolution painting gets 100 MB. Checked twice — on
 * the size the browser declared, before the body is read, and again on the
 * bytes that actually arrived — so a mislabelled file cannot slip past.
 *
 * Two things sit outside this file: a reverse proxy in front of the server
 * (nginx's `client_max_body_size` defaults to 1 MB and must be raised to at
 * least 100m), and sharp's own pixel ceiling (`limitInputPixels`, ~268 MP by
 * default), which is what stops a 100 MB scan from eating the box's memory.
 */
export const PLAYER_UPLOAD_BYTES = 10 * 1024 * 1024;
export const KEEPER_UPLOAD_BYTES = 100 * 1024 * 1024;
/** Kept for anything that only knows the old name; the player's ceiling. */
export const MAX_UPLOAD_BYTES = PLAYER_UPLOAD_BYTES;

export function uploadLimitFor(viewer: { isKeeper: boolean } | null | undefined): number {
  return viewer?.isKeeper ? KEEPER_UPLOAD_BYTES : PLAYER_UPLOAD_BYTES;
}

/** "10 MB" / "100 MB" — for the sentence under an upload button and the error. */
export function uploadLimitLabel(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function tooLargeMessage(limitBytes: number): string {
  return `Die afbeelding is groter dan de limiet van ${uploadLimitLabel(limitBytes)}.`;
}

const MAX_EDGE = 1600;
/** The 400 px thumbnail of §6: the feed's 42x56 and the search list. */
const THUMB_EDGE = 400;
/**
 * The card-sized variant. A 3:4 card is up to 260 CSS px wide on a 2x screen,
 * and a crop can zoom in on top of that, so 400 px was being blown up three
 * or four times over and looked like it. 900 px on the long edge covers a card
 * at 2x with a 2x crop and still weighs a fraction of the full picture.
 */
const CARD_EDGE = 900;

export type AssetVariant = 'full' | 'card' | 'thumb';

const ACCEPTED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/tiff',
]);

export function assetPath(id: string, variant: AssetVariant = 'full') {
  if (variant === 'thumb') return join(ASSETS_DIR, `${id}_400.webp`);
  if (variant === 'card') return join(ASSETS_DIR, `${id}_900.webp`);
  return join(ASSETS_DIR, `${id}.webp`);
}

export type StoredAsset = {
  id: string;
  width: number;
  height: number;
};

/**
 * §6: resize to max 1600 px, generate a 400 px thumbnail — plus a 900 px card
 * variant. All stored as webp; the crop rectangle lives on the placement, so
 * the stored image is never cropped and a player can recrop forever.
 */
/**
 * §19: a map is the one picture people zoom *into*, so it may keep more of
 * its pixels than a cover. Still capped: a 40 MB scan is a scan, not a map.
 */
export const MAP_EDGE = 3200;

export async function storeImage(
  input: Buffer,
  filename: string,
  mime: string,
  uploadedBy: string | null,
  options: { maxEdge?: number; limitBytes?: number } = {},
): Promise<StoredAsset> {
  const maxEdge = options.maxEdge ?? MAX_EDGE;
  const limit = options.limitBytes ?? PLAYER_UPLOAD_BYTES;
  if (input.byteLength > limit) {
    throw new Error(tooLargeMessage(limit));
  }
  if (!ACCEPTED.has(mime)) {
    throw new Error('Alleen afbeeldingen — JPEG, PNG, WebP, GIF, AVIF of TIFF.');
  }

  const pipeline = sharp(input, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) throw new Error('Dat bestand lijkt geen afbeelding te zijn.');

  const full = await pipeline
    .clone()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const thumb = await pipeline
    .clone()
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  const card = await pipeline
    .clone()
    .resize({ width: CARD_EDGE, height: CARD_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const id = newId();
  await writeFile(assetPath(id, 'full'), full.data);
  await writeFile(assetPath(id, 'thumb'), thumb);
  await writeFile(assetPath(id, 'card'), card);

  db.insert(schema.assets)
    .values({
      id,
      kind: 'image',
      filename: filename.slice(0, 200) || 'image',
      mime: 'image/webp',
      bytes: full.data.byteLength,
      width: full.info.width,
      height: full.info.height,
      uploadedBy,
    })
    .run();

  return { id, width: full.info.width, height: full.info.height };
}

export async function readAsset(id: string, variant: AssetVariant) {
  const row = db.select().from(schema.assets).where(eq(schema.assets.id, id)).get();
  if (!row) return null;
  const path = assetPath(id, variant);
  if (!existsSync(path)) {
    // Pictures uploaded before the card variant existed only have the other
    // two on disk. Make it once, from the full picture, and keep it.
    if (variant !== 'card') return null;
    const fullPath = assetPath(id, 'full');
    if (!existsSync(fullPath)) return null;
    const made = await sharp(await readFile(fullPath))
      .resize({ width: CARD_EDGE, height: CARD_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    await writeFile(path, made);
    return { body: made, mime: 'image/webp', filename: row.filename };
  }
  return { body: await readFile(path), mime: 'image/webp', filename: row.filename };
}
