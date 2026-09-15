import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
/*
 * §66: the stamboom's own stylesheet, brought in by the one page that is a
 * stamboom rather than pasted into `app/globals.css` — which is where every
 * round collides. Next hoists it into the page's own CSS chunk.
 */
import '@/app/stambomen.css';
import { inArray } from 'drizzle-orm';
import { LivePage } from '@/components/live/LivePage';
import { Icon } from '@/components/Icon';
import { ConnectionsLink } from '@/components/web/ConnectionsLink';
import { FamilyTreeCanvas } from '@/components/families/FamilyTreeCanvas';
import { TreeTitle } from '@/components/families/TreeTitle';
import { KeeperPanelServer } from '@/components/keeper/KeeperPanelServer';
import { KeeperStamp } from '@/components/keeper/KeeperStamp';
import { BinSlot } from '@/components/ui/BinSlot';
import { accessSettings, canEdit, canManageAccess, grantFor } from '@/lib/access';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { presenceColour } from '@/lib/boards/live';
import { displayNames, windowPresenceName } from '@/lib/characters';
import { db, schema } from '@/lib/db';
import { buildFamilyGraph } from '@/lib/families/graph';
import { getFamilyTreeBySlug, linkedFamiliesOf } from '@/lib/families/service';
import { inkForViewer } from '@/lib/ink/merge';
import { getInk } from '@/lib/ink/service';
import { sideOf } from '@/lib/keeper/kinds';
import { isKeeperSide, keeperRef, queryTail, sideDetour } from '@/lib/keeper/side';
import { twinOf } from '@/lib/keeper/ties';
import { familyTreeKey } from '@/lib/live/keys';

export const dynamic = 'force-dynamic';

/**
 * §66: één stamboom.
 *
 * The graph is built here, per viewer, so an artikel this reader may not see is
 * absent from their drawing — not a faint card, not a MISSING stamp (rule 1:
 * "X has a parent you may not see" is itself a secret).
 */
export default async function FamilyTreePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const { slug } = await params;
  const query = await searchParams;
  const tree = getFamilyTreeBySlug(slug, user);
  if (!tree) notFound();

  // §50: the page decides where you stand, before it renders. The query rides
  // along, so nothing a person came here to do is dropped by the detour.
  const detour = sideDetour(user, isKeeperSide('family_tree', tree.id), `/stambomen/${tree.slug}${queryTail(query)}`);
  if (detour) redirect(detour);

  const words = getWords();
  const graph = buildFamilyGraph(tree, user);

  /*
   * §66 (round 32): the other end of "Stamboom" on a Familie-artikel. Per
   * viewer, like everything else on this page — a Keeper-only familie pointing
   * here is simply not in the list, and with nobody pointing here the line is
   * not printed at all (it stands outside `.tree-tools`, so a line that comes
   * and goes would move the canvas, which is §64's whole complaint).
   */
  const linked = linkedFamiliesOf(tree.id, user);

  // §17: may this viewer draw in it, and may they turn its dials.
  const grant = user ? grantFor('family_tree', tree.id, user.id) : null;
  const mayEdit = canEdit(tree, user, grant);
  const mayManage = canManageAccess(tree, user);

  // §18: who put each person in the tree, by the name they wear. The tree keeps
  // no per-member author, so this is the people who might be standing here.
  const accounts = [...new Set([tree.createdBy, user?.id].filter((id): id is string => Boolean(id)))];
  const people = accounts.length
    ? db
        .select({ id: schema.users.id, username: schema.users.username, isKeeper: schema.users.isKeeper })
        .from(schema.users)
        .where(inArray(schema.users.id, accounts))
        .all()
    : [];
  const names = displayNames(people, words.keeper);
  const peopleNames = Object.fromEntries([...names.entries()].map(([id, one]) => [id, one.label]));

  // §21 vs §11: presence is not attribution — a Keeper standing here is their
  // account, where a Keeper who *wrote* something is the Keeper's word.
  const liveName = windowPresenceName(user, words.keeper);

  return (
    <div className="page-wide tree-page-shell">
      {/* §34: the stamboom takes the screen, like a tijdlijn and a landkaart. */}
      <div className="page-canvas">
        {/* §66: the canvas draws its own hands, in the tree's own coordinates.
            `watch={['entries']}` is the point of a window onto the artikelen:
            a name or a veld changed on somebody's page redraws the tree —
            §59's hold is what makes that harmless while a hand is on it. */}
        {/* §66: the tree's own key is watched as well as the artikelen. The
            canvas pulls the graph for itself, but the *head* — the name in the
            heading box, the dossier in the eyebrow — is server-rendered, so a
            rename by another hand only reaches it through a refresh. */}
        <LivePage place={familyTreeKey(tree.id)} watch={['entries', familyTreeKey(tree.id)]} pointers={false} />
        <header className="canvas-head">
          {/* §44/§45/§46: which side this stamboom is on — the word and the
              colours. §57: and where the toggle goes from here. */}
          <KeeperStamp
            side={sideOf(Boolean(user?.isKeeper && keeperRef('family_tree', tree.id, user)?.keeperOnly))}
            flipTo={twinOf('family_tree', tree.id, user)?.href}
            flipList="/stambomen"
          />
          <p className="eyebrow">
            <Link href="/stambomen" style={{ color: 'inherit' }}>
              <Icon name="chevron" size={12} style={{ transform: 'rotate(180deg)' }} /> {words.navFamilyTrees}
            </Link>
            {tree.caseSlug && tree.caseName && (
              <>
                {' · '}
                <span className="canvas-head-of">
                  <Link href={`/c/${tree.caseSlug}`} style={{ color: 'inherit' }}>
                    <Icon name="folder" size={12} /> {tree.caseName}
                  </Link>
                </span>
              </>
            )}
            {/* §66 (round 32): whose stamboom this is, read off the Familie's
                own infobox — the other side of its Stamboom field. It stands
                in the eyebrow beside the dossier because it is the same kind of
                fact ("this belongs to …"), and because the heading row is one
                line and has no room for a second sentence. Per lezer: a
                Keeper-only familie is not printed to a player (rule 1). */}
            {linked.map((family) => (
              <span key={family.id}>
                {' · '}
                <span className="canvas-head-of" data-testid="tree-head-of">
                  <Link href={`/e/${family.slug}`} style={{ color: 'inherit' }} data-entry-id={family.id}>
                    <Icon name={family.icon} size={12} /> {family.name}
                  </Link>
                </span>
              </span>
            ))}
          </p>
          {/* §34/§66: the heading *is* the name box. It used to be printed
              here and again in the canvas's own bar, which on a telephone was
              two rows of screen saying one thing. */}
          <TreeTitle id={tree.id} name={tree.name} canEdit={mayEdit} />
          {tree.description && <p className="small muted canvas-head-desc">{tree.description}</p>}
          {/* §43/§66: the web, with this stamboom in the middle. */}
          <ConnectionsLink kind="family_tree" id={tree.id} />
        </header>

        <FamilyTreeCanvas
          tree={tree}
          initialGraph={graph}
          canEdit={mayEdit}
          viewerId={user?.id ?? null}
          isKeeper={Boolean(user?.isKeeper)}
          peopleNames={peopleNames}
          liveUser={user ? { name: liveName, colour: presenceColour(user.id) } : null}
          access={{
            settings:
              mayManage || tree.accessLocked
                ? accessSettings(tree, 'family_tree', tree.id)
                : {
                    ownerId: null,
                    viewMode: tree.viewMode,
                    editMode: tree.editMode,
                    locked: tree.accessLocked,
                    viewers: [],
                    editors: [],
                  },
            canManage: mayManage,
            inWeb: tree.inWeb,
          }}
          initialInk={inkForViewer(getInk(tree.id), user?.id ?? null)}
        />
      </div>
      {/* §44: the Keeper's corner — the second face of this tree, what it is
          roped to, and the notes the pair share. Below the fold, so a player's
          page is nothing but the canvas. */}
      {user?.isKeeper && (
        <div className="keeper-underfold">
          {/*
            §34/§66: the empty div is where `FamilyTreeCanvas` puts the
            tekenlaag switch (the landkaart's `#map-underfold`, same idea and
            the same 132 px). It is a *tool*, and inside the canvas column it
            was 132 px off the stage — on a telephone the difference between a
            stamboom that fills three-quarters of the screen and one that fills
            under half, and for Keepers only, which is the sort of thing nobody
            sees until somebody measures it.
          */}
          <div id="tree-underfold" />
          <KeeperPanelServer kind="family_tree" id={tree.id} user={user} />
        </div>
      )}
      {/*
       * §11: de prullenbak-lade. Below the fold like everything else on this
       * page, and *outside* `.page-canvas`, so §34's "the stage gets the
       * screen" still holds — a folded `<details>` inside the canvas column
       * would cost the drawing its own height.
       */}
      {mayEdit && (
        <div className="keeper-underfold">
          <BinSlot
            endpoint={`/api/family-trees/${tree.id}`}
            noun={words.familyTree}
            redirectTo="/stambomen"
            note={`De ${words.entryPlural} erin blijven staan.`}
            testId="tree-bin"
          />
        </div>
      )}
    </div>
  );
}
