import { viewerCanEdit } from '@/lib/access';
import { getWords } from '@/lib/admin/words';
import { presenceColour } from '@/lib/boards/live';
import { windowPresenceName } from '@/lib/characters';
import { listCasesWithMembers, listRevealableUsers } from '@/lib/entries/secrets';
import type { SessionUser } from '@/lib/auth/session';
import { snapshot } from '@/lib/live/docs';
import { admit, sectionRoomKey } from '@/lib/live/rooms';
import {
  getHomeOverzicht,
  getOverzichtBySlug,
  listOverzichten,
  overzichtHref,
} from '@/lib/overzichten/service';
import { listSections } from '@/lib/sections/service';
import type { SectionLite } from '@/components/entry/SectionsEditor';
import type { OverzichtLite } from '@/components/overzichten/OverzichtView';

/**
 * §75: alles wat een overzichtpagina nodig heeft, één keer opgeschreven.
 *
 * Er zijn twee pagina's die precies hetzelfde laden — de voordeur (`/wiki`) en
 * elk ander overzicht (`/wiki/overzicht/[slug]`) — en het enige verschil is
 * *welke rij* er opgehaald wordt. De rest is regel voor regel gelijk, inclusief
 * het stuk dat het makkelijkst stil fout gaat: elke sectie moet zijn eigen
 * kamer meekrijgen (§20), en de secties die deze lezer niet mag zien verlaten
 * `listSections` niet, dus ze staan ook niet in de HTML (regel 1).
 *
 * Twee pagina's met dit met de hand erin geplakt zou betekenen dat de volgende
 * ronde er eentje verbetert en de andere vergeet.
 */
export type LoadedOverzicht = {
  overzicht: OverzichtLite;
  siblings: OverzichtLite[];
  sections: SectionLite[];
  canEdit: boolean;
  /** §50: which side this page stands on, for the stamp and the detour. */
  keeperOnly: boolean;
  revealUsers: ReturnType<typeof listRevealableUsers>;
  revealCases: ReturnType<typeof listCasesWithMembers>;
  liveUser: { name: string; colour: string } | null;
};

export async function loadOverzichtPage(
  which: { home: true } | { slug: string },
  /*
   * The whole session user, not a `Viewer`: the presence name a caret carries
   * is the *account* name for a Keeper (§21), and a Viewer has no username to
   * give. Everything else here takes a Viewer and a SessionUser is one.
   */
  user: SessionUser | null,
): Promise<LoadedOverzicht | null> {
  // §46: beide zijn *opzoekingen*, dus zonder kantfilter — een Keeper loopt er
  // van beide kanten naar binnen en de pagina moet er staan.
  const row = 'home' in which ? getHomeOverzicht(user) : getOverzichtBySlug(which.slug, user);
  if (!row) return null;

  const words = getWords();
  const isKeeper = Boolean(user?.isKeeper);
  const canEdit = viewerCanEdit('overzicht', row.id, user);

  const sections = listSections('overzicht', row.id, user).map((section) => {
    const admission = admit(sectionRoomKey(section.id), user);
    return {
      id: section.id,
      title: section.title,
      body: section.body,
      visibility: section.visibility,
      revealedTo: section.revealedTo,
      live: admission
        ? {
            room: admission.spec.key,
            state: snapshot(admission.spec).state,
            canEdit: admission.canEdit,
          }
        : null,
    };
  });

  // §46: dit *is* een lijst, dus wel een kantfilter. De strip laat nooit een
  // deur van de andere kant van het archief zien.
  const siblings = listOverzichten(user)
    .filter((other) => other.id !== row.id)
    .map(toLite);

  return {
    overzicht: toLite(row),
    siblings,
    sections,
    canEdit,
    keeperOnly: row.keeperOnly,
    // Alleen een Keeper kiest wie een sectie mag lezen (§70), dus alleen een
    // Keeper krijgt de namen om uit te kiezen.
    revealUsers: isKeeper ? listRevealableUsers() : [],
    revealCases: isKeeper ? listCasesWithMembers() : [],
    liveUser: user
      ? { name: windowPresenceName(user, words.keeper), colour: presenceColour(user.id) }
      : null,
  };
}

function toLite(row: {
  id: string;
  name: string;
  slug: string;
  lead: string;
  isHome: boolean;
  icon: string;
}): OverzichtLite {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    lead: row.lead,
    isHome: row.isHome,
    icon: row.icon,
    href: overzichtHref(row),
  };
}
