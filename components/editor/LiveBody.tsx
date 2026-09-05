'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { RichEditor } from './RichEditor';
import { liveBodyJSON, useLiveDoc, type LivePerson, type LiveSave, type LiveStatus, type LiveUser } from './useLiveDoc';

/**
 * §20: a piece of shared text on a page — the fiche's body, or one section.
 *
 * Loaded on the client only (`next/dynamic` with `ssr: false` in the pages
 * that use it), and on purpose: Tiptap renders nothing on the server anyway,
 * and keeping Yjs out of the server-side render means the server holds
 * exactly one copy of it — the one the rooms live in. Two copies of a CRDT
 * library in one process fail their own `instanceof` checks, and Yjs says so
 * loudly at start-up.
 *
 * Someone who may look but not type gets the same live text, read-only, and a
 * button that opens a *copy* to edit and send as a proposal (§10, §17). The
 * shared text is never touched by a proposal until the owner takes it.
 */
export function LiveBody({
  room,
  state,
  user,
  canEdit,
  placeholder,
  proposals = false,
  onPropose,
  onStatus,
  onSaved,
}: {
  room: string;
  /** The document as the server had it when the page was made (base64). */
  state: string;
  user: LiveUser;
  /** The room's gate for this viewer, as the page computed it. */
  canEdit: boolean;
  placeholder?: string;
  /** Offer the proposal road to someone who may only look. */
  proposals?: boolean;
  onPropose?: (doc: unknown) => void;
  onStatus?: (status: { others: LivePerson[]; status: LiveStatus; save: LiveSave }) => void;
  onSaved?: (saved: { at: number; by: string | null; keys: string[] }) => void;
}) {
  const ui = useUi();
  const words = ui.words;
  const live = useLiveDoc({ room, user, initialState: state });
  const mayType = live.canEdit ?? canEdit;
  const [proposing, setProposing] = useState(false);
  const [proposalDoc, setProposalDoc] = useState<unknown>(null);

  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  useEffect(() => {
    onStatusRef.current?.({ others: live.others, status: live.status, save: live.save });
  }, [live.others, live.status, live.save]);

  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  useEffect(() => {
    if (live.savedAt) onSavedRef.current?.(live.savedAt);
  }, [live.savedAt]);

  if (!live.synced) return <div className="editor-body" aria-busy="true" />;

  return (
    <>
      <RichEditor
        initialDoc={null}
        placeholder={placeholder}
        onChange={() => undefined}
        editable={mayType && !proposing}
        live={{ doc: live.doc, provider: live.provider, user }}
      />

      {proposals && !mayType && !proposing && (
        <p className="row-wrap" style={{ margin: '0.5rem 0 0' }}>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              setProposalDoc(liveBodyJSON(live.doc));
              setProposing(true);
            }}
          >
            <Icon name="edit" size={14} />
            Wijziging voorstellen
          </button>
        </p>
      )}

      {proposing && (
        <div className="proposal-editor">
          <p className="small muted" style={{ margin: '0.6rem 0 0.3rem' }}>
            Je eigen versie van de tekst. Wat je stuurt komt als voorstel bij de eigenaar en de {words.keeper};
            de tekst hierboven verandert pas als zij het overnemen.
          </p>
          <RichEditor initialDoc={proposalDoc} placeholder={placeholder} onChange={(doc) => setProposalDoc(doc)} />
          <p className="row-wrap" style={{ margin: '0.5rem 0 0' }}>
            <button
              type="button"
              className="btn btn-small btn-primary"
              onClick={() => {
                onPropose?.(proposalDoc);
                setProposing(false);
              }}
            >
              Voorstel sturen
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setProposing(false)}>
              Annuleren
            </button>
          </p>
        </div>
      )}
    </>
  );
}
