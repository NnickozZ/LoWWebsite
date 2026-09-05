'use client';

import { useMemo } from 'react';
import { Icon } from '@/components/Icon';
import {
  ADDABLE_KINDS,
  BUILT_IN_KINDS,
  DERIVED_SORTS,
  defaultBlockTitle,
  type BlockKind,
  type PageBlock,
} from '@/lib/pageBlocks';
import type { FieldDef } from '@/lib/db/schema';
import type { Words } from '@/lib/words';

export type TypeLite = { slug: string; label: string; fields: FieldDef[] };

/**
 * §11's page builder, Keeper side.
 *
 * The five built-in blocks can be renamed, reordered and hidden but never
 * removed — `cleanBlocks` puts a missing one back anyway, and a page with no
 * body to type in is not a page. The two list blocks can be added freely.
 *
 * The interesting control is the one for a self-filling list: rather than
 * asking a Keeper to know that Personages store their faction under the key
 * `faction`, it offers every pointing field on the soorten they picked, by the
 * name those fields have on screen. "Leden = Personages, via Factie."
 */
export function PageBlocksEditor({
  blocks,
  onChange,
  types,
  words,
  idPrefix,
}: {
  blocks: PageBlock[];
  onChange: (next: PageBlock[]) => void;
  /** Every soort, so a derived list can offer their pointing fields by name. */
  types: TypeLite[];
  words: Words;
  idPrefix: string;
}) {
  const patch = (index: number, next: Partial<PageBlock>) =>
    onChange(blocks.map((block, i) => (i === index ? { ...block, ...next } : block)));

  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const add = (kind: BlockKind) => {
    const takenIds = new Set(blocks.map((block) => block.id));
    let id = `${kind}_${blocks.length + 1}`;
    while (takenIds.has(id)) id = `${id}x`;

    // A hand-filled list gets no key here on purpose: `cleanBlocks` assigns one
    // from the heading when it is first saved, so the key matches the words the
    // Keeper actually typed rather than a placeholder they never saw.
    const block: PageBlock =
      kind === 'links'
        ? { id, kind, title: '' }
        : { id, kind, title: '', viaField: '', sort: 'name' };

    // New lists land above the built-in tail, where they read as part of the
    // page rather than an afterthought under the history.
    const tail = blocks.findIndex((item) => item.kind === 'backlinks');
    const at = tail === -1 ? blocks.length : tail;
    onChange([...blocks.slice(0, at), block, ...blocks.slice(at)]);
  };

  return (
    <div>
      <span className="label">De pagina</span>
      <p className="tiny muted" style={{ margin: '0 0 0.5rem' }}>
        Wat er op een artikel van deze soort staat, van boven naar beneden. De vijf vaste blokken kun
        je hernoemen, verplaatsen en verbergen; lijsten mag je er zoveel bij zetten als je wilt.
      </p>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {blocks.map((block, index) => (
          <BlockRow
            key={block.id}
            block={block}
            index={index}
            total={blocks.length}
            types={types}
            words={words}
            idPrefix={idPrefix}
            onPatch={(next) => patch(index, next)}
            onMove={(by) => move(index, by)}
            onRemove={() => onChange(blocks.filter((_, i) => i !== index))}
          />
        ))}
      </ul>

      <div className="row-wrap" style={{ marginTop: '0.5rem' }}>
        {ADDABLE_KINDS.map((option) => (
          <button
            key={option.kind}
            type="button"
            className="btn btn-small"
            title={option.hint}
            onClick={() => add(option.kind)}
          >
            <Icon name="plus" size={15} />
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockRow({
  block,
  index,
  total,
  types,
  words,
  idPrefix,
  onPatch,
  onMove,
  onRemove,
}: {
  block: PageBlock;
  index: number;
  total: number;
  types: TypeLite[];
  words: Words;
  idPrefix: string;
  onPatch: (next: Partial<PageBlock>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const isBuiltIn = BUILT_IN_KINDS.includes(block.kind);
  const id = `${idPrefix}-${block.id}`;

  // Every field, on the soorten this list looks through, that points at another
  // fiche — offered by the name it has on screen rather than by its key.
  const pointingFields = useMemo(() => {
    const scope = block.fromType?.length
      ? types.filter((type) => block.fromType!.includes(type.slug))
      : types;
    const seen = new Map<string, string>();
    for (const type of scope) {
      for (const field of type.fields ?? []) {
        if (field.kind !== 'entry_link' && field.kind !== 'entry_links') continue;
        const existing = seen.get(field.key);
        seen.set(
          field.key,
          existing && existing !== `${type.label} → ${field.label}`
            ? `${field.label}`
            : `${type.label} → ${field.label}`,
        );
      }
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [block.fromType, types]);

  const missingVia = block.kind === 'derived' && !block.viaField;

  return (
    <li className={`admin-block${block.hidden ? ' admin-block-hidden' : ''}`}>
      <div className="row-wrap" style={{ alignItems: 'flex-start' }}>
        <span className="chip" title={BLOCK_WHAT[block.kind]}>
          <Icon name={BLOCK_ICON[block.kind]} size={13} />
          {BLOCK_NAME[block.kind]}
        </span>

        <span style={{ flex: '1 1 11rem', minWidth: 0 }}>
          <label className="visually-hidden" htmlFor={`${id}-title`}>
            Kop van blok {index + 1}
          </label>
          <input
            id={`${id}-title`}
            className="input"
            value={block.title ?? ''}
            placeholder={defaultBlockTitle(block.kind, words) || 'Kop (niet verplicht)'}
            onChange={(event) => onPatch({ title: event.target.value })}
          />
        </span>

        <button
          type="button"
          className="btn btn-small btn-ghost"
          aria-label={`Blok ${index + 1} omhoog`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          aria-label={`Blok ${index + 1} omlaag`}
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </button>

        {isBuiltIn ? (
          <button
            type="button"
            className={`chip chip-selectable${block.hidden ? '' : ' chip-active'}`}
            aria-pressed={!block.hidden}
            title={block.hidden ? 'Dit blok staat uit' : 'Dit blok staat aan'}
            onClick={() => onPatch({ hidden: !block.hidden })}
          >
            <Icon name={block.hidden ? 'lock' : 'eye'} size={13} />
            {block.hidden ? 'Verborgen' : 'Zichtbaar'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-small btn-ghost"
            aria-label={`Blok ${index + 1} verwijderen`}
            onClick={onRemove}
          >
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>

      {block.kind === 'derived' && (
        <div className="stack" style={{ gap: '0.4rem', marginTop: '0.45rem' }}>
          <div>
            <span className="tiny muted">Kijk in deze soorten (leeg = alle)</span>
            <div className="row-wrap" style={{ marginTop: '0.2rem' }}>
              {types.map((type) => {
                const on = block.fromType?.includes(type.slug) ?? false;
                return (
                  <button
                    key={type.slug}
                    type="button"
                    className={`chip chip-selectable${on ? ' chip-active' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      const current = block.fromType ?? [];
                      onPatch({
                        fromType: on
                          ? current.filter((slug) => slug !== type.slug)
                          : [...current, type.slug],
                      });
                    }}
                  >
                    {type.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="row-wrap">
            <span style={{ flex: '1 1 13rem' }}>
              <label className="tiny muted" htmlFor={`${id}-via`}>
                …en verzamel alles waarvan dit veld hiernaar wijst
              </label>
              <select
                id={`${id}-via`}
                className="select"
                value={block.viaField ?? ''}
                onChange={(event) => onPatch({ viaField: event.target.value })}
              >
                <option value="">— kies een veld —</option>
                {pointingFields.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
                {block.viaField &&
                  !pointingFields.some((field) => field.key === block.viaField) && (
                    <option value={block.viaField}>{block.viaField} (bestaat niet meer)</option>
                  )}
              </select>
            </span>
            <span style={{ flex: '0 1 11rem' }}>
              <label className="tiny muted" htmlFor={`${id}-sort`}>
                Volgorde
              </label>
              <select
                id={`${id}-sort`}
                className="select"
                value={block.sort ?? 'name'}
                onChange={(event) =>
                  onPatch({ sort: event.target.value === 'recent' ? 'recent' : 'name' })
                }
              >
                {DERIVED_SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </span>
          </div>

          {missingVia && (
            <p className="tiny" style={{ margin: 0, color: 'var(--stamp-red)' }}>
              Zonder veld weet deze lijst niet wat ze moet verzamelen — zo opgeslagen verdwijnt ze.
            </p>
          )}
          {!pointingFields.length && (
            <p className="tiny muted" style={{ margin: 0 }}>
              Deze soorten hebben nog geen veld dat naar een ander artikel wijst. Geef er eerst een
              koppelingsveld bij, dan verschijnt het hier.
            </p>
          )}
        </div>
      )}

      {block.kind === 'links' && (
        <div style={{ marginTop: '0.45rem' }}>
          <span className="tiny muted">Alleen deze soorten mogen erin (leeg = alles)</span>
          <div className="row-wrap" style={{ marginTop: '0.2rem' }}>
            {types.map((type) => {
              const on = block.ofType?.includes(type.slug) ?? false;
              return (
                <button
                  key={type.slug}
                  type="button"
                  className={`chip chip-selectable${on ? ' chip-active' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    const current = block.ofType ?? [];
                    onPatch({
                      ofType: on
                        ? current.filter((slug) => slug !== type.slug)
                        : [...current, type.slug],
                    });
                  }}
                >
                  {type.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(block.kind === 'derived' || block.kind === 'links') && (
        <div style={{ marginTop: '0.4rem' }}>
          <label className="visually-hidden" htmlFor={`${id}-note`}>
            Uitleg onder de kop
          </label>
          <input
            id={`${id}-note`}
            className="input"
            value={block.note ?? ''}
            placeholder="Regel uitleg onder de kop (niet verplicht)"
            onChange={(event) => onPatch({ note: event.target.value })}
          />
        </div>
      )}

      <label className="row tiny muted" style={{ marginTop: '0.4rem', gap: '0.35rem' }}>
        <input
          type="checkbox"
          checked={Boolean(block.open)}
          onChange={(event) => onPatch({ open: event.target.checked })}
        />
        Staat open zodra het artikel opengaat
      </label>
    </li>
  );
}

const BLOCK_NAME: Record<BlockKind, string> = {
  fields: 'Velden en tags',
  body: 'Tekst',
  sections: 'Secties',
  backlinks: 'Verwijzingen',
  history: 'Geschiedenis',
  links: 'Eigen lijst',
  derived: 'Lijst die zichzelf vult',
};

const BLOCK_WHAT: Record<BlockKind, string> = {
  fields: 'De velden van deze soort, met de tags eronder.',
  body: 'Het grote tekstvak.',
  sections: 'De blokken die je apart kunt onthullen.',
  backlinks: 'Alles wat naar dit artikel verwijst.',
  history: 'Eerdere versies van dit artikel.',
  links: 'Een lijst die je zelf vult.',
  derived: 'Een lijst die zichzelf vult uit een veld.',
};

const BLOCK_ICON: Record<BlockKind, string> = {
  fields: 'file',
  body: 'notebook',
  sections: 'eye',
  backlinks: 'folder',
  history: 'clock',
  links: 'pin',
  derived: 'magnifier',
};
