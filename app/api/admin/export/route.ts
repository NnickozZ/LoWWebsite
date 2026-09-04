import { requireKeeper } from '@/lib/auth/session';
import { apiError } from '@/lib/api';
import { ASSETS_DIR, sqlite } from '@/lib/db';
import { logAudit } from '@/lib/entries/service';
import { archiveName, buildArchive } from '@/lib/archive.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * §11: "Download everything" — every table as JSON plus every asset, the same
 * zip the nightly backup writes to /data/backups.
 */
export async function GET() {
  try {
    const keeper = await requireKeeper();
    const { zip, tables, assets } = buildArchive(sqlite, ASSETS_DIR);
    const filename = archiveName();

    logAudit({
      actorId: keeper.id,
      action: 'archive.exported',
      meta: { tables: tables.length, assets },
    });

    return new Response(new Uint8Array(zip), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${filename}"`,
        'content-length': String(zip.byteLength),
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
