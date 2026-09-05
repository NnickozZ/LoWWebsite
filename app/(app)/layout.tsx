import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { AppShell } from '@/components/AppShell';
import { getSessionUser } from '@/lib/auth/session';
import { activeCharacter, listCharacters } from '@/lib/characters';
import { db, schema } from '@/lib/db';
import { listEntryTypes } from '@/lib/entries/service';
import { cleanTypeText } from '@/lib/pageBlocks';
import { resolveWords } from '@/lib/words';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const settings = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).get();
  const types = listEntryTypes().map((t) => ({
    slug: t.slug,
    label: t.label,
    icon: t.icon,
    colour: t.colour,
    // §11: what this soort's own "Nieuw" button says, if the Keeper gave it one.
    newButton: cleanTypeText(t.pageText).newButton,
  }));

  // §11: the Keeper's words, resolved once here so every client component in
  // the shell reads the same list rather than each fetching settings.
  const words = resolveWords(settings?.words ?? {});

  // §18: who this person is being. A Keeper wears nobody, so their list is
  // empty and the menu shows a stamp instead of a switch.
  const me = {
    id: user.id,
    username: user.username,
    isKeeper: user.isKeeper,
    characters: user.isKeeper ? [] : listCharacters(user.id),
    activeId: user.isKeeper ? null : (activeCharacter(user.id)?.entryId ?? null),
  };

  // §11: the Keeper's accent colour, applied as the two red variables the
  // theme is built on. Validated on the way in, so this can never be anything
  // but a hex colour.
  const accent = (settings?.theme as { accent?: string } | null)?.accent;
  const accentCss =
    accent && /^#[0-9a-fA-F]{6}$/.test(accent)
      ? `:root,[data-theme='dark']{--stamp-red:${accent};--accent:${accent};}`
      : null;

  return (
    <>
      {accentCss && <style>{accentCss}</style>}
      <AppShell
        types={types}
        words={words}
        me={me}
        siteName={settings?.name ?? 'Zeeland Case Files'}
        tagline={settings?.tagline ?? ''}
        logoAssetId={settings?.logoAssetId ?? null}
      >
        {children}
      </AppShell>
    </>
  );
}
