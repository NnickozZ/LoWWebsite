'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { LiveField, LiveFields } from '@/components/live/LiveFields';
import type { LiveUser } from '@/components/editor/useLiveDoc';
import { saveLabel, useAutosave } from '@/components/entry/useAutosave';
import { KIND_ICON, KIND_WORD, type KeeperKind, type KeeperRef } from '@/lib/keeper/kinds';
import { KeeperSwitch } from './KeeperSwitch';
import { KeeperTiePicker } from './KeeperTiePicker';

/** One rope, with the id needed to cut it. */
export type KeeperRope = { tieId: string; other: KeeperRef };

export type KeeperPanelProps = {
  kind: KeeperKind;
  id: string;
  /** Is the record this panel is on the Keeper's own side (§44)? */
  keeperOnly: boolean;
  twin: KeeperRef | null;
  /** §53: the tie behind that twin, so it can be untied from either page. */
  twinTieId: string | null;
  ropes: KeeperRope[];
  /** The pair's notes as the server had them, for the road without a room. */
  notes: string;
  /**
   * §44 + §20: the notes as a room, already resolved to the pair's Keeper side
   * by `notesTarget` — which is what makes a twin's two pages one text. Null
   * when the line could not be opened; `LiveField` then falls back on its own.
   */
  live: { room: string; state: string; canEdit: boolean; user: LiveUser } | null;
};

/**
 * §44: the Keeper's corner of a page — the same one on all five kinds.
 *
 * It holds four things, in the order a Keeper needs them: the way across to
 * the other face, whether this page is theirs at all, what it is roped to, and
 * the notes. It replaced two separate keeper-notes boxes (an artikel's and a
 * dossier's) and gave the other three kinds one they never had.
 *
 * Every bit of it is rendered by a server that has already established
 * `isKeeper` — a player's HTML does not carry this component at all, hidden or
 * otherwise. It never decides anything about rights itself: `twin` and `ropes`
 * arrive already read through `keeperRef`, so an end this viewer may not see is
 * not in the list rather than being filtered out here.
 */
export function KeeperPanel(props: KeeperPanelProps) {
  const { kind, id, keeperOnly, twin, twinTieId, ropes, notes, live } = props;
  const words = useUi().words;

  return (
    <details className="section keeper-panel" data-testid="keeper-panel">
      <summary>
        <Icon name="shield" size={14} /> {words.keeperSide}
      </summary>
      <div className="keeper-panel-body">
        <KeeperSwitch
          kind={kind}
          id={id}
          keeperOnly={keeperOnly}
          twin={twin}
          twinTieId={twinTieId}
          ropes={ropes.map((rope) => rope.other)}
        />
        <SideToggle kind={kind} id={id} keeperOnly={keeperOnly} hasTwin={Boolean(twin)} />
        <Ropes kind={kind} id={id} ropes={ropes} />
        <Notes kind={kind} id={id} notes={notes} live={live} sharedWith={twin} />
      </div>
    </details>
  );
}

/* ------------------------------------------------- deze pagina is van de Keeper */

function SideToggle({
  kind,
  id,
  keeperOnly,
  hasTwin,
}: {
  kind: KeeperKind;
  id: string;
  keeperOnly: boolean;
  hasTwin: boolean;
}) {
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  const [on, setOn] = useState(keeperOnly);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOn(keeperOnly), [keeperOnly]);

  async function toggle(next: boolean) {
    setOn(next);
    setBusy(true);
    try {
      const response = await fetch('/api/keeper/side', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, id, on: next }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setOn(!next);
        ui.toast(data.error ?? 'Dat lukte niet.');
        return;
      }
      // The colours of the page, its stamp and every list it is in are read on
      // the server, so the whole page re-reads rather than being patched here.
      router.refresh();
    } catch {
      setOn(!next);
      ui.toast('Geen verbinding.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="keeper-panel-block">
      <label className="row keeper-side-toggle">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          data-testid="keeper-side-toggle"
          onChange={(event) => void toggle(event.target.checked)}
        />
        <span>
          Deze pagina is van de {words.keeper}
        </span>
      </label>
      <p className="tiny muted keeper-panel-hint">
        {on
          ? `Alleen de ${words.keeper} ziet deze pagina — in lijsten, in het web, en op het adres zelf.`
          : `Zet dit aan en de pagina verdwijnt voor iedereen behalve de ${words.keeper}.`}
        {hasTwin && ' De andere kant blijft staan waar hij stond.'}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- touwtjes */

function Ropes({ kind, id, ropes }: { kind: KeeperKind; id: string; ropes: KeeperRope[] }) {
  const ui = useUi();
  const words = ui.words;
  const router = useRouter();
  const [busy, setBusy] = useState('');

  async function cut(tieId: string) {
    setBusy(tieId);
    try {
      const response = await fetch(
        `/api/keeper/ties?id=${encodeURIComponent(tieId)}&kind=${kind}&from=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        ui.toast(data.error ?? 'Dat lukte niet.');
        return;
      }
      router.refresh();
    } catch {
      ui.toast('Geen verbinding.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="keeper-panel-block">
      <h3 className="keeper-panel-title">
        <Icon name="link" size={13} /> Touwtjes
      </h3>
      <p className="tiny muted keeper-panel-hint">
        Waar deze pagina over gaat. Een touwtje is geen recht: wie de andere kant niet mag zien,
        krijgt hem ook hier niet te zien.
      </p>
      {ropes.length > 0 ? (
        <ul className="keeper-rope-list" data-testid="keeper-ropes">
          {ropes.map((rope) => (
            <li key={rope.tieId} className="row keeper-rope-row">
              <Icon name={KIND_ICON[rope.other.kind]} size={15} style={{ color: 'var(--ink-muted)' }} />
              <Link className="small" href={rope.other.href}>
                {rope.other.name}
              </Link>
              <span className="tiny muted">{words[KIND_WORD[rope.other.kind]]}</span>
              {rope.other.keeperOnly && <Icon name="shield" size={12} className="keeper-rope-mark" />}
              <button
                type="button"
                className="btn btn-small btn-ghost keeper-rope-cut"
                disabled={busy === rope.tieId}
                aria-label={`Touwtje naar ${rope.other.name} losmaken`}
                onClick={() => void cut(rope.tieId)}
              >
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tiny muted" style={{ margin: '0 0 0.4rem' }}>
          Nog geen touwtjes.
        </p>
      )}
      <KeeperTiePicker self={{ kind, id }} onTied={() => router.refresh()} />
    </div>
  );
}

/* --------------------------------------------------------------------- notities */

function Notes({
  kind,
  id,
  notes,
  live,
  sharedWith,
}: {
  kind: KeeperKind;
  id: string;
  notes: string;
  live: KeeperPanelProps['live'];
  sharedWith: KeeperRef | null;
}) {
  const words = useUi().words;
  const [text, setText] = useState(notes);
  useEffect(() => setText(notes), [notes]);

  /*
   * The road without a room. `LiveField` says which one a keystroke took:
   * `live: true` means the room has already saved it, and this autosave must
   * keep its hands off — two savers writing one column is how the second one
   * throws the first away, which is the whole reason §44 made these a room.
   */
  const { state, set, flush } = useAutosave<{ text: string }>({
    save: async (patch) => {
      const response = await fetch('/api/keeper/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, id, text: patch.text }),
      });
      return { ok: response.ok };
    },
  });

  const box = (
    <LiveField
      as="textarea"
      field="notes"
      id={`keeper-notes-${kind}`}
      className="textarea keeper-notes"
      data-testid="keeper-notes"
      value={text}
      placeholder={`Wordt nooit aan ${words.playerPlural} getoond.`}
      onValue={(next, meta) => {
        setText(next);
        if (!meta.live) set({ text: next });
      }}
      onBlur={() => void flush()}
    />
  );

  return (
    <div className="keeper-panel-block">
      <h3 className="keeper-panel-title">
        <Icon name="notebook" size={13} /> {words.keeperNotes}
      </h3>
      {sharedWith && (
        <p className="tiny muted keeper-panel-hint" data-testid="keeper-notes-shared">
          Eén tekst, gedeeld met <Link href={sharedWith.href}>{sharedWith.name}</Link>.
        </p>
      )}
      {live ? (
        <LiveFields room={live.room} state={live.state} canEdit={live.canEdit} user={live.user}>
          {box}
        </LiveFields>
      ) : (
        box
      )}
      {!live && state !== 'idle' && (
        <p className="tiny muted" style={{ margin: '0.3rem 0 0' }}>
          {saveLabel(state)}
        </p>
      )}
    </div>
  );
}
