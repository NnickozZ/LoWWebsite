'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useAuthorOptional } from '@/components/you/AuthorProvider';
import { openSheetCount } from '@/lib/sheetStack';
import { PLAYER_UPLOAD_BYTES } from '@/lib/upload';
import { CHARACTER_TYPE_SLUG } from '@/lib/newEntryType';
import { DEFAULT_WORDS, fill, type Words } from '@/lib/words';
import type { FieldDef } from '@/lib/db/schema';
import { FLIP_EVENT } from '@/components/keeper/SideToggle';
import { SOLE_AUTHOR_EVENT } from '@/lib/authorChoice';
import { NewEntrySheet, type NewEntryPrefill, type CreatedEntry } from './NewEntrySheet';
import { NewCaseSheet, type NewCasePrefill, type CreatedCase } from './NewCaseSheet';
import { Sheet } from './Sheet';

/**
 * A question the person has to answer before anything else happens. Not the
 * browser's `confirm()` — the app's own sheet, in the app's own words — and
 * not a toast either: a toast is easy to miss, and some questions ("also file
 * this in the dossier?") are the whole point of the moment.
 */
export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  /** The yes. */
  confirmLabel: string;
  /** The no. Defaults to "Annuleren". */
  cancelLabel?: string;
  /** Paint the yes red, for anything that throws something away. */
  danger?: boolean;
};

export type EntryTypeLite = {
  slug: string;
  label: string;
  icon: string;
  colour: string;
  /** §11: what this soort's own "Nieuw" button says, if it was given one. */
  newButton?: string;
  /**
   * §49: this soort's habit. A new artikel of it, made inside a dossier, starts
   * with "dossier voor de naam" already ticked — which is all that is left of
   * §24's "alleen in een dossier": every soort is offered everywhere now.
   */
  prefixDefault?: boolean;
  /**
   * §80: only a Keeper makes new artikelen of this soort (huisraad, and
   * whatever the Keeper marks later). The list itself stays complete — a
   * player still needs this soort's icon and colour to read an artikel of it —
   * and it is the *sheet* that leaves it out. Not §44's `keeper_only`, which
   * is about a side and lives on an artikel.
   */
  keeperMade?: boolean;
  /**
   * §93 (E24): plek, prijs en effect, als dit een soort is die in de winkel kan
   * staan — het Nieuw-blad vraagt ze dan meteen. Alleen voor de Keeper gevuld.
   */
  shopFields?: FieldDef[];
};

export type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** §93: een tweede knop — *Ongedaan maken* naast *Bekijk* in een koopmelding. */
  also?: ToastAction;
  /** §102: hoe lang hij staat, en of de muis of de focus dat mag rekken. */
  ms: number;
  pausable: boolean;
  /** §102: op weg naar buiten — een plaatje, geen melding meer. */
  closing?: boolean;
  /** §103 golf H (T15/D9): het onderwerp. Een nieuwe melding met dezelfde sleutel vervangt deze. */
  key?: string;
  /** Hoe vaak hij ter plekke vervangen is: de klok begint dan opnieuw. */
  version: number;
  /** §103 golf H (D10): een gift van de Keeper — de stempel met het bedrag, en de reden. */
  munt?: ToastMunt;
};

/** §103 golf H (D10): wat `toast-munt` tekent. `delta` is wat de server gaf (`lastGrantOf`). */
export type ToastMunt = { delta: number; reason: string };

type ToastAction = { label: string; onAction: () => void };

/**
 * §93: hoe lang een melding blijft, en een tweede knop erin. Een koopmelding
 * draagt *Ongedaan maken* tien seconden lang (het venster van `undoPurchase`),
 * dus hij mag niet na zes seconden verdwijnen.
 */
export type ToastOptions = {
  /**
   * §93/§102: een eigen duur, en die **wint en pauzeert niet**. De koopmelding
   * geeft hier `BUY_UNDO_MS` mee: dat is het venster van de server voor
   * *Ongedaan maken* (§93, tien seconden plus vijf speling). Een melding die
   * langer bleef staan omdat de muis erop lag, zou een knop aanbieden die de
   * server weigert.
   */
  ms?: number;
  also?: ToastAction;
  /**
   * §103 golf H (T15/D9): het onderwerp van de melding — `ding:<id>` of
   * `plek:<id>`. Een nieuwe melding met dezelfde sleutel vervangt de vorige
   * **op haar plek**, zonder uitgang en ingang, en haar klok begint opnieuw.
   * "Inktpot ligt nu in je lade." en daarna "Inktpot ligt nu op je bureau."
   * zijn dan één melding die van gedachten veranderde, geen twee balken
   * waarvan de bovenste al niet meer waar is.
   */
  key?: string;
  /**
   * §103 golf H (D10): een gift van de Keeper, getekend als `toast-munt`. Met
   * dezelfde `key` tellen twee giften op in één melding (*+25*): dat is een
   * optelling van twee meldingen, niet van een saldo — het getal in de schil
   * blijft dat van de server (§79, `SaldoGetal`).
   */
  munt?: ToastMunt;
};

/**
 * §102 (J4): hoe lang een melding staat. Zes seconden voor een zin; tien voor
 * een melding met een knop (*Bekijk*, *Ongedaan maken*), want wie moet lezen
 * én beslissen heeft meer nodig dan wie alleen leest. Een eigen `ms` wint.
 */
export const TOAST_MS = 6000;
export const TOAST_ACTION_MS = 10000;

/** §102: the way out of a toast is `--dur-3`; this is the net under it. */
const TOAST_EXIT_NET_MS = 250;

/** §103 golf H (D9): hooguit zoveel meldingen tegelijk op het scherm. */
export const TOAST_MAX = 2;

/**
 * §103 golf H (T15/D9): de stapel na één nieuwe melding. Puur, zodat de regel
 * te testen is.
 *
 *  - **Eén melding per onderwerp.** Staat er een levende melding met dezelfde
 *    `key`, dan wordt díé vervangen, op haar plek en met hetzelfde `id` (dus
 *    zonder uitgang en ingang); `version` gaat omhoog en haar klok begint
 *    opnieuw. Twee giften van de Keeper (`munt`) tellen op.
 *  - **Hooguit twee.** Anders gaat de oudste levende melding weg met haar
 *    gewone uitgang (`closing`), en komt de nieuwe onderaan erbij. Een
 *    melding op weg naar buiten telt niet mee: die is al een plaatje.
 */
export function nextToasts(
  current: Toast[],
  fresh: Omit<Toast, 'id' | 'version'>,
  id: number,
  max: number = TOAST_MAX,
): Toast[] {
  const live = current.filter((t) => !t.closing);
  const same = fresh.key ? live.find((t) => t.key === fresh.key) : undefined;
  if (same) {
    const munt =
      fresh.munt && same.munt
        ? { delta: same.munt.delta + fresh.munt.delta, reason: fresh.munt.reason || same.munt.reason }
        : fresh.munt;
    return current.map((t) => (t === same ? { ...fresh, munt, id: t.id, version: t.version + 1 } : t));
  }
  const overflow = Math.max(0, live.length - (max - 1));
  const leaving = new Set(live.slice(0, overflow).map((t) => t.id));
  return [
    ...current.map((t) => (leaving.has(t.id) ? { ...t, closing: true } : t)),
    { ...fresh, id, version: 0 },
  ];
}

/**
 * §48, round 25: the dossier this screen *is*.
 *
 * Not `PreferredCases`, which is a ranking and a list — an artikel can be in
 * six dossiers and that context names all of them. This is the one dossier you
 * are standing in, set by the dossier's own page and by nothing else, and it is
 * what three things ask:
 *
 *   - the `+` in the menu and the `n` key, so a voorwerp or an aanwijzing can
 *     be made from anywhere on the page and not only from the box halfway down
 *     it (§24 lets those soorten exist only inside a dossier, so without this
 *     the sheet does not even offer them);
 *   - the `@` in every box on the page, for the same reason;
 *   - and the question afterwards — "shall I put it in the file as well?".
 *
 * It lives in the provider rather than in a context of its own because the two
 * buttons that need it are in the *shell*, above the page, where a context set
 * by the page cannot reach. The dossier registers itself on mount and takes it
 * back on unmount.
 */
export type CaseHere = {
  id: string;
  name: string;
  /** §17: may this hand file anything in it at all? */
  canEdit: boolean;
  /** §44: is this dossier the Keeper's own? Then so is everything made in it. */
  keeperOnly: boolean;
  /** Whether the dossier already holds this artikel — asked before the offer. */
  holds: (entryId: string) => boolean;
  /** Remember, without a round trip, that it holds it now. */
  remember: (entryId: string) => void;
};

type UiValue = {
  types: EntryTypeLite[];
  /**
   * §11: every word the interface repeats, already resolved — the Keeper's
   * where they set one, the default everywhere else. Client components read it
   * with `useUi().words` rather than hard-coding a term.
   */
  words: Words;
  /**
   * How many bytes this person's upload may weigh — the Keeper's ceiling or a
   * player's, decided on the server by `uploadLimitFor(me)` in the layout and
   * carried down here so every upload button can say the number and every
   * upload can shrink a picture to fit it (`fitUpload`). It is not the gate:
   * the gate is `/api/assets`, which weighs the bytes that arrived.
   */
  uploadLimit: number;
  toast: (message: string, action?: { label: string; onAction: () => void }, options?: ToastOptions) => void;
  /** Asks, in a sheet; resolves true for the yes, false for the no or a dismissal. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  openNewEntry: (prefill?: NewEntryPrefill) => void;
  openNewCase: (prefill?: NewCasePrefill) => void;
  /**
   * §69: "ask, then make", for the four container buttons. Says once, and only
   * once, that this window may not write (§18b); otherwise asks who it is
   * writing as if that is still open, and runs `then` — synchronously where
   * there is nothing to ask, so the click that opens a sheet is not lost.
   */
  openMaker: (then: () => void) => void;
  /**
   * §48: whether this browser is a Keeper's, and which side of the archive it
   * is standing on. Every sheet that makes something reads it, because what is
   * made here is born on that side and the sheet has to say so.
   */
  isKeeper: boolean;
  side: 'keeper' | 'player';
  /** §48: the dossier this screen is, or null. */
  caseHere: CaseHere | null;
  /** Set by the dossier's page on mount; called with null on unmount. */
  setCaseHere: (value: CaseHere | null) => void;
  /**
   * §100: het palet — open (with what is already typed in it) or null. The
   * shell draws it (`CommandPalette` in `AppShell`), because it needs who you
   * are and your kamer; the keys that open it live here, with the others.
   */
  palette: { query: string } | null;
  openPalette: (query?: string) => void;
  closePalette: () => void;
};

const UiContext = createContext<UiValue | null>(null);

export function useUi(): UiValue {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi must be used inside <UiProvider>');
  return value;
}

/** §48: the dossier this screen is, or null outside one. */
export function useCaseHere(): CaseHere | null {
  return useUi().caseHere;
}

/**
 * §48: the dossier's own page says "this is me" — for the whole time it is on
 * screen and not a second longer. `value` may be rebuilt on every render; only
 * its fields are compared, and the two functions are read through a ref so a
 * fresh closure does not re-register anything.
 */
export function useIAmTheCase(value: Omit<CaseHere, 'holds' | 'remember'> & {
  holds: (entryId: string) => boolean;
  remember: (entryId: string) => void;
}) {
  const { setCaseHere } = useUi();
  const latest = useRef(value);
  latest.current = value;
  const { id, name, canEdit, keeperOnly } = value;
  useEffect(() => {
    setCaseHere({
      id,
      name,
      canEdit,
      keeperOnly,
      holds: (entryId) => latest.current.holds(entryId),
      remember: (entryId) => latest.current.remember(entryId),
    });
    return () => setCaseHere(null);
  }, [id, name, canEdit, keeperOnly, setCaseHere]);
}

export function UiProvider({
  types,
  words = DEFAULT_WORDS,
  uploadLimit = PLAYER_UPLOAD_BYTES,
  isKeeper = false,
  side = 'player',
  children,
}: {
  types: EntryTypeLite[];
  words?: Words;
  /** Defaults to a player's ceiling — the smaller of the two is the safe one. */
  uploadLimit?: number;
  /** §48: a real Keeper, not looking through a player's eyes. Defaults to no. */
  isKeeper?: boolean;
  /** §46/§48: the side this browser stands on. */
  side?: 'keeper' | 'player';
  children: ReactNode;
}) {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  /*
   * Review #10: the `+` and a melding share the bottom right of a phone. The
   * stack's height goes on `:root` as `--toast-stack`, and `.fab` climbs by
   * it (`globals.css`, *fab*) — so the `+` stands above the melding instead of
   * half under it, and comes down again when the melding goes.
   */
  const toastWrap = useRef<HTMLDivElement>(null);
  const hasToasts = toasts.length > 0;
  useEffect(() => {
    const wrap = toastWrap.current;
    const root = document.documentElement;
    if (!wrap || !hasToasts || typeof ResizeObserver === 'undefined') {
      root.style.removeProperty('--toast-stack');
      return;
    }
    const measure = () => root.style.setProperty('--toast-stack', `${Math.ceil(wrap.getBoundingClientRect().height)}px`);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(wrap);
    return () => {
      watch.disconnect();
      root.style.removeProperty('--toast-stack');
    };
  }, [hasToasts]);
  const [entryPrefill, setEntryPrefill] = useState<NewEntryPrefill | null>(null);
  const [casePrefill, setCasePrefill] = useState<NewCasePrefill | null>(null);
  const [question, setQuestion] = useState<{
    options: ConfirmOptions;
    settle: (yes: boolean) => void;
    key: number;
  } | null>(null);
  // §48: the dossier the screen is. A plain state, written by one component.
  const [caseHere, setCaseHere] = useState<CaseHere | null>(null);
  // §100: the palet.
  const [palette, setPalette] = useState<{ query: string } | null>(null);
  const paletteOpen = useRef(false);
  paletteOpen.current = palette !== null;
  const openPalette = useCallback((query?: string) => setPalette({ query: query ?? '' }), []);
  const closePalette = useCallback(() => setPalette(null), []);
  const nextId = useRef(1);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // A second question while one is open answers the first with "no".
      const key = nextId.current++;
      setQuestion((current) => {
        current?.settle(false);
        return { options, settle: resolve, key };
      });
    });
  }, []);

  const answer = useCallback((yes: boolean) => {
    setQuestion((current) => {
      current?.settle(yes);
      return null;
    });
  }, []);

  /*
   * §102 (J4): the timer lives with each toast now (`ToastView`), so that it
   * can wait while a hand or the focus is on it. What stays here is the list:
   * at most three, and a toast on its way out is marked rather than dropped —
   * `ToastView` plays the exit and then asks to be taken away.
   */
  const toast = useCallback(
    (message: string, action?: { label: string; onAction: () => void }, options?: ToastOptions) => {
      const id = nextId.current++;
      const hasAction = Boolean(action || options?.also);
      const ms = options?.ms ?? (hasAction ? TOAST_ACTION_MS : TOAST_MS);
      const fresh = {
        message,
        actionLabel: action?.label,
        onAction: action?.onAction,
        also: options?.also,
        ms,
        pausable: options?.ms === undefined,
        key: options?.key,
        munt: options?.munt,
      };
      // §103 golf H: see `nextToasts` — one per subject, and at most two.
      setToasts((current) => nextToasts(current, fresh, id));
    },
    [],
  );

  /*
   * §103 golf H (T6): een melding ligt nooit over een blad. Een nieuw blad is
   * het antwoord op wat je nu doet, dus de lopende meldingen gaan weg (hun
   * gewone uitgang, `--dur-3`) zodra er een `.sheet-backdrop` bijkomt. Een
   * melding die ná het openen komt, hoort bij het blad (een weigering in de
   * catalogus) en staat zolang bovenaan het scherm, boven de verduistering en
   * niet over het blad (`globals.css`, *toasts*). `Sheet` hangt zijn laag
   * direct onder `<body>`, dus één waarnemer zonder `subtree` is genoeg, en
   * `Sheet` zelf hoeft er niets van te weten.
   */
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const watch = new MutationObserver((records) => {
      const opened = records.some((record) =>
        Array.from(record.addedNodes).some(
          (node) => node instanceof HTMLElement && node.classList.contains('sheet-backdrop'),
        ),
      );
      if (!opened) return;
      setToasts((current) =>
        current.some((t) => !t.closing) ? current.map((t) => (t.closing ? t : { ...t, closing: true })) : current,
      );
    });
    watch.observe(document.body, { childList: true });
    return () => watch.disconnect();
  }, []);
  const leaveToast = useCallback((id: number) => {
    setToasts((current) => current.map((t) => (t.id === id && !t.closing ? { ...t, closing: true } : t)));
  }, []);
  const dropToast = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  /*
   * §18b: a speler with no onderzoeker cannot make a dossier, so that sheet
   * does not open for them at all — a sheet whose one button is dead is a
   * worse answer than a line saying why. The banner at the top of the page is
   * the standing explanation; this is the answer to the button.
   *
   * The "nieuw artikel" sheet is the exception, and the only one: an
   * onderzoeker *is* an artikel tied to an account, so this is how somebody
   * with none stops having none. The archive lets that one write through
   * (`requireAuthorOrFirstCharacter`), so the button must too — the `+`, the
   * `n` shortcut and the sheet all read `mayStartEntry` instead.
   */
  const author = useAuthorOptional();
  const mayType = author ? author.mayType : true;
  const mayStartEntry = author ? author.mayStartEntry : true;
  const refuse = useCallback(() => {
    // §90: the Keeper's word, as the banner above says it.
    toast(`Je hebt nog geen ${words.character}, dus je kunt hier alleen lezen.`);
  }, [toast, words.character]);

  /*
   * §18b: "ask, then do". Opening either of these *is* an act of writing, so a
   * window that has not said who it is writing as has to answer first — and
   * the answer is itself a sheet, so it cannot come up over one. `ensureAuthor`
   * holds the opening back, asks alone, and releases it in the same commit
   * that closes the question; a window with nothing to answer (a Keeper, one
   * that has already chosen, a speler with no onderzoeker at all) goes straight
   * through, synchronously, so the click that opened the sheet is not lost.
   *
   * Outside the shell — a component in a test harness, with no provider above
   * it — there is nobody to ask, and the server is the real gate anyway.
   */
  const ensureAuthor = author?.ensureAuthor;
  const askThen = useCallback(
    (then: () => void) => {
      if (ensureAuthor) ensureAuthor(then);
      else then();
    },
    [ensureAuthor],
  );

  const openNewEntry = useCallback(
    (next?: NewEntryPrefill) => {
      if (!mayStartEntry) {
        refuse();
        return;
      }
      /*
       * §90: somebody with no karakter can make exactly one thing — the
       * artikel that becomes their first — so every road in (the `+`, the
       * button, `n`) opens on the karakter-soort for them. A road that already
       * named a soort keeps it.
       */
      const forFirst =
        !mayType && !next?.typeSlug && types.some((type) => type.slug === CHARACTER_TYPE_SLUG)
          ? { typeSlug: CHARACTER_TYPE_SLUG }
          : {};
      askThen(() => setEntryPrefill({ ...(next ?? {}), ...forFirst }));
    },
    [mayStartEntry, mayType, types, refuse, askThen],
  );

  const openNewCase = useCallback(
    (next?: NewCasePrefill) => {
      if (!mayType) {
        refuse();
        return;
      }
      askThen(() => setCasePrefill(next ?? {}));
    },
    [mayType, refuse, askThen],
  );

  /**
   * §69: the one door every *container* maker outside this provider goes
   * through — the four buttons that hang a prikbord, a tijdlijn, a landkaart
   * or a stamboom.
   *
   * It is `openNewCase`'s two steps with somebody else's sheet at the end. The
   * four used to have neither: a window with no onderzoeker was told twice
   * (the banner on the way in, and the server's refusal after a POST that was
   * never going to land), and a window that had not yet said who it writes as
   * was asked *after* its own sheet was already up — which §18b's note on
   * `ensureAuthor` says cannot work, because the question is itself a sheet.
   */
  const openMaker = useCallback(
    (then: () => void) => {
      if (!mayType) {
        refuse();
        return;
      }
      askThen(then);
    },
    [mayType, refuse, askThen],
  );

  // The `n` shortcut is bound once for the life of the shell, so it reads the
  // opener through a ref rather than closing over the one that existed then.
  const openNewEntryRef = useRef(openNewEntry);
  openNewEntryRef.current = openNewEntry;
  const caseHereRef = useRef(caseHere);
  caseHereRef.current = caseHere;

  // §6: `n` opens a new entry, `/` opens the palet (§100), and §46's `k` turns the
  // archive over — one guard for all three.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      /*
       * §100: Ctrl/⌘K opens the palet from anywhere — a field, the running
       * text, a canvas — because that is what the chord is for (Superhuman's
       * first rule: the same shortcut wherever you are). The page keeps the
       * press (`preventDefault`), or the browser would put the caret in its
       * own address bar. Pressed again it closes. A sheet that is not the
       * palet still owns the keyboard (§18b), so it does nothing over one.
       */
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        if (paletteOpen.current) {
          event.preventDefault();
          setPalette(null);
          return;
        }
        if (openSheetCount() > 0) return;
        event.preventDefault();
        setPalette({ query: '' });
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      /*
       * §18b: a sheet on the screen owns the keyboard. `n` used to reach past
       * one — the focus a sheet leaves behind is not a field, so the check
       * above waves it through — and opened a second sheet over the first.
       */
      if (openSheetCount() > 0) return;

      if (event.key === 'n') {
        event.preventDefault();
        // §18b: the shortcut goes the same way the button does.
        // §48: and, in a dossier, it goes in *there* — same as the `+`.
        openNewEntryRef.current(caseHereRef.current ? { caseId: caseHereRef.current.id } : undefined);
      } else if (event.key === 'k') {
        /*
         * §46: `k` turns the archive over. The work is the toggle's — it is
         * the thing that knows where this page's other side is — but the guard
         * above (a field, a sheet, a modifier held down) is written once and
         * this is where it lives, so the shortcut is a plain event and the
         * button listens for it. A browser with no toggle on screen (anybody
         * but a real Keeper) has nobody listening, and the key does nothing.
         */
        event.preventDefault();
        window.dispatchEvent(new Event(FLIP_EVENT));
      } else if (event.key === '/') {
        event.preventDefault();
        /*
         * §100: `/` opens the palet, on a desk and on a phone with a
         * keyboard alike — one gesture, where §91 had two (the caret in the
         * side menu's box on a desk, a trip to Zoeken on a phone). The box in
         * the side menu is the palet's door now, not a second search.
         */
        setPalette({ query: '' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /*
   * §106 (na review 4, H5): a speler with one onderzoeker is not asked who is
   * writing — `AuthorProvider` picks that one and rings once per window, at the
   * first act of writing. This is the one soft line that says so. `AuthorProvider`
   * sits above this provider, so it rings instead of calling `toast` itself.
   */
  const wordsRef = useRef(words);
  wordsRef.current = words;
  useEffect(() => {
    const onSole = (event: Event) => {
      const name = (event as CustomEvent<string>).detail;
      if (!name) return;
      // A task later, not now: the act that rang is often opening a sheet, and
      // a melding that is running when a sheet arrives leaves (T6). One that
      // comes after it belongs to the sheet and stays.
      window.setTimeout(() => toast(fill(wordsRef.current.writesAsSole, { naam: name }), undefined, { key: 'schrijver' }), 0);
    };
    window.addEventListener(SOLE_AUTHOR_EVENT, onSole);
    return () => window.removeEventListener(SOLE_AUTHOR_EVENT, onSole);
  }, [toast]);

  const handleEntryCreated = useCallback(
    (entry: CreatedEntry) => {
      const onCreated = entryPrefill?.onCreated;
      setEntryPrefill(null);
      if (onCreated) {
        onCreated(entry);
        return;
      }
      // Land on the new entry with "Add more" already open.
      router.push(`/e/${entry.slug}?new=1`);
      router.refresh();
    },
    [entryPrefill, router],
  );

  const handleCaseCreated = useCallback(
    (created: CreatedCase) => {
      const onCreated = casePrefill?.onCreated;
      setCasePrefill(null);
      if (onCreated) {
        onCreated(created);
        return;
      }
      // §22: as with an artikel above — land on the new dossier with its
      // fields open. Everybody opens a dossier reading now, so without this a
      // Keeper would land on the reading face of a file they made a second ago.
      router.push(`/c/${created.slug}?new=1`);
      router.refresh();
    },
    [casePrefill, router],
  );

  const value = useMemo<UiValue>(
    () => ({
      types,
      words,
      uploadLimit,
      toast,
      confirm,
      openNewEntry,
      openNewCase,
      openMaker,
      isKeeper,
      side,
      caseHere,
      setCaseHere,
      palette,
      openPalette,
      closePalette,
    }),
    [types, words, uploadLimit, toast, confirm, openNewEntry, openNewCase, openMaker, isKeeper, side, caseHere, palette, openPalette, closePalette],
  );

  return (
    <UiContext.Provider value={value}>
      {children}

      {entryPrefill && (
        <NewEntrySheet
          types={types}
          prefill={entryPrefill}
          onClose={() => setEntryPrefill(null)}
          onCreated={handleEntryCreated}
        />
      )}

      {casePrefill && (
        <NewCaseSheet
          prefill={casePrefill}
          onClose={() => setCasePrefill(null)}
          onCreated={handleCaseCreated}
        />
      )}

      {question && (
        /*
         * §102: the cross and the backdrop play the sheet's way out, but the
         * *answer* is given at the first moment (`onLeave`), never 150 ms
         * later. Keyed per question, so a second question never inherits the
         * first one's closing sheet.
         */
        <Sheet
          key={question.key}
          onClose={() => answer(false)}
          onLeave={() => question.settle(false)}
          labelledBy="confirm-title"
        >
          <h2 id="confirm-title" style={{ marginTop: 0 }}>
            {question.options.title}
          </h2>
          {question.options.message && (
            <div className="small" style={{ marginBottom: '1rem' }}>
              {question.options.message}
            </div>
          )}
          <div className="row-wrap">
            <button
              type="button"
              className={`btn ${question.options.danger ? 'btn-danger' : 'btn-primary'}`}
              autoFocus
              onClick={() => answer(true)}
            >
              {question.options.confirmLabel}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => answer(false)}>
              {question.options.cancelLabel ?? 'Annuleren'}
            </button>
          </div>
        </Sheet>
      )}

      {/*
        * §102: `aria-live` on the wrapper and nowhere else — a `role="status"`
        * per toast as well would have it read out twice.
        */}
      <div className="toast-wrap" aria-live="polite" ref={toastWrap}>
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} words={words} onLeave={leaveToast} onGone={dropToast} />
        ))}
      </div>
    </UiContext.Provider>
  );
}

/**
 * §102 (J4): one toast, with its own clock.
 *
 * In: `--dur-4` up and in (`toast-in`). Out: `--dur-3` down and out, through
 * `data-closing` — the same shape as a sheet's way out (J3), and for the same
 * reason the toast is `pointer-events: none` from the first moment of it.
 *
 * The clock waits while a pointer is on the toast or the focus is in it, and
 * goes on with what was left when both have gone (WCAG 2.2.1, and NN/g: a
 * message you are reading should not leave under your eyes). A toast that
 * brought its own `ms` does not wait — see `ToastOptions.ms`.
 *
 * A button pressed with the pointer lets the toast play its way out; the same
 * button pressed with a key takes it away at once (a key does not move).
 */
function ToastView({
  toast: t,
  words,
  onLeave,
  onGone,
}: {
  toast: Toast;
  words: Words;
  onLeave: (id: number) => void;
  onGone: (id: number) => void;
}) {
  const { id, ms, pausable, closing, version } = t;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const left = useRef(ms);
  const startedAt = useRef(0);
  const hovered = useRef(false);
  const focused = useRef(false);

  const stop = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    left.current = Math.max(0, left.current - (Date.now() - startedAt.current));
  }, []);
  const run = useCallback(() => {
    if (timer.current) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => {
      timer.current = null;
      onLeave(id);
    }, left.current);
  }, [id, onLeave]);

  useEffect(() => {
    if (closing) return;
    run();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [closing, run]);

  /*
   * §103 golf H (T15): vervangen op haar plek — dezelfde doos, een nieuwe
   * tekst, en de klok begint opnieuw met de volle duur. Een hand of focus die
   * er al op lag, houdt hem nog steeds vast.
   */
  const firstVersion = useRef(version);
  useEffect(() => {
    if (version === firstVersion.current || closing) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    left.current = ms;
    if (pausable && (hovered.current || focused.current)) return;
    run();
    // `run` en `ms` horen bij deze versie; alleen een nieuwe versie zet de klok terug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // The net under the way out: a background tab may never fire `animationend`.
  useEffect(() => {
    if (!closing) return;
    const net = setTimeout(() => onGone(id), TOAST_EXIT_NET_MS);
    return () => clearTimeout(net);
  }, [closing, id, onGone]);

  const hold = () => {
    if (!pausable || closing) return;
    stop();
  };
  const release = () => {
    if (!pausable || closing || hovered.current || focused.current) return;
    run();
  };
  const press = (event: ReactMouseEvent, then?: () => void) => {
    then?.();
    if (event.detail === 0) onGone(id);
    else onLeave(id);
  };

  return (
    <div
      className={t.munt ? 'toast toast-munt' : 'toast'}
      data-closing={closing ? '' : undefined}
      data-key={t.key}
      // Golf H: a resting mouse holds it; a finger does not. A tap leaves a
      // "hover" behind on a touch screen, and a melding that waits for a pointer
      // to leave that never leaves would stand over the page for good.
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return;
        hovered.current = true;
        hold();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        hovered.current = false;
        release();
      }}
      onFocus={() => {
        focused.current = true;
        hold();
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        focused.current = false;
        release();
      }}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onGone(id);
      }}
    >
      {t.munt ? <ToastMuntBody munt={t.munt} version={version} words={words} /> : <span style={{ flex: 1 }}>{t.message}</span>}
      {t.actionLabel && (
        <button type="button" onClick={(event) => press(event, t.onAction)}>
          {t.actionLabel}
        </button>
      )}
      {t.also && (
        <button type="button" data-testid="toast-also" onClick={(event) => press(event, t.also?.onAction)}>
          {t.also.label}
        </button>
      )}
    </div>
  );
}

/**
 * §103 golf H (D10): de binnenkant van `toast-munt` — het mooiste moment aan
 * tafel, in het expressieve register (docs/beweging.md).
 *
 * Links een stempel met het bedrag (*+20*), in het groen van de aanwezigheid
 * (`--live`): een gift, nooit rood (§84). Hij komt neer in `--dur-5` op
 * `--ease-land`, en opnieuw als er een tweede gift bij komt (`key={version}`);
 * onder reduced motion ligt hij er gewoon (`app/moment.css`). Rechts de regel
 * *munten van de Keeper* en de reden, cursief, want het zijn de woorden van
 * de Keeper. Voor een schermlezer staat de hele zin er één keer
 * (`grantArrived`), zodat hij niet in drie brokken wordt voorgelezen.
 */
function ToastMuntBody({ munt, version, words }: { munt: ToastMunt; version: number; words: Words }) {
  const amount = Math.abs(munt.delta);
  const woord = amount === 1 ? words.currency : words.currencyPlural;
  const bedrag = `${amount} ${woord}`;
  const reason = munt.reason.trim();
  const sentence = reason
    ? fill(words.grantArrived, { bedrag, keeper: words.keeper, reden: reason })
    : fill(words.grantArrivedPlain, { bedrag, keeper: words.keeper });
  return (
    <>
      <span className="toast-munt-stempel" key={version} data-testid="toast-munt-stempel" aria-hidden="true">
        {munt.delta >= 0 ? '+' : '\u2212'}
        {amount}
      </span>
      <span className="toast-munt-tekst" aria-hidden="true">
        <span className="toast-munt-regel">{fill(words.grantMuntLine, { munten: woord, keeper: words.keeper })}</span>
        {reason && <span className="toast-munt-reden">{reason}</span>}
      </span>
      <span className="visually-hidden">{sentence}</span>
    </>
  );
}
