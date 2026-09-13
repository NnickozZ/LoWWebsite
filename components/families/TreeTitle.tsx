'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUi } from '@/components/ui/UiProvider';

/**
 * §34/§66 — the stamboom's name, in the one place a page has a title.
 *
 * It was in two: the §34 heading printed it and `.tree-bar` printed it again in
 * an editable box, along with a second copy of the dossier chip the eyebrow
 * already carries. On a 390 px telephone those two rows were about 330 px of
 * screen spent saying the same thing twice, before the stage got any.
 *
 * So the box *is* the heading. It wears the same serif at the same size as
 * `.canvas-head h1` (the stylesheet does that, in one rule, from the h1's own
 * `font-size`), and a reader who may not edit gets plain text — there is no
 * box, because there is nothing to type in it.
 *
 * The `<h1>` keeps `data-testid="family-tree-title"`, so what a spec finds is
 * the heading whichever face it is wearing; the box inside it keeps
 * `id="tree-name"`, so what a spec *types into* is unchanged too.
 *
 * A rename by somebody else arrives through the page: `LivePage` watches
 * `family_tree:{id}`, so the server re-renders and hands this component a new
 * `name`. That is taken *unless* the caret is in the box — a name that changes
 * under the hand that is typing it is worse than one that is a second late.
 */
export function TreeTitle({
  id,
  name: given,
  canEdit,
}: {
  id: string;
  name: string;
  canEdit: boolean;
}) {
  const ui = useUi();
  const router = useRouter();
  const [name, setName] = useState(given);
  const boxRef = useRef<HTMLInputElement>(null);
  /** The last name this component sent, so its own echo is not taken as news. */
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
      const response = await fetch(`/api/family-trees/${id}`, {
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
    return <h1 data-testid="family-tree-title">{name}</h1>;
  }

  return (
    <h1 data-testid="family-tree-title" className="tree-title">
      <label className="visually-hidden" htmlFor="tree-name">
        Naam van de {ui.words.familyTree}
      </label>
      <input
        ref={boxRef}
        id="tree-name"
        className="tree-name-input"
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
