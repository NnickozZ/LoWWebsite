'use client';

import type { CSSProperties } from 'react';
import { assetUrl, coverClass, coverStyle } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import type { CoverCrops } from '@/lib/images/shapes';
import type { EntryGraphNode, GraphNode, LooseGraphNode } from '@/lib/families/types';

/**
 * §66 — one card in a stamboom.
 *
 * Five frames, and every one of them is HTML and CSS: the only picture on a
 * card is the artikel's own cover, so a tree of sixty people is sixty small
 * `<img>`s and no drawing at all. What the frame *is* comes from the soort
 * (`frameForType`, on the server) and is never decided here — this file only
 * knows how each of the five looks:
 *
 *   mortal   – the index card: a square portrait, the name in the serif, the
 *              achternaam small under it, the huis as a corner badge in its own
 *              colour, and a line of status.
 *   divine   – a round portrait with a double ring in gold, the name under it,
 *              and no status line: a god's condition is not a fact of that kind.
 *   house    – a wide banner with the sigil, for a Familie-artikel standing in
 *              the tree as the head of its branch.
 *   creature – the same card with a torn edge (`clip-path`) and a cover with
 *              the colour taken out of it.
 *   unknown  – a dashed card for a los kaartje: a name, a line or two, and
 *              nothing that pretends to be an artikel, because it is not one.
 *
 * A **ghost** is any of the five at reduced opacity with a `+` on it: somebody
 * an artikel in this tree names, who is not in the tree yet. Pressing the `+`
 * puts them in; nothing else about the archive changes.
 *
 * The name is always an `<a>` to the artikel and the body is always the drag
 * target, which is the one rule that keeps "open it" and "move it" from being
 * the same gesture.
 */

export type TreeNodeProps = {
  node: GraphNode;
  /** World coordinates of the card's top-left corner, and how big it is drawn. */
  box: { x: number; y: number; width: number; height: number };
  selected: boolean;
  /** True while this hand — or somebody else's — is carrying it. */
  dragging?: boolean;
  carried?: boolean;
  canEdit: boolean;
  /** Somebody else's hand has it: their colour, for the ring round it. */
  carriedColour?: string | null;
  onPointerDown?: (event: React.PointerEvent) => void;
  /**
   * §66: a click on the name of a card that is not already chosen *chooses* it
   * rather than walking to the artikel — on a canvas a click in the middle of a
   * thing selects it, and a link that fires on the first press takes the reader
   * off the page they were arranging. The canvas decides (it is the one that
   * knows what was selected *before* this press, and whether the press
   * travelled) and says so by calling `preventDefault`.
   */
  onNameClick?: (event: React.MouseEvent) => void;
  /** A ghost's `+`: put this artikel in the tree. */
  onAdopt?: () => void;
  /** A los kaartje's own small sheet. */
  onEdit?: () => void;
  words: { looseCard: string };
};

function isEntry(node: GraphNode): node is EntryGraphNode {
  return node.kind === 'entry';
}

/**
 * Whether the achternaam is worth printing under the name. "Jacob den
 * Hollander" with "den Hollander" under it is a card that says the same thing
 * twice; anything else is a surname the name does not already carry.
 */
export function showSurname(name: string, surname: string | null): surname is string {
  const trimmed = (surname ?? '').trim();
  if (!trimmed) return false;
  return !name.trim().toLowerCase().endsWith(trimmed.toLowerCase());
}

export function TreeNode({
  node,
  box,
  selected,
  dragging = false,
  carried = false,
  canEdit,
  carriedColour,
  onPointerDown,
  onNameClick,
  onAdopt,
  onEdit,
  words,
}: TreeNodeProps) {
  const ghost = node.standing === 'ghost';
  const entry = isEntry(node) ? node : null;
  const loose = node.kind === 'loose' ? (node as LooseGraphNode) : null;
  const house = entry?.house ?? null;

  /*
   * §66: a card is placed with `transform`, not with `left`/`top`, because the
   * layout is recomputed from the graph on every change and a person who gains
   * a partner slides across rather than teleporting — one CSS transition on
   * `transform` does the whole of it (and `prefers-reduced-motion` turns it
   * off, in the stylesheet). `left: 0; top: 0` lives in the class.
   */
  const style: CSSProperties = {
    transform: `translate(${box.x}px, ${box.y}px)`,
    width: box.width,
    height: box.height,
  };
  if (house?.colour) (style as Record<string, string>)['--house'] = house.colour;
  else if (entry?.colour) (style as Record<string, string>)['--house'] = entry.colour;
  if (carriedColour) (style as Record<string, string>)['--carried'] = carriedColour;

  const className = [
    'tree-node',
    `tree-frame-${node.frame}`,
    selected ? 'is-selected' : '',
    ghost ? 'is-ghost' : '',
    dragging ? 'is-dragging' : '',
    carried ? 'is-carried' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const cover = entry?.coverAssetId ?? null;
  const crops = (entry?.coverCrop ?? null) as CoverCrops | null;
  const icon = entry?.icon ?? 'person';

  const portrait = (shape: 'square' = 'square') =>
    cover ? (
      <span className={`tree-portrait ${coverClass(shape)}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetUrl(cover, 'thumb')} alt="" style={coverStyle(crops, shape)} draggable={false} />
      </span>
    ) : (
      <span className={`tree-portrait tree-portrait-empty ${coverClass(shape)}`} aria-hidden="true">
        <Icon name={icon} size={26} />
      </span>
    );

  /** The name: a way into the artikel, or plain text for a los kaartje. */
  const title = entry ? (
    /*
     * A real `<a>` with a real href — that is the only way the middle button
     * opens a second tab and the only way the context menu offers to. Its plain
     * left press is *not* a navigation on the first click, though: the press
     * belongs to the card (it selects, and it may start a drag), so it is not
     * `stopPropagation`ed any more, and `onNameClick` refuses the walk until
     * the card is the one already chosen. `draggable={false}` for the prikbord's
     * reason: the browser's own link-drag would snatch the pointer capture in
     * the first few pixels of carrying a card.
     */
    <a
      className="tree-node-name"
      href={`/e/${entry.slug}`}
      draggable={false}
      onClick={onNameClick}
    >
      {node.name}
    </a>
  ) : (
    <span className="tree-node-name">{node.name || `Naamloos ${words.looseCard}`}</span>
  );

  return (
    <div
      className={className}
      style={style}
      data-node-id={node.id}
      data-frame={node.frame}
      data-standing={node.standing}
      data-testid="tree-node"
      onPointerDown={onPointerDown}
    >
      {node.frame === 'house' ? (
        <div className="tree-node-body tree-house">
          <span className="tree-house-sigil" aria-hidden="true">
            <Icon name={entry?.icon ?? 'badge'} size={30} />
          </span>
          <span className="tree-house-words">
            {title}
            {entry?.typeLabel && <span className="tree-node-type tiny">{entry.typeLabel}</span>}
          </span>
        </div>
      ) : node.frame === 'divine' ? (
        <div className="tree-node-body tree-divine">
          <span className="tree-divine-ring">{portrait()}</span>
          {title}
          {entry?.typeLabel && <span className="tree-node-type tiny">{entry.typeLabel}</span>}
        </div>
      ) : node.frame === 'unknown' ? (
        <div className="tree-node-body tree-unknown">
          {title}
          {loose?.text && <span className="tree-node-text tiny">{loose.text}</span>}
          {canEdit && onEdit && (
            <button
              type="button"
              className="tree-node-edit"
              aria-label={`Dit ${words.looseCard} bewerken`}
              title="Bewerken"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onEdit}
            >
              <Icon name="edit" size={13} />
            </button>
          )}
        </div>
      ) : (
        /* mortal and creature are the same card; the frame's own CSS tears one of them. */
        <div className={`tree-node-body tree-index${node.frame === 'creature' ? ' tree-creature' : ''}`}>
          {portrait()}
          {title}
          {showSurname(node.name, entry?.surname ?? null) && (
            <span className="tree-node-surname tiny">{entry?.surname}</span>
          )}
          {entry?.status && <span className="tree-node-status tiny">{entry.status}</span>}
          {house && (
            <span className="tree-node-house" title={house.name}>
              {house.name}
            </span>
          )}
        </div>
      )}

      {/*
        §66: a ghost's way in. It is a real button and it is 28 px, because on a
        phone this is the only way somebody joins the tree — nothing essential
        here waits for a hover.
      */}
      {ghost && canEdit && onAdopt && (
        <button
          type="button"
          className="tree-adopt"
          data-testid="tree-adopt"
          title="Erbij"
          aria-label={`${node.name} erbij`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onAdopt}
        >
          <Icon name="plus" size={14} />
          <span className="tree-adopt-word">Erbij</span>
        </button>
      )}
    </div>
  );
}
