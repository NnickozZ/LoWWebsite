import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { AppShell } from '@/components/AppShell';
import { AuthorProvider } from '@/components/you/AuthorProvider';
import { uploadLimitFor } from '@/lib/assets';
import { getSessionUser } from '@/lib/auth/session';
import { activeCharacter, listCharacters } from '@/lib/characters';
import { db, schema } from '@/lib/db';
import { listEntryTypes } from '@/lib/entries/service';
import { cleanTypeText } from '@/lib/pageBlocks';
import { readingFontAttr } from '@/lib/readingFont';
import { getSchemes } from '@/lib/admin/schemes';
import { schemeStyle, themeAttr } from '@/lib/theme/schemes';
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
    // §24: made in a dossier and nowhere else.
    caseOnly: t.caseOnly,
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
    // §44: a Keeper looking through a player's eyes is a player everywhere but
    // in the one banner that offers to give them their own eyes back.
    isRealKeeper: user.isRealKeeper,
    asPlayer: user.asPlayer,
    // §46: which side this browser is standing on, for the toggle.
    side: user.side,
    characters: user.isKeeper ? [] : listCharacters(user.id),
    activeId: user.isKeeper ? null : (activeCharacter(user.id)?.entryId ?? null),
  };

  /*
   * §45: the four colour schemes, written out as one block of custom
   * properties. This replaces §11's single accent rule, which set two
   * variables — the accent is still honoured, folded into the stamp of all
   * four schemes by `cleanSchemes` until the Keeper touches the Kleuren pane.
   *
   * Every colour that reaches the page has been through `cleanSchemes`, so
   * nothing but six hex digits can be in here; and it is rendered on the
   * server, so no screen is ever painted in the wrong palette first.
   */
  const schemeCss = schemeStyle(getSchemes());

  /*
   * §29: the face this person reads in. `<html>` belongs to the root layout,
   * which knows nothing about accounts, so the attribute goes on one wrapper
   * here — custom properties cascade, so a wrapper is enough, and it is
   * rendered on the server, so nobody ever sees a paragraph in the wrong font
   * and then watch it change. An account on the archive's own letter gets no
   * attribute at all.
   */
  const fontAttr = readingFontAttr(user.readingFont);

  return (
    /*
     * §45: `data-theme` sits on the same wrapper as §29's `data-font`, and for
     * the same reason — it is found from the root with `:has()`, so it reaches
     * a Sheet portalled onto <body> as well as the page. Which *side's*
     * colours these are is not decided here: a keeper-only page renders its
     * own `data-side` marker (`components/keeper/KeeperSideMark.tsx`), and the
     * selectors in `lib/theme/schemes.ts` do the rest.
     */
    <div
      data-font={fontAttr}
      data-theme={themeAttr(user.colourScheme)}
      /*
       * §46: the side this browser stands on. A record's page may say
       * otherwise for the record it shows — its own mark wins (see
       * `KeeperSideMark`) — but every list, and the shell itself, is this.
       */
      data-side={user.side === 'keeper' ? 'keeper' : undefined}
    >
      <style>{schemeCss}</style>
      {/*
       * §18b: who this *window* is writing as. Above the shell on purpose —
       * it has to put the window's remembered answer where the `fetch` patch
       * can see it before the first request leaves and before `LiveProvider`
       * opens its `EventSource`, and only a component that renders earlier
       * than they do can promise that.
       */}
      <AuthorProvider me={me} words={words}>
        <AppShell
          types={types}
          words={words}
          me={me}
          uploadLimit={uploadLimitFor(me)}
          siteName={settings?.name ?? 'Zeeland Case Files'}
          tagline={settings?.tagline ?? ''}
          logoAssetId={settings?.logoAssetId ?? null}
        >
          {children}
        </AppShell>
      </AuthorProvider>
    </div>
  );
}
