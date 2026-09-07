'use client';

import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Thumb } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { reconnectLive, setWritingAs } from '@/components/live/LiveProvider';
import { Sheet } from '@/components/ui/Sheet';
import {
  authorStance,
  effectiveAuthorId,
  mayStartEntryWith,
  mayTypeWith,
  rememberedFrom,
  shouldPrompt,
  writeRemembered,
  type MiniStorage,
} from '@/lib/authorChoice';
import { onAuthorNeeded } from '@/lib/authorSignal';
import type { CharacterLite } from '@/lib/characters';
import type { Words } from '@/lib/words';
import type { Me } from './CharacterSwitcher';

/**
 * §18b: who this *window* is writing as.
 *
 * §18 gave an account a wardrobe and one karakter worn at a time. That was
 * enough while one account meant one investigator; it stopped being enough the
 * moment two players at one table shared a laptop, or one player ran two
 * onderzoekers in two windows. So the choice moved off the account and onto
 * the **browser window**: `sessionStorage` is exactly the lifetime the answer
 * should have, and every request out of the window carries it as `X-Character`
 * (the patch in `LiveProvider`).
 *
 * Three people meet this provider and it treats them differently:
 *
 *  - a **Keeper** is never asked and never blocked. A Keeper is always the
 *    Keeper, in every log, on every wall.
 *  - a **speler with onderzoekers** is asked once per window, at the first
 *    attempt to *type* — never on arrival. Somebody who opened the wiki to
 *    read a name is not interrogated for it.
 *  - a **speler with none** is not asked at all, because there is nothing to
 *    choose. They get the banner and read-only inputs. The archive refuses
 *    their writes either way (`requireAuthor`); the banner is the explanation,
 *    not the gate. With one door left open: an onderzoeker *is* an artikel
 *    tied to an account, so they may still make an artikel — otherwise the
 *    banner would tell them to do something the screen refused to start. That
 *    is `mayStartEntry`, and `requireAuthorOrFirstCharacter` is the archive
 *    saying the same thing on the wire.
 *
 * **The timing matters more than anything else here.** The window's remembered
 * answer has to be in the module box `LiveProvider`'s `fetch` patch reads
 * *before the first request leaves and before the `EventSource` opens*, or the
 * first live line — and the name on the presence strip — carries the account's
 * default rather than this window's onderzoeker. So it is read in a `useState`
 * initialiser, which runs during this component's own render, before any child
 * renders and long before any effect; and asserted again in a
 * `useLayoutEffect`, which runs before *every* passive effect in the tree,
 * including the one that opens the line. Both are idempotent, which is what
 * makes React 19's Strict Mode double-invocation a non-event: the initialiser
 * writes the same id twice and the layout effect writes it again.
 *
 * The provider therefore has to sit *above* `AppShell` — see
 * `app/(app)/layout.tsx`. The pieces of it that are drawn (the banner, the
 * indicator) are exported separately and rendered from inside the shell, where
 * they belong on the screen.
 *
 * **Asking is a sheet, so where the asking happens matters.** There are two
 * doors into the question and they are shaped differently on purpose:
 *
 *  - `ask()` — an editing *surface*. A caret lands in a paragraph, the sheet
 *    comes up over the page, and the page is still underneath when it is
 *    answered. Nothing is held back, because nothing had started.
 *  - `ensureAuthor(then)` — anything that would itself open a **sheet**, which
 *    in practice means the two "nieuw …" roads. Asking with `ask()` there
 *    stacked a sheet on a sheet: the question refuses Escape, so Escape went
 *    to the sheet *below* it and closed that instead, leaving the question
 *    standing over a page nobody had asked for. The order is turned round —
 *    the question first, alone, and the action released by the answer.
 */

export type AuthorValue = {
  /**
   * Whose name the archive will put on the next write from this window: the
   * window's own answer, or — while it has not answered — the account's
   * karakter, which is what a plain page navigation falls back to.
   */
  authorId: string | null;
  authorName: string | null;
  /** False only for a speler with no onderzoeker: every input is switched off. */
  mayType: boolean;
  /**
   * The one thing that stays on when `mayType` is off: making a new artikel.
   * An onderzoeker *is* an artikel tied to an account, so this is the road out
   * of read-only, and the archive lets exactly this one write through
   * (`requireAuthorOrFirstCharacter`).
   */
  mayStartEntry: boolean;
  /** The onderzoekers this account holds. Empty for a Keeper, by rule. */
  characters: CharacterLite[];
  /**
   * The gate on a first edit attempt. Opens the sheet — and refuses to be
   * dismissed — only when this window still owes an answer; a no-op for a
   * Keeper, for somebody with nothing to choose, and for a window that has
   * already chosen.
   *
   * For an editing *surface* this is the whole story: the sheet stands in
   * front of the page, and the page is still there when it is answered.
   * Anything that would put a second **sheet** on the screen wants
   * `ensureAuthor` instead.
   */
  ask: () => void;
  /**
   * "Ask first, then do." The same question as `ask`, with the thing that
   * asked it waiting behind it.
   *
   * `ask()` opens a sheet. That is the right shape for a caret landing in a
   * paragraph, and the wrong shape for the "Nieuw artikel" road, which opens a
   * sheet of its own: the question would arrive *on top of* it, and Escape —
   * which the blocking question rightly refuses — would take the sheet
   * underneath instead and leave the question hanging over a bare page. So the
   * order is turned around. The action is held, the question is asked alone,
   * and the answer releases it, in the same commit that closes the question,
   * so there is never a moment with two sheets on the screen.
   *
   * `then` runs **synchronously** for everyone who has nothing to answer — a
   * Keeper, a window that has already chosen, and (the deliberate onboarding
   * exception) a speler with no onderzoeker at all, for whom the new-artikel
   * road has to stay open because that artikel is how they stop having none.
   */
  ensureAuthor: (then: () => void) => void;
  /** The indicator's door: always opens the sheet, and it closes again. */
  change: () => void;
  /** Has *this window* answered? (As opposed to falling back to the account.) */
  chosen: boolean;
};

const AuthorContext = createContext<AuthorValue | null>(null);

export function useAuthor(): AuthorValue {
  const value = useContext(AuthorContext);
  if (!value) throw new Error('useAuthor must be used inside <AuthorProvider>');
  return value;
}

/** The same, or null outside the shell (a component in a test harness). */
export function useAuthorOptional(): AuthorValue | null {
  return useContext(AuthorContext);
}

/**
 * May the person at this keyboard type at all? Every editing surface asks, and
 * folds the answer into whatever `readOnly` it already had. Outside the shell
 * — a component rendered on its own in a test — the answer is yes, because
 * there is no account to say otherwise and the server is the real gate.
 */
export function useMayType(): boolean {
  const value = useContext(AuthorContext);
  return value ? value.mayType : true;
}

/**
 * May they start a new artikel? Asked by the `+`, by the `n` shortcut and by
 * the sheet the two of them open — and by nothing else, because that is the
 * only write a speler with no onderzoeker is allowed to make.
 */
export function useMayStartEntry(): boolean {
  const value = useContext(AuthorContext);
  return value ? value.mayStartEntry : true;
}

export type AuthorGateProps = {
  onFocusCapture: () => void;
  onKeyDownCapture: () => void;
  onPointerDownCapture: () => void;
};

/**
 * The three ways a person starts to edit something, wired to `ask()`. Spread
 * onto the outermost element of an editing surface; capture handlers, so a
 * child's own handling never swallows the question, and observers only — they
 * neither prevent nor stop anything.
 *
 * Surfaces only. A *sheet* that wants the question asked before it opens uses
 * `ensureAuthor` instead, or it ends up underneath the answer.
 */
export function useAuthorGate(): AuthorGateProps {
  const value = useContext(AuthorContext);
  const ask = value?.ask;
  return useMemo(
    () => ({
      onFocusCapture: () => ask?.(),
      onKeyDownCapture: () => ask?.(),
      onPointerDownCapture: () => ask?.(),
    }),
    [ask],
  );
}

/**
 * How long after an answer a refusal is treated as a write that left before
 * the header did. The same idea as `OWN_WRITE_MUTE_MS` on the live line: an
 * answer in flight and an answer already given look identical from here.
 */
const ANSWER_GRACE_MS = 3000;

/** `sessionStorage`, or null where there is none (the server render). */
function windowStore(): MiniStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function AuthorProvider({
  me,
  words,
  children,
}: {
  me: Me;
  /** §11: the Keeper's words, resolved on the server in the layout. */
  words: Words;
  children: ReactNode;
}) {
  const characterIds = useMemo(() => me.characters.map((c) => c.entryId), [me.characters]);
  const idsKey = characterIds.join(',');

  /*
   * The earliest legal point in the tree. `setWritingAs` here — a side effect
   * in an initialiser — is deliberate: nothing else runs early enough. It is
   * idempotent, so Strict Mode's second invocation writes the same id.
   */
  const [chosen, setChosen] = useState<string | null>(() => {
    const remembered = me.isKeeper ? null : rememberedFrom(windowStore(), characterIds);
    setWritingAs(remembered);
    return remembered;
  });

  // Read by the stable callbacks below, which are wired into event handlers all
  // over the app and must not be rebuilt on every answer.
  const chosenRef = useRef(chosen);
  chosenRef.current = chosen;

  /*
   * Said again before any passive effect in the tree — the one that opens the
   * `EventSource` among them — and on every later change of the answer.
   */
  useLayoutEffect(() => {
    setWritingAs(chosen);
  }, [chosen]);

  /*
   * A karakter untied elsewhere (another window, a Keeper) arrives here as new
   * props. An answer that named it is worth nothing now, and must not keep
   * riding out on every request.
   */
  useEffect(() => {
    const still = chosenRef.current;
    if (still && !characterIds.includes(still)) {
      writeRemembered(windowStore(), null);
      setChosen(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const stance = authorStance({ isKeeper: me.isKeeper, characterIds, remembered: chosen });
  const mayType = mayTypeWith(stance);
  const mayStartEntry = mayStartEntryWith(stance);

  /*
   * The stance as of *now* rather than as of the last render, for the stable
   * callbacks below. `chosenRef` is written the moment somebody answers, ahead
   * of the re-render, so this is right even inside the click that answered.
   */
  const stanceNow = useCallback(
    () =>
      authorStance({ isKeeper: me.isKeeper, characterIds, remembered: chosenRef.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me.isKeeper, idsKey],
  );

  const [sheet, setSheet] = useState<'blocking' | 'change' | null>(null);
  /** When this window last answered — see `ANSWER_GRACE_MS`. */
  const answeredAt = useRef(0);
  /**
   * What is waiting behind the question — the "then" of `ensureAuthor`. A ref
   * and not state: nothing on the screen depends on it, and it has to be
   * readable inside the very click that answers.
   */
  const pending = useRef<(() => void) | null>(null);

  const ask = useCallback(() => {
    // Exactly the `ask` stance: a Keeper has nothing to answer, somebody with
    // no onderzoeker has nothing to answer it with (and has the banner
    // instead), and a window that has answered is not asked twice.
    if (!shouldPrompt(stanceNow())) return;
    setSheet((current) => current ?? 'blocking');
  }, [stanceNow]);

  /**
   * The same question, with the caller's own next step held behind it — see
   * the note on `AuthorValue.ensureAuthor`. Nothing to ask means nothing to
   * wait for, so `then` runs on the spot rather than a tick later: a caller
   * that opens a sheet must not lose the click that opened it.
   */
  const ensureAuthor = useCallback(
    (then: () => void) => {
      if (!shouldPrompt(stanceNow())) {
        then();
        return;
      }
      // A second thing asked for while the question stands replaces the first;
      // one answer releases one action, and the person is looking at the
      // question, not at whatever they clicked before it.
      pending.current = then;
      setSheet((current) => current ?? 'blocking');
    },
    [stanceNow],
  );

  const change = useCallback(() => {
    if (me.isKeeper || !characterIds.length) return;
    setSheet('change');
  }, [me.isKeeper, characterIds.length]);

  /** Dismissing the question throws away whatever was waiting behind it. */
  const dismiss = useCallback(() => {
    pending.current = null;
    setSheet(null);
  }, []);

  const choose = useCallback((id: string) => {
    writeRemembered(windowStore(), id);
    answeredAt.current = Date.now();
    chosenRef.current = id;
    setWritingAs(id);
    setChosen(id);
    setSheet(null);
    /*
     * An `EventSource` cannot carry a header, so the line took the window's
     * onderzoeker in its URL when it opened — with nobody in it, or with the
     * name from before. Opening it again is what puts the right name on
     * everyone else's presence strip.
     */
    reconnectLive();
    /*
     * And now the thing that was waiting. Still inside the click, so React
     * folds it into the same commit as `setSheet(null)` above: the question
     * goes and the sheet it was holding back arrives together, and the screen
     * never carries both.
     */
    const next = pending.current;
    pending.current = null;
    next?.();
  }, []);

  /*
   * Belt and braces (and the only thing that catches a write started before
   * the surface it came from was gated): the archive itself asking the
   * question. Ignored for somebody with nothing to choose — for them the 400
   * is the banner's own truth, not a question.
   *
   * A window that *had* answered and is refused anyway has an answer that has
   * stopped working — the karakter was untied since — so the answer is thrown
   * away and the question asked again, rather than the refusal being swallowed
   * on the grounds that somebody once chose something. The one exception is a
   * refusal that arrives right after the answer: that is a write which left
   * *before* the header existed, coming home late, and it says nothing about
   * the answer that overtook it.
   *
   * This is the one entry point that cannot be turned round into "ask, then
   * do": it is not somebody starting an action, it is an action that already
   * left coming home refused, and it can land while any sheet in the app is
   * open. So this one really may stack — which is why `Sheet` counts its pile
   * (`lib/sheetStack`) and gives Escape, Tab, the backdrop and the scroll lock
   * to whichever sheet is on top. Nothing is queued behind it: the refused
   * write is gone, and the person retries it themselves.
   */
  useEffect(
    () =>
      onAuthorNeeded(() => {
        if (me.isKeeper || !characterIds.length) return;
        if (Date.now() - answeredAt.current < ANSWER_GRACE_MS) return;
        if (chosenRef.current) {
          writeRemembered(windowStore(), null);
          chosenRef.current = null;
          setChosen(null);
        }
        setSheet((current) => current ?? 'blocking');
      }),
    [me.isKeeper, characterIds.length],
  );

  const authorId = effectiveAuthorId({ isKeeper: me.isKeeper, chosen, activeId: me.activeId });
  const authorName = me.characters.find((c) => c.entryId === authorId)?.name ?? null;

  const value = useMemo<AuthorValue>(
    () => ({
      authorId,
      authorName,
      mayType,
      mayStartEntry,
      characters: me.characters,
      ask,
      ensureAuthor,
      change,
      chosen: chosen !== null,
    }),
    [
      authorId,
      authorName,
      mayType,
      mayStartEntry,
      me.characters,
      ask,
      ensureAuthor,
      change,
      chosen,
    ],
  );

  return (
    <AuthorContext.Provider value={value}>
      {children}
      {sheet && (
        <WritingAsSheet
          words={words}
          characters={me.characters}
          chosen={chosen}
          /* Blocking typing means blocking: there is no way out but an answer. */
          onClose={sheet === 'change' ? dismiss : null}
          onChoose={choose}
        />
      )}
    </AuthorContext.Provider>
  );
}

/* ------------------------------------------------------------- the question */

/**
 * The same knot as the switcher's sheet — `who-list`, `who-option`, one
 * radiogroup — asking a different question. Two differences, and both are the
 * point of §18b: it lists *only* the onderzoekers, because writing as yourself
 * is the authorless case the archive now refuses; and while it is standing in
 * front of somebody's keyboard it has no way out but an answer.
 */
function WritingAsSheet({
  words,
  characters,
  chosen,
  onClose,
  onChoose,
}: {
  words: Words;
  characters: CharacterLite[];
  chosen: string | null;
  /** Null while the sheet is blocking typing: nothing dismisses it. */
  onClose: (() => void) | null;
  onChoose: (id: string) => void;
}) {
  return (
    <Sheet onClose={onClose ?? (() => undefined)} labelledBy="writing-as-title">
      <h2 id="writing-as-title" style={{ marginTop: 0, fontSize: '1.25rem' }}>
        Met wie ben je nu aan het schrijven?
      </h2>
      <p className="small muted" style={{ margin: '0 0 0.9rem' }}>
        Alles wat je in dit venster typt komt op naam van deze onderzoeker. Een ander venster kan
        een andere kiezen.
      </p>

      <ul className="who-list" role="radiogroup" aria-label="Met wie ben je nu aan het schrijven?">
        {characters.map((character) => {
          const isChosen = character.entryId === chosen;
          return (
            <li key={character.entryId}>
              <button
                type="button"
                role="radio"
                aria-checked={isChosen}
                className={`who-option${isChosen ? ' who-option-active' : ''}`}
                onClick={() => onChoose(character.entryId)}
              >
                <Thumb
                  assetId={character.coverAssetId}
                  crop={character.coverCrop}
                  shape="portrait"
                  icon={character.typeIcon}
                  colour={character.typeColour}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{character.name}</strong>
                </span>
                {isChosen && <Icon name="check" size={16} />}
              </button>
            </li>
          );
        })}
      </ul>

      {onClose && (
        <p className="row-wrap" style={{ margin: '0.9rem 0 0' }}>
          <Link className="btn btn-small" href="/you#karakters" onClick={onClose}>
            <Icon name="mask" size={15} />
            {words.characterPlural.charAt(0).toUpperCase() + words.characterPlural.slice(1)} beheren
          </Link>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
            Annuleren
          </button>
        </p>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------- what is on screen */

/**
 * "Je schrijft als …" — beside the switcher in the side menu, and above the
 * wardrobe on the Jij page (which is where a phone does its switching). It is
 * the one place the window's own choice is visible, and clicking it is how you
 * change your mind halfway through an evening.
 *
 * It prints the name the archive would actually use, which before an answer is
 * the account's karakter — never a name the next write would not carry.
 */
export function WritingAsLine() {
  const author = useAuthorOptional();
  if (!author || !author.characters.length) return null;

  const name = author.authorName;
  return (
    <div className="who-writing">
      <span className="who-eyebrow">Je schrijft als</span>
      <button
        type="button"
        className="who-button"
        onClick={author.change}
        aria-haspopup="dialog"
        data-testid="writing-as"
      >
        <Icon name="edit" size={15} />
        <span className="who-name">{name ?? 'nog niemand'}</span>
        <Icon name="chevron" size={14} style={{ transform: 'rotate(90deg)', flex: '0 0 auto' }} />
      </button>
    </div>
  );
}

/**
 * The standing notice for a speler with no onderzoeker.
 *
 * Not a toast — a toast is gone before the person has worked out why the page
 * will not take a letter — and not a dialog either, because there is nothing
 * to answer. It sits at the top of the page, says what is wrong in one line,
 * and points at the one place it is fixed. A Keeper never sees it, and neither
 * does anyone who has an onderzoeker to write as.
 *
 * It says what they *can* do, not only what they cannot. Everything on the
 * screen is off except the one button that matters, and a notice that only
 * listed the refusals would leave them looking for a way in that is already in
 * front of them.
 *
 * §18c made koppelen the Keeper's, and this notice tells the reader to do it
 * themselves — which is still exactly right, and stays right by construction.
 * The banner shows on one condition (`no-author`: `listCharacters` is empty)
 * and §18c's door opens on the same one, asked the same way. So there is no
 * state in which this sentence promises something the archive would refuse —
 * not for a new arrival, and not for someone who *had* one and lost it either
 * (the Keeper untied it, or the fiche went to the prullenbak): they are back at
 * zero, so the road is open again and the words are true again. That is the
 * whole reason both rules count the fiches a person can *see* rather than the
 * knots. If those two conditions ever drift apart, this paragraph is the first
 * thing that becomes a lie — and the second sentence would have to become
 * "vraag de {words.keeper} je een onderzoeker te geven".
 *
 * `words` is handed in rather than read from `useUi()` on purpose: this file
 * must not import `UiProvider`, which imports the two "nieuw …" sheets, which
 * ask this file whether the person may type. The shell has the words already.
 */
export function ReadOnlyBanner({ words }: { words: Words }) {
  const author = useAuthorOptional();
  if (!author || author.mayType) return null;

  return (
    <p className="author-banner" role="status" data-testid="no-author-banner">
      <Icon name="eye" size={16} />
      <span>
        <strong>Je hebt nog geen onderzoeker, dus je kunt alleen lezen.</strong> Alles wat iemand
        schrijft komt op naam van een onderzoeker. Maak met ‘{words.newEntry}’ een {words.entry}{' '}
        voor je onderzoeker en <Link href="/you#karakters">koppel het aan je account</Link>, of
        vraag de {words.keeper} het voor je te doen.
      </span>
    </p>
  );
}
