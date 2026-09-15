'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUi } from '@/components/ui/UiProvider';

/**
 * §69 (4.9) — de naam van een tekenvlak, ter plekke te wijzigen.
 *
 * §34 gives every canvas the screen and leaves it one wrapping line of heading.
 * The stamboom worked out in §66 what to do with that line: the heading **is**
 * the box, so renaming costs no second row and no separate sheet. `TreeTitle`
 * was that, and this is the same component with the surface's own nouns taken
 * out of it — because the landkaart and the tijdlijn had no way to be renamed
 * at all except by making a new one, which is not a rename.
 *
 * Three things it inherits from `TreeTitle`, each of which was a bug once:
 *
 *  - **A reader who may not edit gets plain text**, not a disabled box. There
 *    is nothing to type in it, so there is no box.
 *  - **A rename by somebody else is taken — unless the caret is in the box.**
 *    The page is server-rendered and `LivePage` watches the record, so a new
 *    `name` arrives as a prop; a name that changes under the hand typing it is
 *    worse than one that is a second late.
 *  - **Its own echo is not news.** `sent` holds the last name this component
 *    posted, so the refresh it caused does not read as somebody else's change.
 *
 * Escape puts the old name back and lets go; Enter lets go, which saves. A save
 * that the archive refuses says so in a toast and puts the old name back —
 * silently keeping a name the server rejected is how two screens end up
 * disagreeing about what a thing is called.
 */
export function CanvasTitle({
  name: given,
  canEdit,
  endpoint,
  noun,
  testId,
  inputId,
  className,
}: {
  name: string;
  canEdit: boolean;
  /** Where a `PATCH { name }` goes: `/api/maps/{id}`, `/api/timelines/{id}`, … */
  endpoint: string;
  /** The archive's own word for this kind of thing, for the hidden label. */
  noun: string;
  testId?: string;
  /**
   * Kept stable per surface: specs type into it by id.
   *
   * §69 (4.9): en het mag niet botsen met het gelijknamige veld in de
   * Keeper-lade onder de vouw — de landkaart en de tijdlijn hebben daar allebei
   * al een `Naam`. Twee elementen met één `id` is niet cosmetisch: de browser
   * knoopt dan bééde labels aan het eerste vak, en de toegankelijke naam wordt
   * "Naam van de landkaart Naam". Vandaar `map-title-name` en
   * `timeline-title-name` in plaats van de voor de hand liggende namen.
   */
  inputId: string;
  /** The surface's own class on the `h1`, where it has one. */
  className?: string;
}) {
  const ui = useUi();
  const router = useRouter();
  const [name, setName] = useState(given);
  const boxRef = useRef<HTMLInputElement>(null);
  const sent = useRef(given);

  useEffect(() => {
    if (document.activeElement === boxRef.current) return;
    setName(given);
    sent.current = given;
  }, [given]);

  const save = async () => {
    const next = name.trim();
    if (!canEdit || !next || next === sent.current) return;
    sent.current = next;
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        ui.toast(data?.error ?? 'De naam is niet opgeslagen.');
        sent.current = given;
        setName(given);
        return;
      }
      // §35: the page is server-rendered, so the shelf, the eyebrow and the
      // browser's Back button all want the new name.
      router.refresh();
    } catch {
      ui.toast('Geen verbinding.');
      sent.current = given;
      setName(given);
    }
  };

  if (!canEdit) {
    return <h1 data-testid={testId}>{name}</h1>;
  }

  return (
    <h1 data-testid={testId} className={className}>
      <label className="visually-hidden" htmlFor={inputId}>
        Naam van {noun}
      </label>
      <input
        ref={boxRef}
        id={inputId}
        className="canvas-name-input"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setName(given);
            event.currentTarget.blur();
          }
        }}
      />
    </h1>
  );
}
