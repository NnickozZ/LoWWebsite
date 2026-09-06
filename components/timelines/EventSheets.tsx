'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessEditor } from '@/components/access/AccessEditor';
import { assetUrl } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { LiveField, LiveFields, useLiveFields } from '@/components/live/LiveFields';
import { useUi } from '@/components/ui/UiProvider';
import { useMayType } from '@/components/you/AuthorProvider';
import type { LiveUser } from '@/components/editor/useLiveDoc';
import type { AccessSettings } from '@/lib/access';
import { eventFieldsRoomKey } from '@/lib/live/keys';
import type { TimelineEvent, TimelineSummary } from '@/lib/timelines/service';
import {
  ANCHOR_UNIT_LABELS,
  anchorUnitsFor,
  applyAnchor,
  formatWhen,
  parseDutchDate,
  partsToSeconds,
  SCALES,
  SCALE_HINTS,
  SCALE_LABELS,
  secondsToParts,
  type AnchorUnit,
  type Precision,
  type Scale,
  type TimeParts,
} from '@/lib/timelines/time';
import { fitUpload } from '@/components/shrinkImage';
import { imageFromClipboard, uploadForm, SHRUNK_NOTICE } from '@/lib/upload';

/**
 * §32: the sheets around a tijdlijn — the date form, a new gebeurtenis, an
 * existing one, and the tijdlijn's own settings. `TimelineCanvas` is the
 * stage; this file is everything that opens over it.
 */

export const NOTE_COLOUR = '#8a6d3b';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------ the date */

type PartKey = keyof TimeParts;
const ORDER: PartKey[] = ['year', 'month', 'day', 'hour', 'minute', 'second'];
const PART_LABELS: Record<PartKey, string> = {
  year: 'Jaar',
  month: 'Maand',
  day: 'Dag',
  hour: 'Uur',
  minute: 'Minuut',
  second: 'Seconde',
};

export type DateDraft = Record<PartKey, string>;

export function draftFromMoment(at: number | null, precision: Precision | null, scale: Scale): DateDraft {
  const empty: DateDraft = { year: '', month: '', day: '', hour: '', minute: '', second: '' };
  if (at === null) return empty;
  const parts = secondsToParts(at);
  const depth = ORDER.indexOf(precision ?? scale);
  const out = { ...empty };
  ORDER.forEach((key, index) => {
    if (index <= depth) out[key] = String(parts[key]);
  });
  return out;
}

/**
 * §35: the head of a draft, as the anchor has it. Whatever the boxes were
 * filled from — a double-click, an artikel's infobox, an empty form — the
 * year, month and day of an anchored tijdlijn are the tijdlijn's own.
 */
export function withAnchor(draft: DateDraft, anchor: { at: number; unit: AnchorUnit } | null, scale: Scale): DateDraft {
  if (!anchor) return draft;
  const head = draftFromMoment(anchor.at, anchor.unit, scale);
  const depth = ORDER.indexOf(anchor.unit);
  const out = { ...draft };
  ORDER.forEach((key, index) => {
    if (index <= depth) out[key] = head[key];
  });
  return out;
}

/**
 * What a draft says: the moment, and how much of it was filled in. The boxes
 * are read from the year down and stop at the first empty one — "1931, March,
 * no day" is March 1931, and a day typed without a month is not a day.
 */
export function readDraft(draft: DateDraft, scale: Scale): { at: number; precision: Precision } | null {
  const year = Number(draft.year);
  if (!draft.year.trim() || !Number.isFinite(year)) return null;
  const parts: Partial<TimeParts> = { year: Math.trunc(year) };
  let precision: Precision = 'year';
  const depth = ORDER.indexOf(scale);
  for (let i = 1; i <= depth; i++) {
    const key = ORDER[i];
    const raw = draft[key].trim();
    if (!raw) break;
    const value = Number(raw);
    if (!Number.isFinite(value)) break;
    parts[key] = Math.trunc(value);
    precision = key;
  }
  return { at: partsToSeconds(parts), precision };
}

/**
 * The boxes a tijdlijn of this scale asks for: the year, down to the scale.
 *
 * §35: on an anchored tijdlijn the head of the date is not asked for at all —
 * "3 oktober 1931" is printed as a fact and only the boxes finer than the
 * anchor are open. The draft still *holds* those parts (they are seeded from
 * the anchor), so `readDraft` reads exactly what it always read.
 */
export function DateFields({
  draft,
  onChange,
  scale,
  idPrefix,
  autoFocus,
  anchor,
}: {
  draft: DateDraft;
  onChange: (next: DateDraft) => void;
  scale: Scale;
  idPrefix: string;
  autoFocus?: boolean;
  anchor?: { at: number; unit: AnchorUnit } | null;
}) {
  const depth = ORDER.indexOf(scale);
  const fixed = anchor ? ORDER.indexOf(anchor.unit) : -1;
  const shown = ORDER.slice(fixed + 1, depth + 1);
  const read = readDraft(draft, scale);
  return (
    <div>
      {anchor && (
        <p className="timeline-date-fixed" data-testid="timeline-anchor-fixed">
          {formatWhen(anchor.at, anchor.unit)}
        </p>
      )}
      <div className="timeline-date-fields">
        {shown.map((key, index) => (
          <label key={key} className="timeline-date-field">
            <span className="tiny muted">{PART_LABELS[key]}</span>
            <input
              id={`${idPrefix}-${key}`}
              className="input"
              inputMode="numeric"
              autoFocus={autoFocus && index === 0}
              placeholder={key === 'year' ? '1931' : key === 'month' ? '3' : key === 'day' ? '12' : '0'}
              value={draft[key]}
              onChange={(event) => onChange({ ...draft, [key]: event.target.value.replace(/[^\d-]/g, '') })}
              style={{ width: key === 'year' ? '5.5em' : '3.6em' }}
            />
          </label>
        ))}
      </div>
      <p className="tiny muted" style={{ margin: '0.3rem 0 0' }}>
        {read
          ? `Dit wordt: ${formatWhen(read.at, read.precision)}`
          : anchor
            ? 'De dag staat vast; vul in wat je van het tijdstip weet.'
            : 'Het jaar is genoeg; wat je verder weet vul je in.'}
      </p>
    </div>
  );
}

/* ------------------------------------------------------ a new gebeurtenis */

type Suggestion = {
  id: string;
  name: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
};

export type NewEventInput =
  | { kind: 'entry'; entryId: string; at: number; precision: Precision; text: string }
  | { kind: 'note'; name: string; at: number; precision: Precision; text: string };

/**
 * "Wat, en wanneer?" — the landkaart's "Wat komt hier?" box, followed by the
 * date. An existing artikel, a new one with this name, or a note that exists
 * only here. Picking an artikel with a date in its infobox fills the boxes in.
 */
export function NewEventSheet({
  timeline,
  busy,
  initialAt,
  preselected,
  onSubmit,
}: {
  timeline: TimelineSummary;
  busy: boolean;
  /** A moment already chosen — a double-click on the axis. */
  initialAt: number | null;
  /** An artikel carried here from its own page ("Zet op …"). */
  preselected: { entryId: string; name: string } | null;
  onSubmit: (input: NewEventInput) => Promise<boolean>;
}) {
  const ui = useUi();
  const words = ui.words;
  /*
   * §18b: a gebeurtenis carries the name of whoever put it there ("gezet door
   * …"), so there has to be a name. The tijdlijn behind this sheet already
   * refuses to open it without one; this is the second lock on the same door.
   */
  const mayType = useMayType();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [chosen, setChosen] = useState<{ kind: 'entry'; id: string; name: string } | { kind: 'note'; name: string } | null>(
    preselected ? { kind: 'entry', id: preselected.entryId, name: preselected.name } : null,
  );
  /*
   * §35: the anchor of the tijdlijn, if it has one. A new gebeurtenis starts
   * on its day — the boxes for the year, the month and the day are filled in
   * and not shown — so a tijdlijn of 3 October 1931 only ever asks the time.
   */
  const anchor = timeline.anchorAt !== null && timeline.anchorUnit !== null
    ? { at: timeline.anchorAt, unit: timeline.anchorUnit }
    : null;
  const [draft, setDraft] = useState<DateDraft>(() =>
    withAnchor(draftFromMoment(initialAt, null, timeline.scale), anchor, timeline.scale),
  );
  /*
   * A moment that was chosen on the axis is shown as a line of print with a
   * "Wijzig" behind it: placing a gebeurtenis by double-clicking is one click
   * and no form, and the form is there for when the click was not quite right.
   */
  const [askDate, setAskDate] = useState(initialAt === null);
  const [text, setText] = useState('');
  const typed = query.trim();

  useEffect(() => {
    if (!typed || chosen) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        // §31: the tijdlijn's own dossier goes first in the list.
        const cases = timeline.caseId ? `&cases=${encodeURIComponent(timeline.caseId)}` : '';
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(typed)}&limit=8${cases}`, { signal: controller.signal });
        if (!response.ok) return;
        const data = (await response.json()) as { entries: Suggestion[] };
        setItems(data.entries ?? []);
      } catch {
        /* aborted, or offline: the list just stays as it was */
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typed, chosen, timeline.caseId]);

  // An artikel with a date in its infobox: read it into the boxes, once,
  // unless a moment was already chosen on the axis.
  async function pickEntry(entry: { id: string; name: string }) {
    setChosen({ kind: 'entry', id: entry.id, name: entry.name });
    if (initialAt !== null) return;
    try {
      const response = await fetch(`/api/entries/${entry.id}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { fields?: Record<string, unknown> };
      const fields = data.fields ?? {};
      const candidates = [fields.date, ...Object.values(fields)].filter((v): v is string => typeof v === 'string' && v.trim() !== '');
      for (const candidate of candidates) {
        const parsed = parseDutchDate(candidate);
        if (parsed) {
          // §35: on an anchored tijdlijn even a date out of the infobox is
          // read onto this tijdlijn's own day; only its time survives.
          const at = anchor ? applyAnchor(parsed.at, anchor.at, anchor.unit) : parsed.at;
          setDraft(withAnchor(draftFromMoment(at, parsed.precision, timeline.scale), anchor, timeline.scale));
          return;
        }
      }
    } catch {
      /* no date, then */
    }
  }

  const when = readDraft(draft, timeline.scale);
  const ready = Boolean(chosen && when && !busy);

  async function submit() {
    if (!chosen || !when) return;
    const ok = await onSubmit(
      chosen.kind === 'entry'
        ? { kind: 'entry', entryId: chosen.id, at: when.at, precision: when.precision, text }
        : { kind: 'note', name: chosen.name, at: when.at, precision: when.precision, text },
    );
    if (!ok) return;
  }

  return (
    <div className="stack">
      <h2 id="new-event-title" style={{ margin: 0 }}>
        {cap(words.event)} op {timeline.name}
      </h2>

      {chosen ? (
        <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
          <Icon name={chosen.kind === 'entry' ? 'file' : 'note'} size={16} style={{ color: chosen.kind === 'entry' ? 'var(--ink)' : NOTE_COLOUR }} />
          <strong style={{ flex: 1, minWidth: 0 }} data-testid="new-event-chosen">
            {chosen.name}
          </strong>
          {!preselected && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setChosen(null)}>
              Anders
            </button>
          )}
        </div>
      ) : (
        <div>
          <label className="visually-hidden" htmlFor="new-event-query">
            Zoek een {words.entry}, of typ een naam voor een losse {words.event}
          </label>
          <input
            id="new-event-query"
            className="input"
            value={query}
            placeholder={`Zoek een ${words.entry}, of typ een naam…`}
            autoFocus
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !typed || busy) return;
              event.preventDefault();
              if (items[0]) void pickEntry(items[0]);
              else setChosen({ kind: 'note', name: typed });
            }}
          />
          <p className="tiny muted" style={{ margin: '0.3rem 0 0' }}>
            Een bestaand {words.entry} uit de lijst, een nieuw {words.entry} met deze naam, of een losse {words.event} die
            alleen op deze {words.timeline} bestaat.
          </p>
          {typed && (
            <ul className="suggest-list pin-choices" aria-label="Wat hier kan komen">
              {items.map((entry) => (
                <li key={entry.id}>
                  <button type="button" className="suggest-item" disabled={busy} onClick={() => void pickEntry(entry)}>
                    <Icon name={entry.typeIcon} size={15} style={{ color: entry.typeColour }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{entry.name}</strong>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {entry.typeLabel}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              <li>
                <button type="button" className="suggest-item" disabled={busy} onClick={() => setChosen({ kind: 'note', name: typed })}>
                  <Icon name="note" size={15} style={{ color: NOTE_COLOUR }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>
                      Losse {words.event} &lsquo;{typed}&rsquo;
                    </strong>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      Bestaat alleen op deze {words.timeline}; later alsnog een {words.entry} van te maken.
                    </span>
                  </span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="suggest-item"
                  disabled={busy}
                  onClick={() =>
                    ui.openNewEntry({
                      name: typed,
                      typeSlug: 'event',
                      caseId: timeline.caseId ?? undefined,
                      onCreated: (entry) => void pickEntry({ id: entry.id, name: entry.name }),
                    })
                  }
                >
                  <Icon name="plus" size={15} style={{ color: 'var(--stamp-red)' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>&lsquo;{typed}&rsquo; als nieuw {words.entry} aanmaken</strong>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      Het {words.entry} komt in de wiki én op deze {words.timeline}.
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          )}
        </div>
      )}

      {chosen && (
        <>
          <div>
            <p className="label" style={{ margin: '0 0 0.3rem' }}>
              Wanneer
            </p>
            {askDate ? (
              <DateFields
                draft={draft}
                onChange={(next) => setDraft(withAnchor(next, anchor, timeline.scale))}
                scale={timeline.scale}
                idPrefix="new-event"
                autoFocus={initialAt === null}
                anchor={anchor}
              />
            ) : (
              <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
                <strong data-testid="new-event-when">{when ? formatWhen(when.at, when.precision) : ''}</strong>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setAskDate(true)}>
                  Wijzig
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="label" htmlFor="new-event-text">
              Wat de {words.timeline} erover zegt
            </label>
            <textarea
              id="new-event-text"
              className="input"
              rows={3}
              value={text}
              placeholder={chosen.kind === 'entry' ? `Kort, voor op de ${words.timeline}; het ${words.entry} zelf blijft wat het is.` : 'Optioneel.'}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <p style={{ margin: 0 }}>
            <button type="button" className="btn btn-primary" disabled={!ready || !mayType} onClick={() => void submit()} data-testid="new-event-submit">
              <Icon name="plus" size={15} />
              Op de {words.timeline} zetten
            </button>
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------- an existing gebeurtenis */

export type EventPatchInput = {
  at?: number;
  precision?: Precision;
  name?: string;
  text?: string;
  assetId?: string | null;
  showImage?: boolean;
};

/**
 * One gebeurtenis, opened for editing. The name (of a note) and the text are
 * shared fields (§21): the sheet joins the gebeurtenis's room, and what is
 * typed is saved by the room and seen by everyone with the sheet open. The
 * moment and the picture are saved with a button, as a speld's place is.
 */
export function EditEventSheet({
  timeline,
  event,
  busy,
  liveUser,
  setBy,
  onSave,
  onRemove,
  onConvert,
}: {
  timeline: TimelineSummary;
  event: TimelineEvent;
  busy: boolean;
  liveUser: LiveUser;
  setBy: string | null;
  onSave: (patch: EventPatchInput) => Promise<boolean>;
  onRemove: () => void;
  onConvert: (seed: { name: string; text: string }) => void;
}) {
  return (
    <LiveFields room={eventFieldsRoomKey(event.id)} state="" user={liveUser} canEdit>
      <EditEventBody
        timeline={timeline}
        event={event}
        busy={busy}
        setBy={setBy}
        onSave={onSave}
        onRemove={onRemove}
        onConvert={onConvert}
      />
    </LiveFields>
  );
}

function EditEventBody({
  timeline,
  event,
  busy,
  setBy,
  onSave,
  onRemove,
  onConvert,
}: {
  timeline: TimelineSummary;
  event: TimelineEvent;
  busy: boolean;
  setBy: string | null;
  onSave: (patch: EventPatchInput) => Promise<boolean>;
  onRemove: () => void;
  onConvert: (seed: { name: string; text: string }) => void;
}) {
  const ui = useUi();
  const words = ui.words;
  /* §18b: same lock as the new-gebeurtenis sheet, on the same door. */
  const mayType = useMayType();
  const room = useLiveFields();
  const shared = Boolean(room?.canEdit);
  const [name, setName] = useState(event.name);
  const [text, setText] = useState(event.text);
  const anchor =
    timeline.anchorAt !== null && timeline.anchorUnit !== null
      ? { at: timeline.anchorAt, unit: timeline.anchorUnit }
      : null;
  const [draft, setDraft] = useState<DateDraft>(() =>
    withAnchor(draftFromMoment(event.at, event.precision, timeline.scale), anchor, timeline.scale),
  );
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirtyWords = !shared && (name !== event.name || text !== event.text);
  const when = readDraft(draft, timeline.scale);
  const dateChanged = Boolean(when && (when.at !== event.at || when.precision !== event.precision));

  const image = event.kind === 'entry' ? (event.entry?.coverAssetId ?? null) : event.assetId;
  const colour = event.kind === 'entry' ? (event.entry?.typeColour ?? 'var(--ink-muted)') : NOTE_COLOUR;
  const icon = event.kind === 'entry' ? (event.entry?.typeIcon ?? 'file') : 'note';

  // §30: a picture arrives by one road — the file dialog and the clipboard
  // both end at the same upload.
  async function upload(file: File) {
    setUploading(true);
    try {
      // Too heavy is not a refusal: the picture is made to fit first.
      const fitted = await fitUpload(file, ui.uploadLimit);
      if ('error' in fitted) {
        ui.toast(fitted.error);
        return;
      }
      if (fitted.shrunk) ui.toast(SHRUNK_NOTICE);
      const form = new FormData();
      form.append('file', fitted.file);
      const result = await uploadForm<{ asset: { id: string } }>('/api/assets', form);
      if (!result.ok) {
        ui.toast(result.error);
        return;
      }
      await onSave({ assetId: result.data.asset.id, showImage: true });
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (event.kind !== 'note') return;
    const onPaste = (pasteEvent: ClipboardEvent) => {
      const file = imageFromClipboard(pasteEvent);
      if (!file) return;
      pasteEvent.preventDefault();
      void upload(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.kind, event.id]);

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="map-pin-head map-pin-head-static" style={{ ['--pin-colour' as string]: colour }}>
          <Icon name={icon} size={14} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="event-title" style={{ margin: 0 }}>
            {event.name}
          </h2>
          <p className="tiny muted" style={{ margin: '0.2rem 0 0' }}>
            {event.kind === 'note' ? `Losse ${words.event} op de ${words.timeline}` : event.entry?.typeLabel}
            {setBy && <> · gezet door {setBy}</>}
          </p>
        </div>
      </div>

      {event.kind === 'entry' && event.entry && (
        <p style={{ margin: 0 }}>
          <Link className="btn btn-small btn-primary" href={`/e/${event.entry.slug}`}>
            <Icon name="file" size={14} />
            Lees verder
          </Link>
        </p>
      )}

      {event.kind === 'note' && (
        <div>
          <label className="label" htmlFor="event-name">
            Naam
          </label>
          <LiveField field="name" id="event-name" className="input" value={name} onValue={(next) => setName(next)} />
        </div>
      )}

      <div>
        <label className="label" htmlFor="event-text">
          Wat de {words.timeline} erover zegt
        </label>
        <LiveField as="textarea" field="text" id="event-text" className="input" rows={4} value={text} onValue={(next) => setText(next)} />
        {shared ? (
          <p className="tiny muted" style={{ margin: '0.3rem 0 0' }}>
            Wat je hier typt wordt meteen bewaard en ziet iedereen op deze {words.timeline}.
            {event.kind === 'entry' && <> Het {words.entry} zelf verandert er niet van.</>}
          </p>
        ) : null}
        {dirtyWords && (
          <p style={{ margin: '0.4rem 0 0' }}>
            <button
              type="button"
              className="btn btn-small btn-primary"
              disabled={busy || !mayType || (event.kind === 'note' && !name.trim())}
              onClick={() => void onSave(event.kind === 'note' ? { name, text } : { text })}
            >
              Opslaan
            </button>
          </p>
        )}
      </div>

      <div>
        <p className="label" style={{ margin: '0 0 0.3rem' }}>
          Wanneer
        </p>
        <DateFields
          draft={draft}
          onChange={(next) => setDraft(withAnchor(next, anchor, timeline.scale))}
          scale={timeline.scale}
          idPrefix="event"
          anchor={anchor}
        />
        {dateChanged && when && (
          <p style={{ margin: '0.4rem 0 0' }}>
            <button
              type="button"
              className="btn btn-small btn-primary"
              disabled={busy || !mayType}
              onClick={() => void onSave({ at: when.at, precision: when.precision })}
              data-testid="event-date-save"
            >
              Moment opslaan
            </button>
          </p>
        )}
      </div>

      <div>
        <p className="label" style={{ margin: '0 0 0.3rem' }}>
          Afbeelding
        </p>
        <div className="row-wrap" style={{ gap: '0.4rem', alignItems: 'center' }}>
          {image ? (
            /* A 56 px square told you an afbeelding existed and nothing about
               which one — and it was square, so a screenshot arrived cropped
               to its middle. This keeps the picture's own shape inside a
               postcard-sized box, which is enough to recognise it by. */
            // eslint-disable-next-line @next/next/no-img-element
            <img className="event-picture-preview" src={assetUrl(image, 'card')} alt="" />
          ) : (
            <span className="tiny muted">
              {event.kind === 'entry' ? `Het ${words.entry} heeft nog geen afbeelding.` : 'Nog geen afbeelding.'}
            </span>
          )}
          <button
            type="button"
            className="btn btn-small"
            disabled={busy}
            onClick={() => void onSave({ showImage: !event.showImage })}
            title={image ? undefined : 'Zonder afbeelding toont het kader het icoon van de soort'}
          >
            <Icon name={event.showImage ? 'eyeOff' : 'camera'} size={14} />
            {event.showImage ? 'Afbeelding verbergen' : image ? 'Afbeelding tonen' : 'Sjabloonafbeelding tonen'}
          </button>
          {event.kind === 'note' && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(changeEvent) => {
                  const file = changeEvent.target.files?.[0];
                  changeEvent.target.value = '';
                  if (file) void upload(file);
                }}
              />
              <button type="button" className="btn btn-small" disabled={busy || uploading} onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={14} />
                {uploading ? 'Bezig…' : image ? 'Andere afbeelding' : 'Afbeelding kiezen'}
              </button>
              {image && (
                <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void onSave({ assetId: null })}>
                  <Icon name="close" size={14} />
                  Afbeelding weghalen
                </button>
              )}
            </>
          )}
        </div>
        {event.kind === 'note' && (
          <p className="tiny muted" style={{ margin: '0.3rem 0 0' }}>
            Plakken kan ook: een schermafbeelding op het klembord komt hier terecht.
          </p>
        )}
      </div>

      <div className="row-wrap" style={{ marginTop: '0.2rem' }}>
        {event.kind === 'note' && (
          <button type="button" className="btn btn-small btn-primary" disabled={busy || !mayType} onClick={() => onConvert({ name, text })}>
            <Icon name="plus" size={14} />
            Maak er een {words.entry} van
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={onRemove}>
          <Icon name="trash" size={14} />
          Van de {words.timeline} halen
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ settings */

export function TimelineSettingsSheet({
  timeline,
  busy,
  canManage,
  isKeeper,
  viewerId,
  access,
  onSave,
  onDelete,
}: {
  timeline: TimelineSummary;
  busy: boolean;
  canManage: boolean;
  isKeeper: boolean;
  viewerId: string;
  access: AccessSettings;
  onSave: (patch: {
    name?: string;
    description?: string;
    scale?: Scale;
    anchorAt?: number | null;
    anchorUnit?: AnchorUnit | null;
  }) => Promise<boolean>;
  onDelete: () => void;
}) {
  const ui = useUi();
  const words = ui.words;
  /* §18b: renaming a tijdlijn is a write like any other. */
  const mayType = useMayType();
  const [name, setName] = useState(timeline.name);
  const [description, setDescription] = useState(timeline.description);
  const [scale, setScale] = useState<Scale>(timeline.scale);
  const scaleChanged = scale !== timeline.scale;
  const current = useMemo(() => SCALE_LABELS[timeline.scale], [timeline.scale]);

  /*
   * §35: "Deze tijdlijn speelt op…". Only a tijdlijn measured finer than a day
   * is ever *of* a day — a tijdlijn of days that is one day has nothing left
   * to show — so the block appears with the measure the sheet is about to
   * save, not the one on the row.
   */
  const anchorUnits = anchorUnitsFor(scale);
  const [anchorUnit, setAnchorUnit] = useState<AnchorUnit | ''>(timeline.anchorUnit ?? '');
  const [anchorDraft, setAnchorDraft] = useState<DateDraft>(() =>
    draftFromMoment(timeline.anchorAt, timeline.anchorUnit, timeline.anchorUnit ?? 'day'),
  );
  const anchorWhen = anchorUnit ? readDraft(anchorDraft, anchorUnit) : null;
  const anchorOffered = anchorUnits.length > 0;
  const anchorReady = !anchorUnit || Boolean(anchorWhen);
  const anchorChanged =
    anchorOffered && ((timeline.anchorUnit ?? '') !== anchorUnit || (anchorWhen ? anchorWhen.at : null) !== timeline.anchorAt);

  const dirty =
    name.trim() !== timeline.name ||
    description.trim() !== timeline.description ||
    scaleChanged ||
    anchorChanged ||
    // Taking the measure back to days or coarser takes an anchor away with it.
    (!anchorOffered && timeline.anchorUnit !== null);

  return (
    <div className="stack">
      <h2 id="timeline-settings-title" style={{ margin: 0 }}>
        Instellingen van deze {words.timeline}
      </h2>
      <div>
        <label className="label" htmlFor="timeline-name">
          Naam
        </label>
        <input id="timeline-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="timeline-description">
          Korte beschrijving
        </label>
        <textarea
          id="timeline-description"
          className="input"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <fieldset className="timeline-scale-picker">
        <legend className="label">Gemeten in</legend>
        {SCALES.map((option) => (
          <label key={option} className={`timeline-scale-option${scale === option ? ' timeline-scale-option-on' : ''}`}>
            {/* The name is the measure, the sentence its description — the
                same reasoning as the new-tijdlijn sheet, where "Tot op het
                uur. Eén dag, één nacht." would otherwise make the Uren radio
                answer to "Eén dag" as loudly as the anchor's own does. */}
            <input
              type="radio"
              name="timeline-scale"
              value={option}
              checked={scale === option}
              onChange={() => setScale(option)}
              aria-label={SCALE_LABELS[option]}
              aria-describedby={`timeline-scale-${option}-hint`}
            />
            <span>
              <strong>{SCALE_LABELS[option]}</strong>
              <span className="tiny muted" id={`timeline-scale-${option}-hint`} style={{ display: 'block' }}>
                {SCALE_HINTS[option]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {scaleChanged && (
        <p className="tiny muted" style={{ margin: 0 }}>
          Nu: {current.toLowerCase()}. Een grovere maat toont van elke {words.event} alleen wat in die maat past; wat fijner
          was ingevuld blijft bewaard en komt terug als je de maat weer fijner zet.
        </p>
      )}

      {anchorOffered && (
        <fieldset className="timeline-anchor-picker" data-testid="timeline-anchor">
          <legend className="label">Deze {words.timeline} speelt op…</legend>
          <div className="row-wrap" style={{ gap: '0.3rem' }}>
            <label className={`timeline-scale-option${anchorUnit === '' ? ' timeline-scale-option-on' : ''}`}>
              <input
                type="radio"
                name="timeline-anchor-unit"
                value=""
                checked={anchorUnit === ''}
                onChange={() => setAnchorUnit('')}
              />
              <span>
                <strong>Geen vast moment</strong>
              </span>
            </label>
            {anchorUnits.map((unit) => (
              <label key={unit} className={`timeline-scale-option${anchorUnit === unit ? ' timeline-scale-option-on' : ''}`}>
                <input
                  type="radio"
                  name="timeline-anchor-unit"
                  value={unit}
                  checked={anchorUnit === unit}
                  onChange={() => setAnchorUnit(unit)}
                />
                <span>
                  <strong>{ANCHOR_UNIT_LABELS[unit]}</strong>
                </span>
              </label>
            ))}
          </div>
          {anchorUnit && (
            <div style={{ marginTop: '0.4rem' }}>
              <DateFields draft={anchorDraft} onChange={setAnchorDraft} scale={anchorUnit} idPrefix="timeline-anchor" />
            </div>
          )}
          <p className="tiny muted" style={{ margin: '0.3rem 0 0' }}>
            {anchorUnit
              ? `Elke nieuwe ${words.event} begint op dit moment, en de as komt er niet meer vanaf.`
              : `Geef een dag op en elke nieuwe ${words.event} vraagt alleen nog het tijdstip.`}
          </p>
        </fieldset>
      )}

      <p style={{ margin: 0 }}>
        <button
          type="button"
          className="btn btn-primary btn-small"
          disabled={!dirty || busy || !mayType || !name.trim() || !anchorReady}
          onClick={() =>
            void onSave({
              name: name.trim(),
              description: description.trim(),
              scale,
              // Both together, or both null — the two columns are one fact.
              anchorAt: anchorOffered && anchorUnit && anchorWhen ? anchorWhen.at : null,
              anchorUnit: anchorOffered && anchorUnit && anchorWhen ? anchorUnit : null,
            })
          }
          data-testid="timeline-settings-save"
        >
          Opslaan
        </button>
      </p>

      <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: '0.2rem 0' }} />
      <AccessEditor
        target="timeline"
        id={timeline.id}
        initial={access}
        canManage={canManage}
        isKeeper={isKeeper}
        viewerId={viewerId}
        nouns={{ this: `deze ${words.timeline}` }}
      />

      <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: '0.2rem 0' }} />
      <div className="row-wrap">
        <span className="tiny muted" style={{ flex: 1 }}>
          In de prullenbak kan de {words.keeper} hem terugzetten of voorgoed weghalen.
        </span>
        <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={onDelete}>
          <Icon name="trash" size={14} />
          {cap(words.timeline)} verwijderen
        </button>
      </div>
    </div>
  );
}
