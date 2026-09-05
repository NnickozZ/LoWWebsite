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
  children,
}: {
  types: EntryTypeLite[];
  words?: Words;
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

  const openNewEntry = useCallback((next?: NewEntryPrefill) => {
    setEntryPrefill(next ?? {});
  }, []);

  const openNewCase = useCallback((next?: NewCasePrefill) => {
    setCasePrefill(next ?? {});
  }, []);

  // §6: `n` opens a new entry, `/` goes to search.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'n') {
        event.preventDefault();
        setEntryPrefill({});
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
      router.push(`/c/${created.slug}`);
      router.refresh();
    },
    [casePrefill, router],
  );

  const value = useMemo<UiValue>(
    () => ({ types, words, toast, confirm, openNewEntry, openNewCase }),
    [types, words, toast, confirm, openNewEntry, openNewCase],
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
