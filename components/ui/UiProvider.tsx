'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useAuthorOptional } from '@/components/you/AuthorProvider';
import { openSheetCount } from '@/lib/sheetStack';
import { PLAYER_UPLOAD_BYTES } from '@/lib/upload';
import { DEFAULT_WORDS, type Words } from '@/lib/words';
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
   * §24: this soort is only made inside a dossier. The "Nieuw artikel" sheet
   * leaves it out unless it was opened from one, and the wiki's own new button
   * is gone for it — a voorwerp or a clue is found during an investigation.
   */
  caseOnly?: boolean;
};

type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
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
  toast: (message: string, action?: { label: string; onAction: () => void }) => void;
  /** Asks, in a sheet; resolves true for the yes, false for the no or a dismissal. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  openNewEntry: (prefill?: NewEntryPrefill) => void;
  openNewCase: (prefill?: NewCasePrefill) => void;
};

const UiContext = createContext<UiValue | null>(null);

export function useUi(): UiValue {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi must be used inside <UiProvider>');
  return value;
}

export function UiProvider({
  types,
  words = DEFAULT_WORDS,
  uploadLimit = PLAYER_UPLOAD_BYTES,
  children,
}: {
  types: EntryTypeLite[];
  words?: Words;
  /** Defaults to a player's ceiling — the smaller of the two is the safe one. */
  uploadLimit?: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [entryPrefill, setEntryPrefill] = useState<NewEntryPrefill | null>(null);
  const [casePrefill, setCasePrefill] = useState<NewCasePrefill | null>(null);
  const [question, setQuestion] = useState<{ options: ConfirmOptions; settle: (yes: boolean) => void } | null>(null);
  const nextId = useRef(1);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // A second question while one is open answers the first with "no".
      setQuestion((current) => {
        current?.settle(false);
        return { options, settle: resolve };
      });
    });
  }, []);

  const answer = useCallback((yes: boolean) => {
    setQuestion((current) => {
      current?.settle(yes);
      return null;
    });
  }, []);

  const toast = useCallback((message: string, action?: { label: string; onAction: () => void }) => {
    const id = nextId.current++;
    setToasts((current) => [
      ...current.slice(-2),
      { id, message, actionLabel: action?.label, onAction: action?.onAction },
    ]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 6000);
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
    toast('Je hebt nog geen onderzoeker, dus je kunt hier alleen lezen.');
  }, [toast]);

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
      askThen(() => setEntryPrefill(next ?? {}));
    },
    [mayStartEntry, refuse, askThen],
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

  // The `n` shortcut is bound once for the life of the shell, so it reads the
  // opener through a ref rather than closing over the one that existed then.
  const openNewEntryRef = useRef(openNewEntry);
  openNewEntryRef.current = openNewEntry;

  // §6: `n` opens a new entry, `/` goes to search.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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
        openNewEntryRef.current();
      } else if (event.key === '/') {
        event.preventDefault();
        router.push('/search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

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
    () => ({ types, words, uploadLimit, toast, confirm, openNewEntry, openNewCase }),
    [types, words, uploadLimit, toast, confirm, openNewEntry, openNewCase],
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
        <Sheet onClose={() => answer(false)} labelledBy="confirm-title">
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

      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  t.onAction?.();
                  setToasts((current) => current.filter((x) => x.id !== t.id));
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </UiContext.Provider>
  );
}
