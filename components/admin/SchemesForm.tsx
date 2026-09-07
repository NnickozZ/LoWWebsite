'use client';

import { useActionState, useState } from 'react';
import { Icon } from '@/components/Icon';
import {
  DEFAULT_SCHEMES,
  MIN_CONTRAST,
  SCHEME_KEYS,
  SCHEME_LABELS,
  TOKENS,
  TOKEN_GROUPS,
  contrastRatio,
  isDefaultPalette,
  type Palette,
  type SchemeKey,
  type Schemes,
  type TokenDef,
} from '@/lib/theme/schemes';
import { saveSchemesAction, type AdminState } from '@/app/(app)/admin/actions';

/**
 * §45's Kleuren pane.
 *
 * Four palettes of nineteen colours, and the only hard part is that a Keeper
 * cannot see what they are doing: the page they are standing on is painted in
 * the palette they are *not* editing three times out of four. So every scheme
 * carries its own specimen — paper, inkt, liniaal, stempel and a link, drawn
 * from the state rather than from the cascade — and the specimen updates on
 * every turn of a picker, before anything is saved.
 *
 * The readability line under it is a warning and never a refusal. A Keeper who
 * wants pale grey on cream may have a reason; a Keeper who has made the whole
 * archive unreadable by accident should not find that out on a phone in a
 * tent. `contrastRatio` is WCAG's, and 4.5:1 is its floor for prose.
 *
 * Field names are `<schemeKey>.<tokenKey>`, which is what `schemesFromForm`
 * reads back. Everything is posted, defaults included — a palette is a whole,
 * and a Keeper who tuned three colours does not want the other sixteen moving
 * under them in a later round.
 */
export function SchemesForm({ schemes }: { schemes: Schemes }) {
  const [state, action, busy] = useActionState<AdminState, FormData>(saveSchemesAction, {});
  const [values, setValues] = useState<Schemes>(schemes);
  const [open, setOpen] = useState<SchemeKey>('playerLight');

  const set = (scheme: SchemeKey, token: TokenDef['key'], colour: string) =>
    setValues((current) => ({
      ...current,
      [scheme]: { ...current[scheme], [token]: colour },
    }));

  const reset = (scheme: SchemeKey) =>
    setValues((current) => ({ ...current, [scheme]: { ...DEFAULT_SCHEMES[scheme] } }));

  const changed = SCHEME_KEYS.filter((key) => !isDefaultPalette(key, values[key])).length;

  return (
    <form action={action} className="stack">
      <p className="small muted" style={{ maxWidth: '46rem' }}>
        Vier paletten: wat spelers zien bij daglicht en in het donker, en wat jij ziet op de
        pagina’s die alleen van jou zijn. Iedereen kiest zelf licht of donker onder{' '}
        <em>Jouw account</em>; welk van de twee paren dat wordt, kiest de pagina — jouw eigen
        pagina’s dragen jouw kleuren vanzelf.
      </p>

      {/*
        Tabs and not four open panels: nineteen pickers times four is a screen
        nobody reads, and the specimen is only honest when one palette has the
        attention. Every input stays in the form though — a hidden panel still
        posts, or switching tab before Opslaan would throw three palettes away.
      */}
      <div className="chip-strip" role="group" aria-label="Welk palet je bewerkt">
        {SCHEME_KEYS.map((key) => {
          const on = key === open;
          const own = isDefaultPalette(key, values[key]);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              className={`chip chip-selectable${on ? ' chip-active' : ''}`}
              onClick={() => setOpen(key)}
            >
              {SCHEME_LABELS[key]}
              {!own && <span className="muted">gewijzigd</span>}
            </button>
          );
        })}
      </div>

      {SCHEME_KEYS.map((key) => (
        <SchemePanel
          key={key}
          scheme={key}
          palette={values[key]}
          hidden={key !== open}
          onChange={set}
          onReset={reset}
        />
      ))}

      {state.error && <p className="error-note">{state.error}</p>}
      {state.ok && <p className="small muted">{state.ok}</p>}

      <div className="row-wrap" style={{ marginTop: '0.6rem' }}>
        <button className="btn btn-primary btn-small" type="submit" disabled={busy}>
          {busy ? 'Opslaan…' : 'Opslaan'}
        </button>
        <span className="tiny muted">
          {changed
            ? `${changed} van de vier ${changed === 1 ? 'paletten wijkt' : 'paletten wijken'} af van het archief.`
            : 'Alle vier de paletten staan op de kleuren van het archief.'}
        </span>
      </div>
    </form>
  );
}

function SchemePanel({
  scheme,
  palette,
  hidden,
  onChange,
  onReset,
}: {
  scheme: SchemeKey;
  palette: Palette;
  hidden: boolean;
  onChange: (scheme: SchemeKey, token: TokenDef['key'], colour: string) => void;
  onReset: (scheme: SchemeKey) => void;
}) {
  const ratio = contrastRatio(palette.ink, palette.paper);
  const readable = ratio >= MIN_CONTRAST;
  const own = isDefaultPalette(scheme, palette);

  return (
    <section hidden={hidden} aria-label={SCHEME_LABELS[scheme]} style={{ marginTop: '0.4rem' }}>
      <div className="row-wrap" style={{ marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, flex: '1 1 12rem' }}>{SCHEME_LABELS[scheme]}</h3>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          disabled={own}
          onClick={() => onReset(scheme)}
        >
          <Icon name="close" size={13} />
          Terug naar de kleuren van het archief
        </button>
      </div>

      {/*
        The specimen. Everything in it is an inline style off the state, so it
        owes nothing to the cascade — which is the point: three of these four
        palettes are not the one the page around it is painted in.
      */}
      <div
        style={{
          background: palette.paper,
          color: palette.ink,
          border: `1px solid ${palette.rule}`,
          borderRadius: 'var(--radius)',
          padding: '0.7rem 0.8rem',
          maxWidth: '30rem',
        }}
      >
        <p style={{ margin: '0 0 0.35rem', fontFamily: 'var(--serif)', fontSize: '1.05rem' }}>
          Het archief, in deze kleuren
        </p>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: palette.inkMuted }}>
          Een bijschrift, en een <span style={{ color: palette.link }}>verwijzing</span> ernaast.
        </p>
        <hr style={{ border: 0, borderTop: `1px solid ${palette.rule}`, margin: '0 0 0.5rem' }} />
        <div className="row-wrap" style={{ gap: '0.4rem' }}>
          <span
            style={{
              background: palette.stampRed,
              color: palette.paper,
              fontFamily: 'var(--stamp-face)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontSize: '0.7rem',
              padding: '0.15rem 0.45rem',
            }}
          >
            Stempel
          </span>
          <span
            style={{
              background: palette.cardFace,
              border: `1px solid ${palette.cardRule}`,
              fontSize: '0.75rem',
              padding: '0.15rem 0.45rem',
            }}
          >
            Kaart op kurk
          </span>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: '2.2rem',
              height: '1rem',
              background: palette.cork,
              border: `1px solid ${palette.cardRule}`,
            }}
          />
        </div>
      </div>

      <p className="tiny" style={{ margin: '0.4rem 0 0', color: readable ? 'var(--ink-muted)' : 'var(--stamp-red)' }}>
        {readable ? (
          <>Inkt op papier: {ratio.toFixed(1)}:1. Ruim leesbaar.</>
        ) : (
          <>
            <strong>Let op:</strong> inkt op papier haalt maar {ratio.toFixed(1)}:1. Onder{' '}
            {MIN_CONTRAST}:1 is gewone tekst voor veel mensen niet meer te lezen — vooral niet op
            een telefoon buiten. Je kunt het toch opslaan.
          </>
        )}
      </p>

      {TOKEN_GROUPS.map((group) => (
        <div key={group.group} style={{ marginTop: '0.9rem' }}>
          <h4 style={{ margin: '0 0 0.1rem' }}>{group.title}</h4>
          <p className="tiny muted" style={{ margin: '0 0 0.4rem' }}>
            {group.note}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {TOKENS.filter((token) => token.group === group.group).map((token) => {
              const id = `scheme-${scheme}-${token.key}`;
              const value = palette[token.key];
              const isOwn = value === DEFAULT_SCHEMES[scheme][token.key];
              return (
                <li key={token.key} className="admin-word-row">
                  <label className="label" htmlFor={id} style={{ flex: '1 1 16rem', minWidth: 0 }}>
                    {token.what}
                  </label>
                  <input
                    id={id}
                    className="input"
                    type="color"
                    name={`${scheme}.${token.key}`}
                    value={value}
                    onChange={(event) => onChange(scheme, token.key, event.target.value)}
                    style={{ width: 72, padding: '0.2rem', flex: '0 0 auto' }}
                  />
                  <code className="tiny muted" style={{ flex: '0 0 5.5rem' }}>
                    {value}
                  </code>
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    aria-label={`${token.what} terug op ${DEFAULT_SCHEMES[scheme][token.key]}`}
                    title={`Terug op ${DEFAULT_SCHEMES[scheme][token.key]}`}
                    disabled={isOwn}
                    style={{ visibility: isOwn ? 'hidden' : 'visible' }}
                    onClick={() => onChange(scheme, token.key, DEFAULT_SCHEMES[scheme][token.key])}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
