'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { EntryPicker } from '@/components/entry/EntryPicker';
import { useUi } from '@/components/ui/UiProvider';
import { useAuthorOptional } from '@/components/you/AuthorProvider';
import { CHARACTER_TYPE_SLUG } from '@/lib/newEntryType';
import { fill } from '@/lib/words';

type Made = { id: string; name: string; slug: string };

/**
 * §106 (golf i2): *Wie ben jij aan tafel?* — de eerste stap van een speler die
 * nog niemand is.
 *
 * Tot deze ronde kreeg een nieuwe speler op elke pagina een banner van drie
 * regels ("Je hebt nog geen karakter, dus je kunt alleen lezen…") en drie
 * deuren naar `/you`, waar een zoekvak stond voor een artikel dat nog niet
 * bestond. De weg was: raden, *Nieuw artikel*, een naam, *Aanmaken*, op het
 * nieuwe artikel *Dit is mijn karakter* vinden, en bij het eerste artikel
 * daarna nog eens de schrijfvraag. Dit is dezelfde weg in één vraag:
 *
 *   1. een naam typen en *Dit ben ik*: `POST /api/entries` op de soort
 *      onderzoeker (§18b's ene open deur, `requireAuthorOrFirstCharacter`) en
 *      daarna `POST /api/characters` (§18c's eerste koppeling, dezelfde twee
 *      schrijfwegen als de knoppen die er al waren — geen nieuwe);
 *   2. of, in de vouw, het artikel dat er al staat opzoeken en koppelen.
 *
 * Daarna neemt dit venster de keuze mee (`followPlay`, §91): wie net zei
 * "dit ben ik", hoeft de schrijfvraag niet nog eens te beantwoorden. §18b blijft
 * zoals hij is — per venster, en een ander venster wordt gewoon gevraagd.
 *
 * En dan één keer vieren: *Welkom, Cornelis.*, met een stempel die neerkomt en
 * drie deuren. Het welkom leeft alleen in de staat van dit onderdeel; de
 * pagina rendert het voor elke speler zonder Keeperrol, dus het overleeft de
 * `router.refresh()` die de kamer en de Jij-rij brengt, en is weg zodra je
 * verder gaat. Er wordt niets over opgeslagen: het komt nooit terug.
 */
export function WieBenJij({ needs }: { needs: boolean }) {
  const ui = useUi();
  const words = ui.words;
  const author = useAuthorOptional();
  const router = useRouter();
  const nameId = useId();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<Made | null>(null);
  const [gone, setGone] = useState(false);
  const welcomeRef = useRef<HTMLHeadingElement>(null);
  /*
   * §106 (na review 4, M6): *Schrijf je eerste artikel* is meteen rood. Tot de
   * verversing binnen is weet de schil nog niet dat je iemand bent; een druk in
   * die ~350 ms wordt bewaard (`aria-busy`) en uitgevoerd zodra het kan, in
   * plaats van een grijze, gestippelde knop die daarna van kleur verspringt.
   */
  const [writeWaiting, setWriteWaiting] = useState(false);
  const mayType = Boolean(author?.mayType);
  useEffect(() => {
    if (!writeWaiting || !mayType) return;
    setWriteWaiting(false);
    setGone(true);
    ui.openNewEntry();
  }, [writeWaiting, mayType, ui]);

  /*
   * §106, aangevuld in golf J: de caret staat meteen in het naamvak. Dit is de
   * enige vraag op de pagina en het eerste wat een nieuwe speler doet, net als
   * het naamvak van de voordeur (rij 24 van de meting: een tik minder). Alleen
   * als niets anders de focus al heeft: wie al ergens anders begon (de
   * palet-toets, een link), houdt zijn plek.
   *
   * Alleen met een muis (`pointer: fine`). Op een aanraakscherm opent een
   * focus zonder gebaar geen toetsenbord, en een caret in een schrijfvak laat
   * de + wijken (golf J): dan stond er een vak zonder toetsenbord en geen +.
   */
  const nameRef = useRef<HTMLInputElement>(null);
  const showsQuestion = needs && !welcome && !gone;
  useEffect(() => {
    if (!showsQuestion) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const box = nameRef.current;
    const active = document.activeElement;
    if (!box || (active && active !== document.body && active !== document.documentElement)) return;
    box.focus({ preventScroll: true });
  }, [showsQuestion]);

  // De focus naar het welkom, zodat een schermlezer het hoort en Tab verder
  // gaat bij de deuren eronder.
  useEffect(() => {
    if (welcome) welcomeRef.current?.focus();
  }, [welcome]);

  if (gone || (!needs && !welcome)) return null;

  async function tie(entry: Made) {
    const response = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? words.whoAtTableFailed);
    }
    // §91: dit venster schrijft voortaan als wie je net zei te zijn.
    author?.followPlay(entry.id);
    setWelcome(entry);
    router.refresh();
  }

  async function make() {
    const chosen = name.trim();
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ typeSlug: CHARACTER_TYPE_SLUG, name: chosen }),
      });
      const data = (await response.json().catch(() => ({}))) as { entry?: Made; error?: string };
      if (!response.ok || !data.entry) throw new Error(data.error ?? words.whoAtTableFailed);
      await tie({ id: data.entry.id, name: data.entry.name, slug: data.entry.slug });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : words.whoAtTableFailed);
    } finally {
      setBusy(false);
    }
  }

  async function pick(entry: Made) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await tie(entry);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : words.whoAtTableFailed);
    } finally {
      setBusy(false);
    }
  }

  if (welcome) {
    return (
      <section className="wie-ben-jij wie-welkom eerste-plek" aria-labelledby="wie-welkom-kop" data-testid="wie-welkom">
        {/* §102 regel 7: een eerste keer, dus één keer vieren — in het expressieve register. */}
        <span className="stamp wie-welkom-stempel" aria-hidden="true">
          {words.welcomeStamp}
        </span>
        <h2 id="wie-welkom-kop" className="wie-kop" tabIndex={-1} ref={welcomeRef}>
          {fill(words.welcomeName, { naam: welcome.name })}
        </h2>
        <p className="wie-lead">{fill(words.welcomeLead, { kamer: words.room })}</p>
        <div className="row-wrap wie-deuren">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="wie-welkom-schrijf"
            aria-busy={writeWaiting || undefined}
            onClick={() => {
              if (!mayType) {
                setWriteWaiting(true);
                return;
              }
              setGone(true);
              ui.openNewEntry();
            }}
          >
            <Icon name="edit" size={16} />
            {fill(words.welcomeWrite, { artikel: words.entry })}
          </button>
          <Link className="btn" href={`/kamer/${welcome.slug}`} data-testid="wie-welkom-kamer">
            <Icon name="home" size={16} />
            {fill(words.toRoom, { kamer: words.room })}
          </Link>
          <Link className="btn" href={`/e/${welcome.slug}`}>
            <Icon name="mask" size={16} />
            {fill(words.welcomeOwnPage, { karakter: words.character })}
          </Link>
        </div>
        <button
          type="button"
          className="wie-sluit"
          aria-label={words.welcomeDone}
          title={words.welcomeDone}
          onClick={() => setGone(true)}
        >
          <Icon name="close" size={16} />
        </button>
      </section>
    );
  }

  return (
    <section className="wie-ben-jij eerste-plek" aria-labelledby="wie-kop" data-testid="wie-ben-jij" id="wie-ben-jij">
      <span className="wie-portret" aria-hidden="true">
        <Icon name="mask" size={30} />
      </span>
      <div className="wie-tekst">
        <p className="eyebrow">{words.navGroupYours}</p>
        <h2 id="wie-kop" className="wie-kop">
          {words.whoAtTable}
        </h2>
        <p className="wie-lead">{fill(words.whoAtTableLead, { karakter: words.character })}</p>
        <form
          className="wie-vorm"
          onSubmit={(event) => {
            event.preventDefault();
            void make();
          }}
        >
          <label className="label" htmlFor={nameId}>
            {fill(words.whoAtTableName, { karakter: words.character })}
          </label>
          <div className="wie-regel">
            <input
              id={nameId}
              ref={nameRef}
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={words.whoAtTablePlaceholder}
              autoComplete="off"
              enterKeyHint="done"
              readOnly={busy}
              data-testid="wie-naam"
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()} data-testid="wie-ga">
              <Icon name="check" size={16} />
              {busy ? words.whoAtTableBusy : words.whoAtTableGo}
            </button>
          </div>
          {error && (
            <p className="error-note small" role="alert" style={{ margin: '0.4rem 0 0' }}>
              {error}
            </p>
          )}
        </form>
        <details className="wie-al">
          <summary>{words.whoAtTableExisting}</summary>
          <p className="tiny muted" style={{ margin: '0.4rem 0' }}>
            {fill(words.whoAtTableExistingHint, {
              artikel: words.entry,
              karakter: words.character,
              keeper: words.keeper,
            })}
          </p>
          <EntryPicker
            value={null}
            placeholder={fill(words.whoAtTableSearch, { artikel: words.entry, karakter: words.character })}
            onPick={(entry) => void pick({ id: entry.id, name: entry.name, slug: entry.slug })}
            onClear={() => undefined}
          />
        </details>
      </div>
    </section>
  );
}
