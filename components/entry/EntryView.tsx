'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Beurs } from '@/components/kamer/Beurs';
import { OpenRoomButton } from '@/components/kamer/OpenRoomButton';
import { MEANING } from '@/components/kamer/plekWords';
import { AccessEditor, accessLabel, type AccessSettings } from '@/components/access/AccessEditor';
import { AddToCaseButton } from '@/components/cases/AddToCaseButton';
import type { PendingEdit } from '@/lib/entries/review';
import { ConnectMapButton } from './ConnectMapButton';
import { ProposalsPanel } from './ProposalsPanel';
import { PinToBoardButton } from '@/components/boards/PinToBoardButton';
import { ConnectionsLink } from '@/components/web/ConnectionsLink';
import { InTreeDoors } from '@/components/families/InTreeDoor';
import dynamic from 'next/dynamic';
import { RichEditor } from '@/components/editor/RichEditor';
import type { LivePerson, LiveSave, LiveStatus, LiveUser } from '@/components/editor/useLiveDoc';
import { LiveField, LiveFields, ShortField } from '@/components/live/LiveFields';
import { useLiveChanges } from '@/components/live/LiveProvider';
import { entryKey } from '@/lib/live/keys';
import { MentionText } from '@/components/ui/MentionPopover';
import { useUi } from '@/components/ui/UiProvider';
import { useAuthorOptional } from '@/components/you/AuthorProvider';
import { useHasRail, useIsWide } from '@/components/useIsPhone';
import { openSheetCount } from '@/lib/sheetStack';

/** §20: client-only, so the server never holds a second copy of Yjs. */
const LiveBody = dynamic(() => import('@/components/editor/LiveBody').then((m) => m.LiveBody), {
  ssr: false,
  // §104, golf J (j4): the text as the server drew it (`VoorafTekst`), through a context — `loading` takes no props.
  loading: () => <VoorafPlek />,
});
import {
  DEFAULT_BODY_PLACEHOLDER,
  DEFAULT_DESCRIPTION_PLACEHOLDER,
  defaultBlockTitle,
  type PageBlock,
  type TypeText,
} from '@/lib/pageBlocks';
import type { FieldDef, Visibility } from '@/lib/db/schema';
import type { CoverCrops } from '@/lib/images/shapes';
import { capitalise, fill } from '@/lib/words';
import type { ArticleMode } from '@/lib/entries/mode';
import { tagListHref } from '@/lib/entries/tagHref';
import { isEmptyDoc } from '@/lib/entries/doc';
import { CoverEditor } from './CoverEditor';
import { EntryOutline, type OutlineItem } from './EntryOutline';
import { Vooraf, VoorafPlek, VoorafTekst } from '@/components/editor/VoorafTekst';
import { HeadingAnchors } from './HeadingAnchors';
import { OriginLine, type OriginCaseLite } from './OriginLine';
import { PlaceOnButton } from './PlaceOnButton';
import {
  FieldsEditor,
  FieldsPeek,
  FieldsView,
  fieldValue,
  type CaseRefs,
  type DerivedFieldNotes,
  type EntryRefs,
} from './FieldsEditor';
import { RevealPicker, type RevealableCase, type RevealableUser } from './RevealPicker';
import { SectionsEditor, type SectionLite } from './SectionsEditor';
import { TagsEditor } from './TagsEditor';
import { typingScroll } from '@/lib/entries/typingView';
import { toSaveReport, useAutosave, useSaveState } from './useAutosave';
import { useReportSave } from '@/components/live/saveRegister';
import { takeEarlyPress, VROEGE_KLIK_SCRIPT } from '@/lib/vroegeKlik';

export type EntryViewData = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  body: unknown;
  fields: Record<string, unknown>;
  tags: string[];
  coverAssetId: string | null;
  coverCrop: CoverCrops | null;
  /** Golf K: the stored size of the omslag (`assetSize`), for the `<img>`'s width and height. */
  coverSize?: { width: number; height: number } | null;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
  /**
   * §90: where a tag chip on this page goes — the list of this soort, filtered
   * on that tag. Optional so a caller that has no soort to hand still gets a
   * working link (to `/wiki/alles`).
   */
  typeSlug?: string;
  typeFields: FieldDef[];
  /** §11: what this soort's page is made of, already resolved on the server. */
  typeBlocks: PageBlock[];
  /** This soort's own wording, where it has any. */
  typeText: TypeText;
  visibility: Visibility;
  isLocked: boolean;
  /** Keeper only; a player's list is empty because it never left the server. */
  revealedTo: string[];
};

const VISIBILITY_LABELS: Record<Visibility, string> = {
  all: 'Iedereen',
  keeper: 'Alleen de Keeper',
  players: 'Gekozen spelers',
};

type Patch = Record<string, unknown>;

function autosize(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}

export type EntryCaseLite = { id: string; slug: string; name: string; confidential: boolean };

/**
 * The artikel page (reworked 5 Sep 2026; two faces since §22).
 *
 * §22. The page has a *reading* face and an *editing* face, and the toggle at
 * the top of the header switches between them. Reading is what a wiki article
 * looks like to anybody who has ever used one: a title, the picture and the
 * facts in a box on the right, prose underneath, and not one input. Editing is
 * the page this archive had before, every line a field. Which face you land in
 * is your own setting (Jouw account → Lezen of bewerken); until you set it,
 * your role decides — a Keeper writes the archive so a Keeper lands in
 * editing, everyone else came to read.
 *
 * The editing face is not a right. A player who may only propose can open it
 * too; their changes simply travel as proposals (§10, §17). What the two faces
 * separate is intent, not permission — the old page asked everyone to fill in
 * a form whether they had come to write or only to look something up.
 *
 * Three columns on a wide screen (§25), in this order across the page: the
 * text — title, body, sections, lists, backlinks, history, in the order the
 * Keeper gave the soort — then "Op deze pagina" in a narrow middle column (an
 * outline that scrolls along and marks where you are), then a sidebar holding
 * the picture with "Meer info" directly under it as one box (§22: the wiki
 * shape — Wikipedia, Fandom and everything after them put the image at the top
 * of the infobox, and a reader arriving from any of those already knows to
 * look there). The outline stands beside the text it is a signpost for, not
 * under the facts: it is not a fact about the artikel. Rights, visibility,
 * Keeper notes and the bin sit at the foot of the text under one heading,
 * "Beheer van dit artikel", so that reading and managing are two different
 * places.
 *
 * There is exactly one wide layout and one narrow one, and the whole page
 * turns at 1280 px — the `@media` block around `.entry-layout-wide` in
 * `app/globals.css`, which is where the arithmetic for it is written down,
 * and `useIsWide` in `components/useIsPhone.ts`, the same number. Since golf
 * J (j4) the stylesheet does the turning and the hook only tidies up after
 * hydration: the server cannot know the width, so the first paint has to be
 * right at every width by CSS alone. Under 1280 px the header comes first, the
 * picture and the infobox fold up under it at full width, the outline becomes
 * a row of jump chips, and the text runs on alone underneath. Nothing between
 * those two shapes: the outline used to step back under the infobox between
 * 1024 and 1279 px, which made a designed layout look like a bug.
 *
 * The shapes are borrowed, on purpose: Wikipedia and Fandom put a page's facts
 * in an infobox beside the prose, Notion, Craft and Google Docs keep an
 * outline beside a long document, and every one of them keeps settings away
 * from content. Recognition over recall, progressive disclosure, overview
 * first — the page is easier to find your way around because it looks like
 * pages people already know.
 */
export function EntryView({
  entry,
  knownTags,
  isKeeper,
  openAddMore,
  cases,
  caseLinks,
  resolvedRefs,
  derivedFields,
  sections,
  revealUsers,
  revealCases,
  slots,
  access,
  proposals,
  character,
  playedBy,
  roomDoor,
  canOpenRoom,
  onMaps,
  mapsToPlace,
  mapsOfThis,
  onTimelines,
  timelinesToPlace,
  origin,
  live,
  liveFields,
  emptyBlocks = [],
}: {
  entry: EntryViewData;
  /**
   * §104 (ronde 67·herstel, #13): the read blocks with nothing in them for this
   * reader — *Genoemd in* and *Geschiedenis* at 0. Their slot is one quiet
   * line, and there is nothing to jump to, so they are not in the outline.
   */
  emptyBlocks?: string[];
  knownTags: string[];
  isKeeper: boolean;
  openAddMore: boolean;
  cases: EntryCaseLite[];
  /**
   * §21: the dossiers this artikel's own fields point at, resolved on the
   * server for this viewer. Only ids are stored, so this map is the only place
   * a dossier's name comes from — one the reader may not open is simply not in
   * it, and the field prints nothing rather than naming it.
   */
  caseLinks: CaseRefs;
  /**
   * §67: the *artikelen* this infobox names, resolved on the server for this
   * viewer (`resolveFieldRefs`) — the same idea as `caseLinks` above, one round
   * later, and for the same three reasons. A stored `entry_link(s)` value is a
   * `{ id, name, slug }` copy taken when somebody picked it, so on its own it
   * links to a destroyed artikel for ever, prints a name that has since
   * changed, and — the one that matters — names an artikel this reader may not
   * see. An id that is not in this map is not printed on either face.
   */
  resolvedRefs: EntryRefs;
  /**
   * §67: what the archive works out *under* a field, by field key, rendered on
   * the server exactly as `slots` are and for the same reason. Today there is
   * one: the derived broers en zussen under `broers_zussen`.
   */
  derivedFields: DerivedFieldNotes;
  sections: SectionLite[];
  revealUsers: RevealableUser[];
  revealCases: RevealableCase[];
  /**
   * §11. Blocks whose contents are a *read* — the self-filling lists, the
   * backlinks, the history, the delete box — are rendered on the server and
   * handed here by block id, so their queries stay behind
   * `visibleEntryCondition` and never travel to a player's browser as props.
   * This component only decides where on the page each one lands. The bin
   * comes in under the id `delete`.
   */
  slots: Record<string, ReactNode>;
  /** §17: the owner's dials, and what this viewer is allowed to do with them. */
  access: {
    settings: AccessSettings;
    canManage: boolean;
    canEdit: boolean;
    viewerId: string;
  };
  /** §17: proposals waiting on this artikel — only the owner or a Keeper gets any. */
  proposals: PendingEdit[];
  /**
   * §18: is this artikel one of the viewer's characters? `null` for a Keeper.
   *
   * §18c: `mayTie` is whether the button that ties it on may be offered at all
   * — true only for a speler who holds nobody, because their first onderzoeker
   * is the one thing they still hand themselves. Everything after that the
   * Keeper gives out from Beheer, so there is no button here to press.
   */
  character: { linked: boolean; active: boolean; mayTie: boolean } | null;
  /** §18: the other accounts that play this artikel. */
  playedBy: string[];
  /**
   * §85: de kamer van deze onderzoeker, als hij er een heeft en deze ogen hem
   * mogen zien (`roomSummary` beantwoordt allebei, en geeft null voor een
   * artikel dat niemand draagt). Eén regel onder de kop: de beurs en de deur.
   *
   * Het staat hier en niet in een paneel omdat dit de plek is waar iemand naar
   * een onderzoeker kíjkt — en tot ronde 46 was dit het enige scherm over een
   * onderzoeker waar zijn kamer niet genoemd werd. Je kwam er alleen via `/you`
   * of via een spelerspagina, allebei over een *account*, terwijl een kamer aan
   * de onderzoeker hangt (§17/§18).
   */
  roomDoor: { href: string; balance: number; own?: boolean } | null;
  /**
   * §86: mag deze hand deze onderzoeker een kamer *geven*?
   *
   * Alleen de Keeper, en alleen zolang er nog geen kamer is — dus precies het
   * geval waarin `roomDoor` null is. Twee velden en geen één afgeleide: de
   * pagina weet of er een kamer bestaat zonder er een te máken (`roomIdFor`),
   * en dat is de hele reden dat dit niet één veld is.
   */
  canOpenRoom: boolean;
  /** §19: the maps this artikel is pinned on… */
  onMaps: { pinId: string; mapSlug: string; mapName: string }[];
  /** …and the ones it is not on yet. */
  mapsToPlace: { slug: string; name: string }[];
  /**
   * §23: the landkaarten that *are* this artikel — the floor plan of this
   * building, the chart of this harbour. The other direction from a speld: a
   * speld says where this artikel sits on someone else's map, this says the
   * drawing is of it. A Keeper hooks one up on the landkaart's own page.
   */
  mapsOfThis: { slug: string; name: string }[];
  /** §32: where this artikel is on the tijdlijnen, and which it could still go on. */
  onTimelines: { eventId: string; timelineSlug: string; timelineName: string; when: string }[];
  timelinesToPlace: { slug: string; name: string }[];
  /**
   * §24: where this artikel came from. `case` is the herkomst-dossier resolved
   * for this viewer on the server (null when there is none, or when it is one
   * they may not be told about); `pinned` is whether a person chose it rather
   * than it following the filing on its own; `offer` is whether the question
   * means anything here at all — an artikel in no dossier, that is not asking
   * for one, gets no line.
   *
   * §49: `prefix` is the tickbox — does every list print that dossier in front
   * of this artikel's name — and `cases` are the dossiers it is filed in, each
   * with whether this hand may take it out of that one. The list is here rather
   * than reused from the "In: …" chips because those are a reader's chips and
   * these carry a right per row.
   */
  origin: {
    case: OriginCaseLite | null;
    pinned: boolean;
    prefix: boolean;
    offer: boolean;
    cases: OriginCaseLite[];
  };
  /**
   * §20: the shared text, handed over in the page. `state` is the Yjs document
   * as the server had it; `canEdit` is the room's gate for this viewer.
   */
  live: { room: string; state: string; sv: string; canEdit: boolean; user: LiveUser } | null;
  /** §21: the name, the one-liner and the infobox texts as shared fields. */
  liveFields: { room: string; state: string; canEdit: boolean; user: LiveUser } | null;
}) {
  const ui = useUi();
  const router = useRouter();
  /*
   * §104 (golf J, j4): `null` until hydration — the server cannot know the
   * width. While it is `null` the page is drawn in a shape the stylesheet lays
   * out right at every width (see the golf j4 block in `app/leeskamer.css`);
   * once it is known, what the stylesheet was hiding is dropped. Nothing
   * moves: the first paint on a phone is already the phone's page.
   */
  const wide = useIsWide();
  // §104 (golf H, D1): the outline is a column only from 1500 px; under it, a row above the text.
  const railKnown = useHasRail();
  const rail = wide === false ? false : railKnown;

  /**
   * §21: the dossiers named in the fields. Seeded from the server and added to
   * as they are picked, so a dossier chosen a second ago has a name before the
   * page has been asked for again.
   */
  const [caseRefs, setCaseRefs] = useState<CaseRefs>(caseLinks);
  useEffect(() => {
    setCaseRefs((current) => ({ ...current, ...caseLinks }));
  }, [caseLinks]);

  /**
   * §22: which face this artikel is wearing. Per artikel and per visit, like
   * Wikipedia's own Lezen/Bewerken — everybody lands on Lezen, a Keeper as
   * much as a reader, and one click crosses over. Somebody who is not signed
   * in has nothing to edit with, so for them there is one face and no toggle.
   *
   * A brand-new artikel (`?new=1`) is the one exception and opens in editing:
   * you have just made it, so you are here to fill it in.
   */
  const canToggle = Boolean(access.viewerId);
  const [mode, setMode] = useState<ArticleMode>(canToggle && openAddMore ? 'edit' : 'view');
  const reading = mode === 'view';

  /*
   * §90: after "maak" comes "schrijf". Landing on `?new=1` put the focus on
   * `<body>`, so the first sentence of a brand-new artikel cost a click in the
   * text first. The editor is client-only and arrives a beat after the page,
   * so this waits for it (a few seconds at most) — and gives up the moment
   * anybody does anything first: a key, a press, or the caret put somewhere
   * on the page. A key matters most: `n` on a page that has just been made is
   * "make another one", and must not become the first letter of this one.
   * The caret is only ever *given*, never taken.
   */
  useEffect(() => {
    if (!(canToggle && openAddMore)) return;
    let tries = 0;
    const stop = () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', stop, true);
      window.removeEventListener('pointerdown', stop, true);
    };
    const timer = window.setInterval(() => {
      tries += 1;
      const active = document.activeElement;
      const main = document.querySelector('main');
      const free = !active || active === document.body || !main?.contains(active);
      if (!free || tries > 40) {
        stop();
        return;
      }
      if (openSheetCount() > 0) return;
      const editor = document.querySelector<HTMLElement>('.entry-body-block [contenteditable="true"]');
      if (!editor) return;
      stop();
      /*
       * Golf J (stuk 5): and where the caret is, you can see it. A plain
       * `focus()` scrolls the box in only just — on a phone its top edge
       * landed under the tab bar, so the letters went where nobody could read
       * them. The block (werkbalk and all) is put a fifth of the way down what
       * is visible, above the tab bar and above where a keyboard will come
       * (`typingScroll`). Not smooth: this is the page arriving, not a trip.
       */
      editor.focus({ preventScroll: true });
      const block = editor.closest<HTMLElement>('.entry-body-block') ?? editor;
      const tabs = document.querySelector<HTMLElement>('.tabs');
      // A fixed bar has no `offsetParent`; on a desk it is `display: none` and measures 0.
      const tabsRect = tabs?.getBoundingClientRect();
      const tabsTop = tabsRect && tabsRect.height > 0 ? tabsRect.top : null;
      const viewHeight = window.visualViewport?.height ?? window.innerHeight;
      const delta = typingScroll({
        blockTop: block.getBoundingClientRect().top,
        caretTop: editor.getBoundingClientRect().top,
        viewHeight,
        coverBottom: tabsTop === null ? 0 : window.innerHeight - tabsTop,
      });
      if (delta) window.scrollBy({ top: delta, behavior: 'instant' });
    }, 150);
    window.addEventListener('keydown', stop, true);
    window.addEventListener('pointerdown', stop, true);
    return stop;
    // Once, on landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * §90: on a phone the infobox is a folded `<details>`, open while reading
   * and shut while editing (§6/§22). Crossing faces used to fold it up under
   * the hand that had just read a fact and wanted to change it. Once somebody
   * has opened or shut it, that is the state it keeps across the switch.
   */
  const [infoboxOpen, setInfoboxOpen] = useState<boolean | null>(null);

  /*
   * Golf J (stuk 12): *Bewerken* getikt vóór de hydratatie deed niets, dus
   * bleef de pagina in Lezen en kwam de schrijfvraag niet. `VROEGE_KLIK_SCRIPT`
   * (naast de knop) onthoudt zo'n druk; hier wordt hij alsnog uitgevoerd,
   * precies zoals de knop het doet. Zie `lib/vroegeKlik.ts`.
   */
  useEffect(() => {
    if (!canToggle || !takeEarlyPress('bewerken')) return;
    setInfoboxOpen((was) => was ?? true);
    setMode('edit');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [name, setName] = useState(entry.name);
  const [shortDescription, setShortDescription] = useState(entry.shortDescription);
  const [tags, setTags] = useState(entry.tags);
  // §90: a tag chip opens this soort's list, filtered on it.
  const tagHref = (tag: string) => tagListHref(tag, entry.typeSlug);
  const [fields, setFields] = useState(entry.fields);
  const [cover, setCover] = useState({ assetId: entry.coverAssetId, crop: entry.coverCrop });
  const [visibility, setVisibility] = useState(entry.visibility);
  const [revealedTo, setRevealedTo] = useState(entry.revealedTo);
  const [isLocked, setIsLocked] = useState(entry.isLocked);
  // §18: tying this artikel on as a character, from the artikel itself.
  const [wardrobe, setWardrobe] = useState(character ?? { linked: false, active: false, mayTie: false });
  const [wardrobeBusy, setWardrobeBusy] = useState(false);
  // §91: één wie-regel — "Speel als …" here is a wissel like any other.
  const followPlay = useAuthorOptional()?.followPlay;
  const wear = useCallback(
    async (method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
      setWardrobeBusy(true);
      try {
        const response = await fetch('/api/characters', {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as { activeId?: string | null; error?: string };
        if (!response.ok) {
          ui.toast(data.error ?? 'Dat lukte niet.');
          return;
        }
        const active = data.activeId === entry.id;
        if (method === 'PATCH' && data.activeId !== undefined) followPlay?.(data.activeId);
        // §18c: with one on the peg the door has shut behind them — this was
        // their first and only self-koppeling.
        setWardrobe({ linked: true, active, mayTie: false });
        ui.toast(active ? `Je speelt nu als ${entry.name}.` : `${entry.name} is nu een van je karakters.`);
        router.refresh();
      } catch {
        ui.toast('Geen verbinding.');
      } finally {
        setWardrobeBusy(false);
      }
    },
    [entry.id, entry.name, router, ui, followPlay],
  );
  const notifiedFor = useRef<string | null>(null);

  const save = useCallback(
    async (patch: Patch) => {
      const response = await fetch(`/api/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok) return { ok: false, error: data.error };
      if (data.status === 'pending') {
        ui.toast(
          access.canEdit
            ? 'Naar de Keeper gestuurd ter beoordeling.'
            : 'Als voorstel naar de eigenaar gestuurd.',
        );
        return { ok: true, pending: true };
      }

      // §6: someone else touched this entry between our loads.
      const other = data.previousEditorName as string | null;
      if (other && data.previousEditorIsSomeoneElse && notifiedFor.current !== other) {
        notifiedFor.current = other;
        ui.toast(`${other} heeft dit ook bewerkt — ververst`);
        router.refresh();
      }
      return { ok: true };
    },
    [entry.id, router, ui, access.canEdit],
  );

  // §38: `fields` is a bag of independent answers, so two boxes filled inside
  // one autosave window are two answers and not two versions of one — see the
  // note on `mergeKeys`.
  const { state, set, flush } = useAutosave<Patch>({ save, mergeKeys: ['fields'] });
  const [accessNow, setAccessNow] = useState(access.settings);

  // §20: who else is in the text, and whether the line is up — reported by
  // the client-only editor below and shown in the header.
  const [liveStatus, setLiveStatus] = useState<{ others: LivePerson[]; status: LiveStatus; save: LiveSave }>({
    others: [],
    status: 'connecting',
    save: 'idle',
  });
  const [savedAt, setSavedAt] = useState<{ at: number; by: string | null; keys: string[] } | null>(null);
  const [fieldsVersion, setFieldsVersion] = useState(0);
  // §21: any change to this artikel, from anywhere, is a reason to re-read the
  // rest of the record. The body's own `saved` frame still arrives too.
  useLiveChanges([entryKey(entry.id)], () => setSavedAt({ at: Date.now(), by: null, keys: [] }));
  // The name and the one-liner are shared fields when the room is open and
  // this person may type: their text then comes from the room, not the fetch.
  const fieldsShared = Boolean(liveFields?.canEdit);
  // …and where that room's own keystrokes stand, for the one save word.
  const [fieldsStatus, setFieldsStatus] = useState<{ others: LivePerson[]; status: LiveStatus; save: LiveSave }>({
    others: [],
    status: 'connecting',
    save: 'idle',
  });
  // §90: one answer for the autosave and both rooms together — and §100: the
  // shell says it, beside the live dot, and only while this face writes.
  const saveState = useSaveState(state, [liveStatus, fieldsStatus]);
  useReportSave(reading ? null : toSaveReport(saveState));

  /**
   * Someone else saved the rest of the record — name, description, tags,
   * fields, cover. Fetch it and take over whatever this person is not in the
   * middle of typing; the text itself is already shared and needs nothing.
   */
  const lastSavedAt = useRef(0);
  useEffect(() => {
    const saved = savedAt;
    if (!saved || saved.at === lastSavedAt.current) return;
    lastSavedAt.current = saved.at;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/entries/${entry.id}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as {
          name: string;
          shortDescription: string;
          tags: string[];
          fields: Record<string, unknown>;
          coverAssetId: string | null;
          coverCrop: CoverCrops | null;
        };
        if (cancelled) return;
        const active = document.activeElement as HTMLElement | null;
        const focusedId = active?.id ?? '';
        // §22: while reading there is no input to fight over, so the fetched
        // value always wins — otherwise a name changed by someone else would
        // never reach a reader whose room happens to be writable.
        const holdFields = fieldsShared && !readingRef.current;
        if (!holdFields && focusedId !== 'entry-name') setName((current) => (current === data.name ? current : data.name));
        if (!holdFields && focusedId !== 'entry-lead') {
          setShortDescription((current) => (current === data.shortDescription ? current : data.shortDescription));
        }
        setTags((current) => (JSON.stringify(current) === JSON.stringify(data.tags) ? current : data.tags));
        setCover((current) =>
          current.assetId === data.coverAssetId && JSON.stringify(current.crop) === JSON.stringify(data.coverCrop)
            ? current
            : { assetId: data.coverAssetId, crop: data.coverCrop },
        );
        // The fields' text inputs are uncontrolled; new values need a remount,
        // which is only safe when nobody is typing in one of them.
        if (JSON.stringify(fields) !== JSON.stringify(data.fields) && !active?.closest('.entry-fields')) {
          setFields(data.fields);
          setFieldsVersion((n) => n + 1);
        }
      } catch {
        /* the next save will try again */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAt, entry.id]);

  // Read inside the refresh effect above, which must not re-run on a toggle.
  const readingRef = useRef(reading);
  readingRef.current = reading;


  const words = ui.words;
  /** §104 (L7): the column the heading anchors are laid over. */
  const mainRef = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------------ the outline */

  const [sectionTitles, setSectionTitles] = useState(sections.map((s) => ({ id: s.id, title: s.title })));
  const onOutlineChange = useCallback((next: { id: string; title: string }[]) => {
    setSectionTitles((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, []);

  const fieldsBlock = entry.typeBlocks.find((block) => block.kind === 'fields' && !block.hidden) ?? null;
  // Golf O: reading, the infobox is always there (it carries the soort), so it
  // has a heading even where the soort hid its fields block.
  const infoboxHeading = fieldsBlock ? fieldsBlock.title || defaultBlockTitle('fields', words) : defaultBlockTitle('fields', words);

  const showManage =
    access.canManage || access.settings.locked || proposals.length > 0 || isKeeper || Boolean(slots.delete);

  /*
   * §101: a Tekst with nothing in it is a heading over a blank while reading —
   * on a phone a whole screen of it. It is drawn on the editing face (that is
   * where you fill it) and dropped on the reading one. Asked of what the server
   * sent; a text somebody fills meanwhile comes in with the page's refresh.
   */
  const [bodyTouched, setBodyTouched] = useState(!reading);
  useEffect(() => {
    if (!reading) setBodyTouched(true);
  }, [reading]);
  // Once this page was in Bewerken the text may have been filled here, and
  // `entry.body` is still the server's copy — so from then on it stays drawn.
  const bodyEmpty = !bodyTouched && isEmptyDoc(entry.body);

  const outline = useMemo<OutlineItem[]>(() => {
    const items: OutlineItem[] = [];
    for (const block of entry.typeBlocks) {
      if (block.hidden || block.kind === 'fields') continue;
      const heading = block.title || defaultBlockTitle(block.kind, words);
      if (block.kind === 'body') {
        // §101: an empty Tekst is not drawn while reading, so nothing to jump to.
        if (reading && bodyEmpty) continue;
        items.push({ id: `block-${block.id}`, label: heading || 'Tekst', icon: 'file' });
      } else if (block.kind === 'sections') {
        // Nobody without sections has anything to jump to here — and while
        // reading that includes a Keeper, who is not being offered the
        // "Sectie toevoegen" button either.
        // §70: "who is offered the button" is the artikel's edit right now,
        // not the Keeper's badge.
        if ((!access.canEdit || reading) && sectionTitles.length === 0) continue;
        items.push({ id: `block-${block.id}`, label: heading || capitalise(words.sectionPlural), icon: 'book' });
        for (const section of sectionTitles) {
          items.push({ id: `section-${section.id}`, label: section.title || 'Zonder titel', level: 1 });
        }
      } else if (block.kind === 'links' || block.kind === 'derived') {
        if (emptyBlocks.includes(block.id)) continue;
        items.push({ id: `block-${block.id}`, label: heading || 'Lijst', icon: 'link' });
      } else if (block.kind === 'backlinks') {
        // §104 (#13): nothing mentions it — one quiet line, nothing to jump to.
        if (emptyBlocks.includes(block.id)) continue;
        items.push({ id: `block-${block.id}`, label: heading, icon: 'link' });
      } else if (block.kind === 'history') {
        if (emptyBlocks.includes(block.id)) continue;
        items.push({ id: `block-${block.id}`, label: heading, icon: 'clock' });
      }
    }
    if (showManage) items.push({ id: 'block-manage', label: words.manage, icon: 'shield' });
    return items;
  }, [access.canEdit, bodyEmpty, emptyBlocks, entry.typeBlocks, isKeeper, reading, sectionTitles, showManage, words]);

  /*
   * On a phone the infobox is one more thing to jump to — while editing. §104
   * (ronde 67·herstel, #17/#23): reading, the peek of the infobox stands right
   * under the chip row (or there is no infobox at all), so a chip that jumps
   * there jumped a few pixels; and its icon was the pencil of Bewerken. It is
   * `info` now, and only on the editing face.
   */
  const phoneOutline = useMemo<OutlineItem[]>(
    () =>
      fieldsBlock && !reading
        ? // Golf J (j4): `smal` — before hydration this row also stands at 1280–1499 px, where the infobox is beside the text.
          [{ id: 'block-info', label: infoboxHeading, icon: 'info', smal: true }, ...outline]
        : outline,
    [fieldsBlock, infoboxHeading, outline, reading],
  );

  /* ---------------------------------------------------------- the infobox */

  /**
   * §22: reading, the infobox is the facts that are *known* — a filled field
   * and a tag each get a row, an empty one gets nothing. That is the whole
   * difference between an infobox and a form: a form has to show you every
   * slot, an infobox only has to show you what is in them. An artikel whose
   * fields are all still empty therefore has no infobox at all while reading,
   * rather than a box of blank labels in its margin.
   */
  const readableFields =
    entry.typeFields.length > 0 ? (
      <FieldsView
        fields={entry.typeFields}
        values={fields}
        cases={caseRefs}
        refs={resolvedRefs}
        derived={derivedFields}
      />
    ) : null;
  /*
   * §104 asked whether anything was filled in before drawing the box at all
   * while reading. Golf O: the soort is always a fact, so the box always has
   * a row; an empty field still gets none (`FieldsView`).
   */

  /*
   * Golf O (Nick: "What type it is, move it to the more info box" and "remove
   * from what case it is, move it to the more info box"): the soort and the
   * dossiers stood above the title, the dossiers twice ("Uit:" and "In:").
   * Now they are the first rows of *Meer info*, in the same label/value shape
   * as a field. The dossier the artikel came from first, then the rest it is
   * filed in — every one already behind this reader's rules (`cases` and
   * `origin.case` are read per viewer on the server).
   */
  const infoCases = (() => {
    const seen = new Set<string>();
    const rows: { id: string; slug: string; name: string; confidential: boolean }[] = [];
    if (origin.case) {
      const filed = cases.find((item) => item.id === origin.case!.id);
      rows.push({ ...origin.case, confidential: filed?.confidential ?? false });
      seen.add(origin.case.id);
    }
    for (const item of cases) if (!seen.has(item.id)) rows.push(item);
    return rows;
  })();
  const infoFacts = (
    <div className="stack fields-compact fields-view infobox-feiten" data-testid="infobox-feiten">
      <div>
        <span className="label">{words.infoKind}</span>
        <div className="field-value">
          <Link
            className="chip chip-soort"
            href={entry.typeSlug ? `/wiki/${entry.typeSlug}` : '/wiki/alles'}
            style={{ ['--soort' as string]: entry.typeColour }}
            data-testid="infobox-soort"
          >
            <Icon name={entry.typeIcon} size={13} />
            {entry.typeLabel}
          </Link>
        </div>
      </div>
      {reading && infoCases.length > 0 && (
        <div>
          <span className="label">{capitalise(infoCases.length === 1 ? words.case : words.casePlural)}</span>
          <div className="field-value infobox-dossiers" data-testid="infobox-dossiers">
            {infoCases.map((item) => (
              <Link key={item.id} className="infobox-dossier" href={`/c/${item.slug}`}>
                <Icon name="folder" size={14} />
                <span>{item.name}</span>
                {item.confidential && (
                  <>
                    <Icon name="lock" size={12} />
                    <span className="visually-hidden">(vertrouwelijk)</span>
                  </>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const infoboxBody = reading ? (
    <div className="stack entry-infobox-body">
      {infoFacts}
      {readableFields}
      {tags.length > 0 && (
        <div className="infobox-tags">
          <span className="label">Tags</span>
          <div className="row-wrap infobox-tag-rij">
            {tags.map((tag) => (
              <a key={tag} className="tag" href={tagHref(tag)}>
                {tag}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : (
    <div className="stack entry-fields entry-infobox-body">
      {infoFacts}
      {/* §24/§49, golf O: where it came from, with the tickbox and *Kiezen*. */}
      {origin.offer && (origin.case || origin.cases.length > 0) && (
        <OriginLine
          entryId={entry.id}
          origin={origin.case}
          pinned={origin.pinned}
          prefix={origin.prefix}
          cases={origin.cases}
          canEdit={access.canEdit}
          reading={reading}
        />
      )}
      {fieldsBlock?.note && (
        <p className="tiny muted" style={{ margin: 0 }}>
          {fieldsBlock.note}
        </p>
      )}
      {entry.typeFields.length > 0 && (
        <FieldsEditor
          key={fieldsVersion}
          compact
          /* §101 (B25): the empty ones behind "+ Veld invullen". */
          foldEmpty
          fields={entry.typeFields}
          values={fields}
          cases={caseRefs}
          refs={resolvedRefs}
          derived={derivedFields}
          onCasePicked={(item) => setCaseRefs((current) => ({ ...current, [item.id]: item }))}
          onChange={(patch, meta) => {
            const next = { ...fields, ...patch };
            setFields(next);
            if (!meta?.live) set({ fields: patch });
          }}
        />
      )}
      <div className="infobox-tags">
        <span className="label">Tags</span>
        <TagsEditor
          tags={tags}
          known={knownTags}
          onChange={(next) => {
            setTags(next);
            set({ tags: next });
          }}
        />
      </div>
    </div>
  );

  // Golf O: reading, the soort is always a fact, so the box is always drawn.
  const showInfobox = reading || Boolean(fieldsBlock);
  // §92 (B11): on a narrow screen the fold is closed while reading unless the
  // hand opened it; editing, the soort's own "open" still decides.
  const infoboxShownOpen = infoboxOpen ?? ((Boolean(fieldsBlock?.open) && !reading) || openAddMore);

  /*
   * Golf J (j4): until the width is known this is the fold, and from 1280 px
   * the stylesheet opens it into the card (`::details-content`, the summary as
   * the card's title). On hydration a wide screen swaps it for the card
   * itself; nothing on screen changes.
   */
  const infobox = showInfobox ? (
    wide === true ? (
      <section id="block-info" className="entry-infobox" aria-labelledby="infobox-title">
        <h2 id="infobox-title" className="entry-infobox-title">
          {infoboxHeading}
        </h2>
        {infoboxBody}
      </section>
    ) : (
      <>
        <details
          id="block-info"
          className="section entry-infobox entry-infobox-folded"
          /*
           * §92 (B11): folded while reading too. It used to spring open on the
           * reading face, and on a phone that put a full list of facts between
           * the title and the first sentence — the text started 1.7 screens
           * down. The peek under it says what is in it; a tap opens the rest.
           */
          open={infoboxShownOpen}
          // §90: whatever the hand did last is what survives Lezen ↔ Bewerken.
          onToggle={(event) => setInfoboxOpen(event.currentTarget.open)}
        >
          <summary>{infoboxHeading}</summary>
          <div className="entry-infobox-inhoud">{infoboxBody}</div>
        </details>
        {reading && !infoboxShownOpen && (
          <FieldsPeek fields={entry.typeFields} values={fields} cases={caseRefs} refs={resolvedRefs} tags={tags} tagHref={tagHref} />
        )}
      </>
    )
  ) : null;

  /* -------------------------------------------------------------- the figure */

  /**
   * §22: the picture, at the top of the sidebar with the facts under it. There
   * is nothing to show reading an artikel that has no picture, and nothing
   * would be an empty frame in the margin — so on that one case the figure is
   * dropped and the box starts at the infobox.
   */
  const showFigure = !reading || Boolean(cover.assetId);
  const figure = showFigure ? (
    <CoverEditor
      assetId={cover.assetId}
      crop={cover.crop}
      alt={entry.name}
      icon={entry.typeIcon}
      colour={entry.typeColour}
      readOnly={reading}
      /* Golf K (Nick: "in articles on phone the images are fully visible
         just like on PC. Not cropped up."): the whole picture on every
         width, in its own card. §104 L5 laid it down under 1280 px, cut to
         the liggend crop; that is undone. The stored size keeps its place. */
      size={cover.assetId === entry.coverAssetId ? entry.coverSize ?? null : null}
      onChange={(next) => {
        setCover({ assetId: next.coverAssetId, crop: next.coverCrop });
        set({ coverAssetId: next.coverAssetId, coverCrop: next.coverCrop });
      }}
    />
  ) : null;

  /** The picture and the facts read as one box; either half may be missing. */
  const asideBox =
    figure || infobox ? (
      /* Golf J (j4): the stacked rules only hold under 1280 px (`@media`), so
         until the width is known the class can be there at every width. */
      <div className={`entry-aside-box${wide === true ? '' : ' entry-aside-box-stacked'}`}>
        {figure}
        {infobox}
      </div>
    ) : null;

  /* ------------------------------------------------------------ the blocks */

  /**
   * §11: one block of the page. The built-ins are drawn here; the ones that
   * are a read of the archive come in through `slots`, already rendered on the
   * server. A block the Keeper hid is simply not drawn — nothing is hidden
   * with CSS, which is the same rule the reveals follow. Every block carries
   * an id the outline can jump to.
   */
  function renderBlock(block: PageBlock): ReactNode {
    if (block.hidden) return null;
    const heading = block.title || defaultBlockTitle(block.kind, words);
    const note = block.note ? (
      <p className="tiny muted" style={{ margin: '0 0 0.5rem' }}>
        {block.note}
      </p>
    ) : null;
    const anchor = `block-${block.id}`;

    switch (block.kind) {
      case 'fields':
        // Drawn once, in the sidebar or folded under the header — never here.
        return null;

      case 'body':
        /* §101: `hidden`, not left out — the live text keeps its room and its
           editor across Lezen ↔ Bewerken, as it always did. */
        return (
          <section
            key={block.id}
            id={anchor}
            className="entry-block entry-body-block"
            hidden={(reading && bodyEmpty) || undefined}
            aria-label={heading || 'Tekst'}
          >
            {/* §104 (L6): reading, the text follows the lead with no heading
                over it unless the soort gave it one — "Tekst" is the label of
                a box to type in, and a wiki does not print it. The outline
                keeps its item, which jumps to this section. */}
            {(heading || !reading) && <h2 className="entry-block-title">{heading || 'Tekst'}</h2>}
            {note}
            {/* §104, golf J (j4): in Lezen the text is in the first paint, drawn on the server,
                and the editor takes its place at the same height when it arrives. */}
            <Vooraf.Provider value={reading && !bodyEmpty ? <VoorafTekst doc={entry.body} /> : null}>
              {live ? (
                /* §20: everyone types in the same text; a reader watches it live. */
                <LiveBody
                  room={live.room}
                  state={live.state}
                  user={live.user}
                  canEdit={live.canEdit}
                  /* §22: reading is the reader's own choice, not the room's. */
                  readOnly={reading}
                  placeholder={entry.typeText.bodyPlaceholder || DEFAULT_BODY_PLACEHOLDER}
                  /* Proposing is an act of editing; it belongs on that face. */
                  proposals={!reading}
                  onPropose={(doc) => {
                    set({ body: doc });
                    void flush();
                  }}
                  onStatus={setLiveStatus}
                  onSaved={setSavedAt}
                />
              ) : (
                <RichEditor
                  initialDoc={entry.body}
                  editable={!reading}
                  placeholder={entry.typeText.bodyPlaceholder || DEFAULT_BODY_PLACEHOLDER}
                  onChange={(doc) => set({ body: doc })}
                  vooraf={reading && !bodyEmpty ? <VoorafTekst doc={entry.body} /> : null}
                />
              )}
            </Vooraf.Provider>
          </section>
        );

      case 'sections':
        return (
          <div key={block.id} id={anchor} className="entry-block">
            {note}
            <SectionsEditor
              ownerKind="entry"
              ownerId={entry.id}
              sections={sections}
              isKeeper={isKeeper}
              /* §70: anyone who may edit the artikel may add a sectie; the
                 geheimhouding dial stays behind `isKeeper` inside. */
              canEdit={access.canEdit}
              readOnly={reading}
              users={revealUsers}
              cases={revealCases}
              liveUser={live?.user ?? null}
              onOutlineChange={onOutlineChange}
            />
          </div>
        );

      case 'links': {
        // The chosen entries live in `entries.fields` under the block's own
        // key, so they save through the ordinary autosave and the picker,
        // chips and remove buttons are the ones a field already has.
        const linkField: FieldDef = {
          key: block.key ?? block.id,
          label: heading || 'Lijst',
          kind: 'entry_links',
          ofType: block.ofType,
        };
        // §22: reading, an empty hand-filled list is not a list — it is an
        // invitation to fill one in, which is the other face's business.
        // §67: through the same fresh lookup as the infobox — a hand-filled
        // list is an `entry_links` field in all but name, and an empty one
        // after the lookup is an empty list.
        if (reading && !fieldValue(linkField, fields[linkField.key], {}, resolvedRefs)) return null;
        return (
          <details key={block.id} id={anchor} className="section entry-block" open={block.open || reading}>
            <summary>{heading || 'Lijst'}</summary>
            <div className="stack" style={{ padding: '0.6rem 0 1rem' }}>
              {note}
              {reading ? (
                <div>{fieldValue(linkField, fields[linkField.key], {}, resolvedRefs)}</div>
              ) : (
                <FieldsEditor
                  hideLabels
                  fields={[linkField]}
                  values={fields}
                  refs={resolvedRefs}
                  onChange={(patch) => {
                    const next = { ...fields, ...patch };
                    setFields(next);
                    set({ fields: patch });
                  }}
                />
              )}
            </div>
          </details>
        );
      }

      // Everything else is a read, rendered on the server and handed over as a
      // slot. Wrapped in a keyed Fragment rather than trusting the slot to have
      // brought a key of its own: these are the children of one array, and the
      // file that builds them is not the file that lists them, so the invariant
      // belongs here where the array is made. The anchor goes on a wrapper: the
      // slot's own markup is the server's business.
      default:
        return (
          <Fragment key={block.id}>
            <div id={anchor} className="entry-block">
              {slots[block.id] ?? null}
            </div>
          </Fragment>
        );
    }
  }

  /* ------------------------------------------------------------ the header */

  /*
   * §104 (ronde 67·herstel, #17): the facts of *where* — four rows of chips that
   * on a phone wrapped into two or three lines each between the lead and the
   * first sentence. The same rows, and a sentence that counts them.
   */
  // §104 (golf H, D21): every landkaart once — drawn on it or with a speld on it.
  const opKaarten = (() => {
    const seen = new Map<string, { slug: string; name: string; href: string }>();
    for (const item of onMaps) {
      if (!seen.has(item.mapSlug)) seen.set(item.mapSlug, { slug: item.mapSlug, name: item.mapName, href: `/maps/${item.mapSlug}?pin=${item.pinId}` });
    }
    for (const item of mapsOfThis) {
      if (!seen.has(item.slug)) seen.set(item.slug, { slug: item.slug, name: item.name, href: `/maps/${item.slug}` });
    }
    // In the order the page always had: the landkaarten that draw it first.
    const order = [...mapsOfThis.map((item) => item.slug), ...onMaps.map((item) => item.mapSlug)];
    return [...new Set(order)].map((slug) => seen.get(slug)!);
  })();
  const waarKaarten = opKaarten.length;
  const waarTijdlijnen = new Set(onTimelines.map((item) => item.timelineSlug)).size;
  const waarZin = capitalise(
    [
      waarKaarten ? fill(words.entryWhereOn, { n: String(waarKaarten), ding: waarKaarten === 1 ? words.map : words.mapPlural }) : '',
      waarTijdlijnen
        ? fill(words.entryWhereOn, { n: String(waarTijdlijnen), ding: waarTijdlijnen === 1 ? words.timeline : words.timelinePlural })
        : '',
    ]
      .filter(Boolean)
      .join(' · '),
  );
  const waarRijen = (
    <>
        {/* §22 rule 2: reading, this row is a fact — the landkaarten that draw
            this place — and prints only when there are any. The button that
            hooks one up is an action, and actions live on the other face. */}
        {/* §101: the row is a fact, so it prints only when there is one. With
            no landkaart yet it said "Uitgetekend op: Landkaart koppelen · nog
            niets" on every artikel for the Keeper, a Persoon included; the
            button for that case stands with the other actions above. */}
        {/*
          §104 (golf H, D21): one line, *Op de landkaart: A · B*. It was two —
          "Uitgetekend op" for the landkaarten that draw this place and "Op de
          landkaart" for the ones it has a speld on — and a town on the map of
          its own island said the same name twice, in capitals. Now each
          landkaart once (by its slug; a speld wins, because it opens the map
          on this place), in plain sentence letters: capitals are for soorten
          and labels, not for names. §101 still holds: no landkaart, no line.
        */}
        {opKaarten.length > 0 && (
          <p className="row-wrap tiny entry-waar-rij" data-testid="entry-op-kaart">
            <span className="muted entry-waar-label">{words.onTheMap}:</span>
            {opKaarten.map((item) => (
              <Link key={item.slug} className="chip" href={item.href}>
                {item.name}
              </Link>
            ))}
            {/* §19: hanging and hooking up landkaarten is Keeper work. Offered
                from here as well as from the map, because a Keeper writing up a
                place is on the place's page. */}
            {isKeeper && !reading && mapsOfThis.length > 0 && (
              <ConnectMapButton entryId={entry.id} entryName={name || entry.name} />
            )}
          </p>
        )}

        {/* §32: the same two sentences for tijdlijnen — where it *is* is a
            fact, "zet op…" is an action. */}
        {onTimelines.length > 0 && (
          <p className="row-wrap tiny entry-waar-rij">
            <span className="muted entry-waar-label">{words.onTheTimeline}:</span>
            {onTimelines.map((item) => (
              <Link
                key={item.eventId}
                className="chip"
                href={`/timelines/${item.timelineSlug}?event=${item.eventId}`}
                title={item.when}
              >
                <Icon name="timeline" size={12} />
                {item.timelineName}
                <span className="muted"> · {item.when}</span>
              </Link>
            ))}
          </p>
        )}

        {/* Golf O: the dossiers it is filed in moved to the infobox (*Meer
            info*), beside the soort — they are facts about the artikel, and
            here they stood twice, once as "Uit:" above the title. */}
    </>
  );

  const header = (
    /* §22: one column. The picture moved to the sidebar, so the header is the
       title and what surrounds it — there is no second column left to fill. */
    <div className="entry-head entry-head-solo">
      <div style={{ minWidth: 0 }}>
        <div className="row-wrap" style={{ marginBottom: '0.4rem' }}>
          {/* Golf O: the soort is a row of the infobox now (`infoFacts`). */}
          {isLocked && (
            <span className="chip">
              <Icon name="lock" size={13} />
              Vergrendeld
            </span>
          )}
          {visibility !== 'all' && (
            <span className="stamp">
              {visibility === 'keeper' ? 'Alleen voor de Keeper' : 'Onthuld'}
            </span>
          )}
          {wardrobe.linked && (
            <span className="chip" title={wardrobe.active ? 'Dit ben je nu' : 'Een van je karakters'}>
              <Icon name="mask" size={13} />
              {wardrobe.active ? `Jouw ${words.character}` : `Een van je ${words.characterPlural}`}
            </span>
          )}
          <div className="spacer" />
          {/*
            §100 (B14): the save word used to stand here, beside Lezen. It is
            the shell's now — one word beside the live dot, on every page that
            writes (`SaveStatus`, fed by `useReportSave` above) — so the head
            no longer grows a line for it on a phone.
          */}
          {/* §22: the two faces. Wikipedia's own pair of words, in ours. */}
          {canToggle && (
            <button
              type="button"
              className={`btn btn-small entry-mode-toggle${reading ? '' : ' entry-mode-toggle-on'}`}
              aria-pressed={!reading}
              data-vroeg={reading ? 'bewerken' : undefined}
              onClick={() => {
                // Anything half-typed goes to the archive before the inputs
                // that hold it leave the page.
                if (!reading) void flush();
                // §90: the folded infobox keeps the state it has now.
                setInfoboxOpen((was) => was ?? (Boolean(fieldsBlock?.open) || openAddMore || reading));
                setMode(reading ? 'edit' : 'view');
              }}
            >
              <Icon name={reading ? 'edit' : 'eye'} size={14} />
              {reading ? 'Bewerken' : 'Lezen'}
            </button>
          )}
          {/* Golf J (stuk 12): een druk vóór de hydratatie telt alsnog (`lib/vroegeKlik.ts`). */}
          {canToggle && <script dangerouslySetInnerHTML={{ __html: VROEGE_KLIK_SCRIPT }} />}
          {/* §21: who is here and whether the line is up now sit in the shell's strip, for every page alike. */}
        </div>

        {/*
          §24: the eyebrow. Which dossier this came out of, above the title,
          where a wiki article puts the series it belongs to — and where a
          player who has just opened a clue from a search result needs it. The
          lists print "Zaak Vlissingen: De brief" because a list has one line
          per artikel; the page has room to say it properly and link it. The
          "In: …" chips lower down are a different fact and stay where they are.
        */}
        {/* §92 (B23): only for an artikel that is in a dossier. The tickbox
            "Dossier voor de naam" with nothing to point at was two lines above
            the title for a setting that had no meaning yet. */}
        {/* Golf O (Nick: "remove from what case it is, move it to the more
            info box"): the eyebrow is a row of the infobox now — reading, the
            dossiers as chips (`infoFacts`); editing, this same line with its
            tickbox and *Kiezen*, at the top of the infobox's form. */}

        {/*
          §22: reading, the title is a heading and the one-liner is a
          paragraph — the two things every article on the web opens with. An
          empty one-liner simply is not there, where the editing face has to
          keep the box and its placeholder.
        */}
        {reading ? (
          <>
            {/* Golf O: *Verbindingen* is an icon beside the name, not a
                button in a row of them. */}
            <div className="entry-titel-rij">
              <h1 className="entry-title">{name}</h1>
              <ConnectionsLink kind="entry" id={entry.id} as="icon" />
            </div>
            {/* §48: the korte beschrijving is text like any other — an `@` in
                it is a chip, and the box that writes it offers the names. */}
            {shortDescription.trim() && (
              <p className="entry-lead">
                <MentionText text={shortDescription} tokens />
              </p>
            )}
            {/* Golf O: wie het laatst schreef staat sinds golf O in de kop van
                de geschiedenis (de server tekent hem daar), niet hier. */}
          </>
        ) : (
          <>
            <label className="visually-hidden" htmlFor="entry-name">
              Naam
            </label>
            <LiveField
              field="name"
              id="entry-name"
              className="title-input"
              value={name}
              onValue={(next, meta) => {
                setName(next);
                if (!meta.live) set({ name: next });
              }}
              onBlur={() => void flush()}
            />

            <label className="visually-hidden" id="entry-lead-label" htmlFor="entry-lead">
              Korte beschrijving
            </label>
            {/* §95: a chip in the box, with its artikel in it — the same
                gesture as the text below, stored as a handle (`ShortField`). */}
            <ShortField
              field="shortDescription"
              id="entry-lead"
              className="lead-input"
              ariaLabelledBy="entry-lead-label"
              placeholder={`${entry.typeText.descriptionPlaceholder || DEFAULT_DESCRIPTION_PLACEHOLDER} ${fill(words.mentionHint, { artikel: words.entry })}`}
              value={shortDescription}
              onValue={(next, meta) => {
                setShortDescription(next);
                if (!meta.live) set({ shortDescription: next });
              }}
              onBlur={() => void flush()}
            />
          </>
        )}

        {/*
          The tags are in the infobox too. Editing, that one is the control and
          this row is the echo; reading, the infobox row is the only one, so
          this echo would be the same list printed twice on one screen.
        */}
        {tags.length > 0 && !reading && (
          <div className="row-wrap" style={{ marginTop: '0.3rem' }}>
            {tags.map((tag) => (
              <a key={tag} className="tag" href={tagHref(tag)}>
                {tag}
              </a>
            ))}
          </div>
        )}

        {/* §104: `entry-acties` — on a phone, reading, one row that scrolls
            sideways (leeskamer.css) instead of three rows of buttons between
            the lead and the first sentence. */}
        <div className="row-wrap entry-acties" style={{ marginTop: '0.7rem' }}>
          {/* Golf O: filing and pinning are things you do while working on
              the artikel, and mostly from the dossier or the wall itself; in
              Lezen they were the two biggest buttons above the first sentence. */}
          {!reading && (
            <AddToCaseButton
              entryId={entry.id}
              entryName={entry.name}
              inCaseIds={cases.map((item) => item.id)}
            />
          )}
          {!reading && <PinToBoardButton entryId={entry.id} entryName={entry.name} />}
          {!reading && (
            <PlaceOnButton
              entryId={entry.id}
              entryName={name || entry.name}
              maps={mapsToPlace}
              timelines={timelinesToPlace}
            />
          )}
          {/* §101: a landkaart that draws this artikel, hooked up from here —
              the Keeper's, on the editing face, while there is none yet. */}
          {isKeeper && !reading && mapsOfThis.length === 0 && (
            <ConnectMapButton entryId={entry.id} entryName={name || entry.name} asAction />
          )}
          {/* §43: the web, with this artikel in the middle — reading, the icon
              beside the title (golf O). */}
          {!reading && <ConnectionsLink kind="entry" id={entry.id} />}
          {/* §94 (C20): and the stamboom this artikel stands in, with it chosen. */}
          <InTreeDoors />
          {/* §18c: offered only while there is nobody on the peg. A speler's
              first onderzoeker is theirs to tie on; the next one is handed to
              them from Beheer, so no button stands here that would only be
              refused. */}
          {character && !wardrobe.linked && wardrobe.mayTie && (
            <button
              type="button"
              className="btn btn-small"
              disabled={wardrobeBusy}
              onClick={() => void wear('POST', { entryId: entry.id })}
            >
              <Icon name="mask" size={15} />
              {words.thisIsMyCharacter}
            </button>
          )}
          {character && wardrobe.linked && !wardrobe.active && (
            <button
              type="button"
              className="btn btn-small"
              disabled={wardrobeBusy}
              onClick={() => void wear('PATCH', { active: entry.id })}
            >
              <Icon name="swap" size={15} />
              {fill(words.playAs, { naam: name || entry.name })}
            </button>
          )}
        </div>

        {playedBy.length > 0 && (
          <p className="tiny muted" style={{ marginTop: '0.5rem' }}>
            Gespeeld door {playedBy.join(', ')}
          </p>
        )}

        {/* §85: de kamer van deze onderzoeker. Zie de prop voor waarom. */}
        {roomDoor && (
          <p className="row-wrap entry-kamer" data-testid="entry-kamer" data-eigen={roomDoor.own ? 'ja' : 'nee'}>
            <Beurs balance={roomDoor.balance} words={words} size="small" />
            <Link className="btn btn-small" href={roomDoor.href} data-testid="entry-kamer-deur">
              <Icon name={MEANING.kamer} size={13} />
              {fill(words.toRoom, { kamer: words.room })}
            </Link>
          </p>
        )}

        {/* §86: en als er er nog geen is, de knop die er een maakt — alleen
            voor de Keeper, en alleen hier waar je naar de figuur kijkt. */}
        {!roomDoor && canOpenRoom && (
          <p className="row-wrap entry-kamer" data-testid="entry-kamer-leeg">
            <OpenRoomButton entryId={entry.id} name={name || entry.name} words={words} />
          </p>
        )}

        {/* §104 (ronde 67·herstel, #17): where this artikel is — on which
            landkaarten, tijdlijnen and in which dossiers. On a wide screen the
            rows as they were; on a phone one line that opens them. Golf J
            (j4): until the width is known, the line — and from 1280 px the
            stylesheet shows its rows without it. */}
        {wide === true ? waarRijen : <EntryWaar summary={waarZin}>{waarRijen}</EntryWaar>}
      </div>
    </div>
  );

  /* ---------------------------------------------------------- the managing */

  const manage = showManage ? (
    <section id="block-manage" className="entry-block entry-manage" aria-labelledby="manage-title">
      <h2 id="manage-title" className="entry-manage-title">
        <Icon name="shield" size={15} />
        {words.manage}
      </h2>

      {/*
        §25: one panel, two halves, because "wie mag dit zien" was two questions
        in two boxes and nobody could say which was which.

        They are not the same question and never were. The *Keeper* decides what
        the camping already knows — a fiche that is still a secret is invisible
        to everyone, whoever owns it. The *owner* decides who among the people
        who may know gets to look and to type. Both have to say yes, which is
        why they are now one heading with a line that says so, rather than two
        panels that quietly AND themselves together somewhere in the database.
      */}
      {(access.canManage || access.settings.locked || isKeeper) && (
        <details className="section">
          <summary>
            <Icon name="lock" size={14} /> {words.rights}{' '}
            <span className="muted">
              (kijken: {accessLabel(accessNow.viewMode, accessNow.viewers.length).toLowerCase()},
              bewerken: {accessLabel(accessNow.editMode, accessNow.editors.length).toLowerCase()}
              {isKeeper && visibility !== 'all'
                ? `, ${visibility === 'keeper' ? 'geheim' : 'onthuld'}`
                : ''}
              )
            </span>
          </summary>

          <div className="stack" style={{ padding: '0.6rem 0 1rem', gap: '1.1rem' }}>
            <p className="tiny muted" style={{ margin: 0 }}>
              Twee sloten op één deur. Ze moeten allebei open: wat de {words.keeper} geheim houdt
              ziet niemand, ook niet wie jij uitkiest.
            </p>

            {isKeeper && (
              <div className="rights-half">
                <h3 className="rights-half-title">
                  <Icon name="shield" size={13} /> {words.visibilityAndReveals}
                </h3>
                <p className="tiny muted" style={{ margin: '0 0 0.5rem' }}>
                  Het verhaal. Geheim betekent geheim voor iedereen — het staat in geen lijst, geen
                  zoekresultaat en op geen kaart, en de URL doet niets.
                </p>
                <div className="stack">
                <div>
                  <span className="label">Wie mag {`dit ${words.entry}`} zien</span>
                  <div className="row-wrap">
                    {(['all', 'players', 'keeper'] as Visibility[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`chip chip-selectable${visibility === value ? ' chip-active' : ''}`}
                        aria-pressed={visibility === value}
                        onClick={() => {
                          setVisibility(value);
                          set({ visibility: value });
                          void flush();
                        }}
                      >
                        {VISIBILITY_LABELS[value]}
                      </button>
                    ))}
                  </div>
                </div>

                {visibility === 'players' && (
                  <RevealPicker
                    users={revealUsers}
                    cases={revealCases}
                    value={revealedTo}
                    label="Onthuld aan"
                    onChange={(next) => {
                      setRevealedTo(next);
                      set({ revealedTo: next });
                      void flush();
                    }}
                  />
                )}

                <div>
                  <span className="label">Vergrendeling</span>
                  <div className="row-wrap">
                    <button
                      type="button"
                      className={`chip chip-selectable${isLocked ? ' chip-active' : ''}`}
                      aria-pressed={isLocked}
                      onClick={() => {
                        const next = !isLocked;
                        setIsLocked(next);
                        set({ isLocked: next });
                        void flush();
                      }}
                    >
                      <Icon name="lock" size={13} />
                      {isLocked ? 'Vergrendeld' : 'Open voor iedereen'}
                    </button>
                    <span className="tiny muted">
                      Bewerkingen van spelers gaan bij een vergrendeld {words.entry} naar de
                      beoordelingswachtrij.
                    </span>
                  </div>
                </div>
              </div>

              </div>
            )}

            {(access.canManage || access.settings.locked) && (
              <div className="rights-half">
                <h3 className="rights-half-title">
                  <Icon name="person" size={13} /> Van jou: wie mag kijken en bewerken?
                </h3>
                <p className="tiny muted" style={{ margin: '0 0 0.5rem' }}>
                  Jouw eigen slot, binnen wat hierboven al mag. Handig voor aantekeningen die nog
                  niet af zijn — het is geen manier om iets voor de {words.keeper} te verbergen.
                </p>
                <AccessEditor
                  target="entry"
                  id={entry.id}
                  initial={access.settings}
                  canManage={access.canManage}
                  isKeeper={isKeeper}
                  viewerId={access.viewerId}
                  onChange={setAccessNow}
                  nouns={{ this: `dit ${words.entry}` }}
                />
              </div>
            )}
          </div>
        </details>
      )}

      <ProposalsPanel entryId={entry.id} initial={proposals} />

      {/*
       * §44: the Keeper's corner, rendered on the server and handed in as a
       * slot — the switch to the other face, whether this page is the
       * Keeper's, its touwtjes, and the notes. It replaced the plain
       * keeper-notes textarea that stood here: those notes are no longer one
       * person's scratch field but one text a twin's two pages share, so they
       * are a room now (`lib/live/rooms.ts`) and a `<textarea>` in a client
       * component could not have been one.
       */}
      {slots.keeper ?? null}

      {slots.delete ?? null}
    </section>
  ) : null;

  /* -------------------------------------------------------------- render */

  /*
   * §25: three columns on a wide screen.
   *
   * The header used to run the full width above the grid, which pushed the
   * picture and Meer info a title-and-a-lead down the page — a lot of empty
   * paper next to a heading, and the two halves of the artikel starting at
   * different heights. The title and the one-liner belong to the *text*, so
   * they moved into the text column: everything now begins at the top edge
   * together, and the title wraps at reading width instead of at screen width.
   *
   * The outline is the *first* column. It first went into the gap between the
   * text and the infobox, which put a narrow third column of links between an
   * artikel's words and its picture: the eye read it as content, and the two
   * halves of the artikel no longer touched. A signpost is looked at on the
   * way in and left alone after, so it belongs in the margin the page already
   * has — the empty paper between the hoofdmenu and the text — and the text
   * and the picture that belongs to it are neighbours again.
   * It stays there from 1500 px (golf H, D1); from 1280 px the page is text
   * and facts with the outline as a row of chips above the text. Narrow
   * screens are unchanged: header, jump chips, picture and facts, then text.
   */
  const article = (
    <article className={`page-wide entry-page${reading ? ' entry-page-reading' : ''}`}>
      {/*
        §104 (golf J, j4): one skeleton at every width — the outline column,
        the head, the picture and the facts, then the text — and the
        stylesheet decides where each goes. On a narrow screen that is the
        order it reads in; from 1280 px the grid puts the head above the text
        and the facts beside both (`grid-template-areas`, the golf j4 block in
        `app/leeskamer.css`). It used to be two trees chosen by `useIsWide`,
        and the server, which cannot know the width, drew the wide one: a
        phone got the computer's page first and rearranged itself on
        hydration. The DOM order is the phone's order, which is also where a
        wiki puts its infobox — before the prose — so a keyboard and a screen
        reader meet the facts before the text on every screen.
      */}
      {/* §104: an artikel with nothing for the side column (no picture, no
          filled-in fact) lets the text have that room — up to its 68ch. The
          two width classes only mean something inside their `@media`. */}
      <div
        className={`entry-layout entry-layout-wide${rail !== false ? ' entry-layout-rail' : ''}${!asideBox ? ' entry-layout-zonder-kant' : ''}`}
      >
        {/* §25: the outline is the first column, not the middle one. It is a
            signpost you glance at and leave, so it belongs in the margin the
            page already has — the empty paper between the hoofdmenu and the
            text — rather than wedged between the text and its picture, where
            it read as a third column of content and split the artikel in two.
            From 1500 px only (§104, golf H, D1); until the width is known it
            is drawn and `display: none` below that. */}
        {rail !== false && (
          <div className="entry-rail">
            <div className="entry-rail-sticky">
              <EntryOutline items={outline} shape="column" label={words.onThisPage} />
            </div>
          </div>
        )}

        <div className="entry-kop">
          {header}

          {/* Only worth saying on the face where it changes what happens next. */}
          {!reading && !access.canEdit && (
            <p className="small entry-readonly-note">
              <Icon name="lock" size={13} /> Je kunt dit {words.entry} lezen. Wat je verandert gaat als
              voorstel naar de eigenaar.
            </p>
          )}

          {/* §92 (B11): the jump chips straight under the header, before what
              they are there to skip. §104 (golf H, D1): up to 1499 px — from
              1280 px the row of chips above the text, so the text keeps its
              measure. */}
          {rail !== true && (
            <EntryOutline items={wide === true ? outline : phoneOutline} shape="row" label={words.onThisPage} />
          )}
        </div>

        {/* On a narrow screen the picture and the facts sit under the header,
            where a phone wiki puts them, above the text; from 1280 px they are
            the side column. */}
        {asideBox && <aside className="entry-aside">{asideBox}</aside>}

        <div className="entry-main" ref={mainRef}>
          {entry.typeBlocks.map((block) => renderBlock(block))}
          {manage}
          {/* §104 (L7): a `#` beside every heading in the text and the
              secties, laid over them — reading only. */}
          {reading && <HeadingAnchors slug={entry.slug} scope={mainRef} />}
        </div>
      </div>
    </article>
  );

  // §21: the room around the fields. Without one (no viewer, or a page that
  // could not open it) every LiveField is a plain input on the autosave road.
  if (!liveFields) return article;
  return (
    <LiveFields room={liveFields.room} state={liveFields.state} user={liveFields.user} canEdit={liveFields.canEdit} onStatus={setFieldsStatus}>
      {article}
    </LiveFields>
  );
}


/**
 * §104 (ronde 67·herstel, #17): on a phone, *where* this artikel is — "Op 2
 * landkaarten · in 2 dossiers" — as one line with a door (›) that opens the
 * rows of chips underneath. A native `<details>`: the keyboard, the screen
 * reader and the find-in-page of the browser already know it. Nothing to say,
 * no line.
 */
function EntryWaar({ summary, children }: { summary: string; children: ReactNode }) {
  if (!summary) return null;
  return (
    <details className="entry-waar" data-testid="entry-waar">
      <summary>
        <span className="entry-waar-zin">{summary}</span>
        <Icon name="chevron" size={13} className="entry-waar-pijl" />
      </summary>
      <div className="entry-waar-rijen">{children}</div>
    </details>
  );
}
