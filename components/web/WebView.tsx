'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useLiveChanges } from '@/components/live/LiveProvider';
import { useUi } from '@/components/ui/UiProvider';
import { useIsPhone } from '@/components/useIsPhone';
import { fuzzyScore } from '@/lib/search/fuzzy';
import { EDGE_GROUPS, EDGE_KIND_ORDER, EDGE_KINDS, NODE_KINDS } from '@/lib/web/kinds';
import { clampDepth, filterGraph, focusSlice } from '@/lib/web/slice';
import { WEB_DEPTH_MAX, WEB_DEPTH_MIN, type WebEdge, type WebEdgeKind, type WebGraph, type WebNode, type WebNodeId } from '@/lib/web/types';
import { WebCanvas, type WebCanvasHandle, type WebMode } from './WebCanvas';
import { PinSelectionButton } from './PinSelectionButton';

/**
 * §43: the page around the web.
 *
 * Fetches the whole visible graph once and slices it here, in the browser:
 * the depth stepper, the legend, the notes switch and a new focus are all
 * instant because nothing goes back to the server for them. `focusSlice` is
 * the same function the API runs, so what this page shows at depth 2 is what
 * `/api/web?focus=…&depth=2` would have said.
 *
 * Two scopes, two shapes: with a focus the web is *about* something and is
 * drawn in columns (or, on request, organically); without one it is the whole
 * archive and only the organic shape makes sense. On a phone the whole web
 * is a search box rather than a drawing — five hundred knots on six inches is
 * never legible — and the focus web is drawn with the panel as a sheet.
 *
 * The address carries the focus and the depth (`?focus=entry:…&d=2`) so a
 * web can be sent to somebody and comes back the same.
 */

const HIDDEN_KEY = 'web:hidden-kinds';
const NOTES_KEY = 'web:notes';
const LABELS_KEY = 'web:labels';
const IMAGES_KEY = 'web:images';
const HINT_KEY = 'web:hint-seen';

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a private window; the choice lasts the page */
  }
}

export function WebView({
  initialFocus,
  initialDepth,
}: {
  initialFocus: string | null;
  initialDepth: number;
}) {
  const ui = useUi();
  const words = ui.words;
  const phone = useIsPhone();
  const canvasRef = useRef<WebCanvasHandle>(null);

  const [full, setFull] = useState<WebGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocusState] = useState<WebNodeId | null>(initialFocus);
  /** The middelpunten before this one, newest last — this tab's own memory, never stored. */
  const [trail, setTrail] = useState<WebNodeId[]>([]);
  const [depth, setDepthState] = useState<number>(clampDepth(initialDepth));
  // The organic web first (Nick's choice after seeing both); Kolommen is one click away.
  const [mode, setMode] = useState<WebMode>('organic');
  const [hidden, setHidden] = useState<Set<WebEdgeKind>>(new Set());
  const [showNotes, setShowNotes] = useState(false);
  const [labelsAlways, setLabelsAlways] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [hint, setHint] = useState(false);
  const [selected, setSelected] = useState<Set<WebNodeId>>(() => new Set(initialFocus ? [initialFocus] : []));
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [legendOpen, setLegendOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);

  // Remembered choices — per browser, a convenience and nothing more.
  useEffect(() => {
    const kinds = readStored<string[]>(HIDDEN_KEY, []).filter((k): k is WebEdgeKind => k in EDGE_KINDS);
    if (kinds.length) setHidden(new Set(kinds));
    setShowNotes(readStored<boolean>(NOTES_KEY, false));
    setLabelsAlways(readStored<boolean>(LABELS_KEY, false));
    setShowImages(readStored<boolean>(IMAGES_KEY, false));
    setHint(!readStored<boolean>(HINT_KEY, false));
  }, []);

  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch('/api/web?notes=1')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Het web laden is niet gelukt.');
        return r.json() as Promise<WebGraph>;
      })
      .then((graph) => {
        if (!alive) return;
        setFull(graph);
        setError(null);
      })
      .catch((err: Error) => {
        if (alive && generation === 0) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [generation]);

  // §21: the archive moved — a card pinned, a dossier filled, a speld set — so
  // the web is spun again. Coalesced, because one save can move several keys.
  const respin = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (respin.current) clearTimeout(respin.current);
    },
    [],
  );
  useLiveChanges(['entries', 'cases', 'boards', 'maps', 'timelines'], () => {
    if (respin.current) return;
    respin.current = setTimeout(() => {
      respin.current = null;
      setGeneration((g) => g + 1);
    }, 1200);
  });

  // The address follows the focus and the depth.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (focus) params.set('focus', focus);
    else params.delete('focus');
    if (focus && depth !== 1) params.set('d', String(depth));
    else params.delete('d');
    const next = params.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ''}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', url);
  }, [focus, depth]);

  const nodeById = useMemo(() => new Map((full?.nodes ?? []).map((n) => [n.id, n] as const)), [full]);

  const focusNode = focus ? nodeById.get(focus) ?? null : null;
  const focusMissing = Boolean(full && focus && !focusNode);

  const graph = useMemo<WebGraph>(() => {
    if (!full) return { nodes: [], edges: [] };
    const options = { hiddenKinds: hidden, showNotes };
    if (focus && nodeById.has(focus)) return focusSlice(full, focus, depth, options);
    return filterGraph(full, options);
  }, [full, focus, depth, hidden, showNotes, nodeById]);

  const shownIds = useMemo(() => new Set(graph.nodes.map((n) => n.id)), [graph]);
  const effectiveMode: WebMode = focus ? mode : 'organic';

  const setFocus = useCallback((id: WebNodeId | null) => {
    setFocusState((current) => {
      if (current && current !== id) setTrail((t) => [...t.filter((x) => x !== current), current].slice(-5));
      return id;
    });
    setSelected(id ? new Set([id]) : new Set());
    setExpanded(new Set());
    setQuery('');
    setPanelOpen(Boolean(id));
  }, []);

  const setDepth = (d: number) => setDepthState(clampDepth(d));

  /** One step back along the trail: the previous middelpunt, without re-adding this one. */
  const goBack = () => {
    const previous = trail[trail.length - 1];
    if (!previous) return;
    setTrail((t) => t.slice(0, -1));
    setFocusState(previous);
    setSelected(new Set([previous]));
    setExpanded(new Set());
    setPanelOpen(true);
  };

  const toggleKind = (kind: WebEdgeKind) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      store(HIDDEN_KEY, [...next]);
      return next;
    });
  };
  const toggleGroup = (kinds: WebEdgeKind[], on: boolean) => {
    setHidden((current) => {
      const next = new Set(current);
      for (const k of kinds) {
        if (on) next.delete(k);
        else next.add(k);
      }
      store(HIDDEN_KEY, [...next]);
      return next;
    });
  };

  // Keep the selection to what is on screen — once there is a screen.
  useEffect(() => {
    if (!full) return;
    setSelected((current) => {
      const next = new Set([...current].filter((id) => shownIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [shownIds, full]);

  const onSelect = useCallback((ids: Set<WebNodeId>) => {
    setSelected(ids);
    if (ids.size) setPanelOpen(true);
  }, []);

  // Counts per kind, for the legend, over the *filtered-by-scope* graph
  // before the legend is applied — so a ticked-off kind still shows how many
  // lines it would bring back.
  const kindCounts = useMemo(() => {
    const counts = new Map<WebEdgeKind, number>();
    if (!full) return counts;
    const base = focus && nodeById.has(focus) ? focusSlice(full, focus, depth, { showNotes }) : filterGraph(full, { showNotes });
    for (const edge of base.edges) counts.set(edge.kind, (counts.get(edge.kind) ?? 0) + 1);
    return counts;
  }, [full, focus, depth, showNotes, nodeById]);

  const matches = useMemo(() => {
    const typed = query.trim();
    if (!full || !typed) return [];
    return full.nodes
      .filter((n) => n.kind !== 'note')
      .map((n) => ({ n, score: fuzzyScore(n.name, typed) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || b.n.degree - a.n.degree)
      .slice(0, 8)
      .map((r) => r.n);
  }, [full, query]);

  const selectedNodes = useMemo(() => [...selected].map((id) => nodeById.get(id)).filter((n): n is WebNode => Boolean(n)), [selected, nodeById]);
  const one = selectedNodes.length === 1 ? selectedNodes[0] : null;

  const filedIn = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const edge of full?.edges ?? []) {
      if (edge.kind !== 'filed') continue;
      (out.get(edge.to) ?? out.set(edge.to, new Set()).get(edge.to)!).add(edge.from);
    }
    return out;
  }, [full]);

  const fitKey = `${focus ?? 'all'}|${focus ? depth : ''}|${effectiveMode}|${full ? 'loaded' : 'empty'}`;

  /* --------------------------------------------------------------- pieces */

  const depthStepper = focus && (
    <div className="web-stepper" role="group" aria-label="Diepte">
      <button type="button" className="btn btn-small btn-ghost" onClick={() => setDepth(depth - 1)} disabled={depth <= WEB_DEPTH_MIN} aria-label="Minder diep">
        <Icon name="minus" size={14} />
      </button>
      <span className="web-stepper-value" data-testid="web-depth" title="Hoe veel stappen vanaf het midden">
        <Icon name="layers" size={14} /> {depth} <span className="web-stepper-word">{depth === 1 ? 'stap' : 'stappen'}</span>
      </span>
      <button type="button" className="btn btn-small btn-ghost" onClick={() => setDepth(depth + 1)} disabled={depth >= WEB_DEPTH_MAX} aria-label="Dieper">
        <Icon name="plus" size={14} />
      </button>
    </div>
  );

  const search = (
    <div className="web-search">
      <label className="visually-hidden" htmlFor="web-search">
        Zoek in het web
      </label>
      <input
        id="web-search"
        className="input"
        value={query}
        placeholder={focus ? 'Ander middelpunt…' : `Zoek een ${words.entry}, ${words.case}, ${words.map}…`}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) setFocus(matches[0].id);
          if (e.key === 'Escape') setQuery('');
        }}
        autoComplete="off"
      />
      {matches.length > 0 && (
        <ul className="suggest-list web-suggest">
          {matches.map((node) => (
            <li key={node.id}>
              <button type="button" className="suggest-item" onClick={() => setFocus(node.id)}>
                <NodeGlyph node={node} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{node.name}</strong>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {node.subtitle ?? NODE_KINDS[node.kind].label(words)} · {node.degree}{' '}
                    {node.degree === 1 ? 'verbinding' : 'verbindingen'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const legendRow = (kind: WebEdgeKind) => {
    const info = EDGE_KINDS[kind];
    const count = kindCounts.get(kind) ?? 0;
    const on = !hidden.has(kind);
    return (
      <label key={kind} className={`web-legend-row${on ? '' : ' web-legend-off'}`}>
        <input type="checkbox" checked={on} onChange={() => toggleKind(kind)} />
        <svg width="34" height="10" aria-hidden="true">
          <line x1="1" y1="5" x2="33" y2="5" className="web-legend-line" style={{ stroke: `var(--web-${kind})`, strokeWidth: info.width, strokeDasharray: info.dash.join(' ') || undefined }} />
        </svg>
        <span className="web-legend-label">{info.label(words)}</span>
        <span className="tiny muted">{count}</span>
      </label>
    );
  };
  // Kinds with nothing in this web are folded away under one line: a legend
  // of sixteen rows, eleven of them zero, is a form, not a key.
  const absentKinds = EDGE_KIND_ORDER.filter((k) => !(kindCounts.get(k) ?? 0));
  const legend = (
    <div className="web-legend" data-testid="web-legend">
      {EDGE_GROUPS.map((group) => {
        const kinds = EDGE_KIND_ORDER.filter((k) => EDGE_KINDS[k].group === group.key && (kindCounts.get(k) ?? 0) > 0);
        if (!kinds.length) return null;
        const allOn = kinds.every((k) => !hidden.has(k));
        return (
          <div key={group.key} className="web-legend-group">
            <button type="button" className="web-legend-head" onClick={() => toggleGroup(kinds, !allOn)} aria-pressed={allOn}>
              {group.label(words)}
            </button>
            {kinds.map(legendRow)}
          </div>
        );
      })}
      {absentKinds.length > 0 && (
        <details className="web-legend-absent">
          <summary className="tiny muted">Niet in dit web ({absentKinds.length})</summary>
          {absentKinds.map(legendRow)}
        </details>
      )}
      <label className="web-legend-row" style={{ marginTop: '0.4rem' }}>
        <input
          type="checkbox"
          checked={showNotes}
          onChange={() => {
            setShowNotes((v) => {
              store(NOTES_KEY, !v);
              return !v;
            });
          }}
        />
        <Icon name="note" size={14} style={{ color: 'var(--ink-muted)' }} />
        <span className="web-legend-label">Losse {words.note}s op {words.boardPlural}</span>
      </label>
      <label className="web-legend-row">
        <input
          type="checkbox"
          checked={labelsAlways}
          onChange={() => {
            setLabelsAlways((v) => {
              store(LABELS_KEY, !v);
              return !v;
            });
          }}
        />
        <Icon name="link" size={14} style={{ color: 'var(--ink-muted)' }} />
        <span className="web-legend-label">Altijd zeggen hoe</span>
      </label>
      <label className="web-legend-row">
        <input
          type="checkbox"
          checked={showImages}
          onChange={() => {
            setShowImages((v) => {
              store(IMAGES_KEY, !v);
              return !v;
            });
          }}
        />
        <Icon name="camera" size={14} style={{ color: 'var(--ink-muted)' }} />
        <span className="web-legend-label">Afbeeldingen tonen</span>
      </label>
    </div>
  );

  const panelBody = one ? (
    <NodePanel
      node={one}
      edges={graph.edges}
      nodeById={nodeById}
      isFocus={one.id === focus}
      onPick={(id) => onSelect(new Set([id]))}
      onFocus={(id) => setFocus(id)}
      onCentre={(id) => canvasRef.current?.centreOn(id)}
      words={words}
    />
  ) : selectedNodes.length > 1 ? (
    <div className="web-panel-body">
      <p className="eyebrow">Selectie</p>
      <h2 className="web-panel-name">{selectedNodes.length} gekozen</h2>
      <div className="row-wrap" style={{ margin: '0.5rem 0 0.8rem' }}>
        <PinSelectionButton nodes={selectedNodes} filedIn={filedIn} />
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setSelected(new Set())}>
          Leegmaken
        </button>
      </div>
      <ul className="web-list">
        {selectedNodes.map((node) => (
          <li key={node.id}>
            <button type="button" className="web-list-row" onClick={() => onSelect(new Set([node.id]))}>
              <NodeGlyph node={node} />
              <span className="web-list-name">{node.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <div className="web-panel-body">
      <p className="eyebrow">{focusNode ? 'Middelpunt' : 'Het hele web'}</p>
      {focusNode ? (
        <p className="small" style={{ margin: '0.3rem 0' }}>
          Klik een knoop om te zien hoe hij vastzit; dubbelklik om hem in het midden te zetten.
        </p>
      ) : (
        <p className="small" style={{ margin: '0.3rem 0' }}>
          Alles wat je mag zien, en hoe het aan elkaar hangt. Beweeg over een knoop om zijn buren op te lichten, of zoek iets om het middelpunt te maken.
        </p>
      )}
      <p className="tiny muted" style={{ margin: '0.6rem 0 0' }}>
        {graph.nodes.length} knopen · {graph.edges.length} lijnen
        {graph.truncated && ' · niet alles past; ga minder diep'}
      </p>
      <p className="tiny muted" style={{ margin: '0.4rem 0 0' }}>
        Shift-klik kiest er meer; shift-slepen trekt een vak. Een selectie kan op een {words.board}.
      </p>
    </div>
  );

  /* ---------------------------------------------------------------- page */

  if (error) {
    return (
      <div className="empty">
        <p style={{ margin: 0 }}>{error}</p>
      </div>
    );
  }

  // A phone without a focus: a search box, not a drawing.
  if (phone && !focus) {
    return (
      <div className="web-phone-search">
        <p className="small muted" style={{ margin: '0 0 0.6rem' }}>
          Het hele web is iets voor een groot scherm. Zoek hier iets en je krijgt zijn verbindingen.
        </p>
        {search}
        {!query && full && (
          <ul className="web-list" style={{ marginTop: '0.8rem' }}>
            {[...full.nodes]
              .filter((n) => n.kind !== 'note')
              .sort((a, b) => b.degree - a.degree)
              .slice(0, 20)
              .map((node) => (
                <li key={node.id}>
                  <button type="button" className="web-list-row" onClick={() => setFocus(node.id)}>
                    <NodeGlyph node={node} />
                    <span className="web-list-name">{node.name}</span>
                    <span className="tiny muted">{node.degree}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="web-view" data-testid="web-view" data-scope={focus ? 'focus' : 'all'}>
      <div className="row-wrap web-toolbar">
        {search}
        {focus && trail.length > 0 && (
          <button type="button" className="btn btn-small btn-ghost" onClick={goBack} title={`Terug naar ${nodeById.get(trail[trail.length - 1])?.name ?? 'het vorige middelpunt'}`} data-testid="web-back">
            <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />
            Terug
          </button>
        )}
        {focus && (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setFocus(null)} title="Het hele archief">
            <Icon name="web" size={15} />
            Hele web
          </button>
        )}
        {depthStepper}
        {focus && (
          <div className="web-modes" role="group" aria-label="Vorm">
            <button type="button" className="btn btn-small" aria-pressed={mode === 'columns'} onClick={() => setMode('columns')}>
              Kolommen
            </button>
            <button type="button" className="btn btn-small" aria-pressed={mode === 'organic'} onClick={() => setMode('organic')}>
              Web
            </button>
          </div>
        )}
        <div className="spacer" />
        <button type="button" className="btn btn-small btn-ghost" aria-pressed={legendOpen} onClick={() => setLegendOpen((v) => !v)} data-testid="web-legend-toggle">
          <Icon name="filter" size={15} />
          Legenda
        </button>
        <div className="web-zoom" role="group" aria-label="Zoom">
          <button type="button" className="btn btn-small btn-ghost" onClick={() => canvasRef.current?.zoomBy(1 / 1.3)} aria-label="Uitzoomen">
            <Icon name="zoomOut" size={15} />
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => canvasRef.current?.fit()} aria-label="Alles in beeld">
            <Icon name="fit" size={15} />
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => canvasRef.current?.zoomBy(1.3)} aria-label="Inzoomen">
            <Icon name="zoomIn" size={15} />
          </button>
        </div>
      </div>

      {focus && trail.length > 0 && !phone && (
        <p className="web-trail tiny" aria-label="Eerdere middelpunten">
          <span className="muted">Eerder:</span>
          {trail.map((id) => {
            const node = nodeById.get(id);
            if (!node) return null;
            return (
              <button key={id} type="button" className="chip chip-selectable" onClick={() => setFocus(id)}>
                <NodeGlyph node={node} />
                {node.name}
              </button>
            );
          })}
        </p>
      )}
      {focusMissing && (
        <p className="small" style={{ margin: '0 0 0.5rem', padding: '0.5rem 0.7rem', border: '1px solid var(--rule)', background: 'var(--paper-raised)' }}>
          Dit middelpunt is er niet, of je mag het niet zien.{' '}
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setFocus(null)}>
            Naar het hele web
          </button>
        </p>
      )}

      <div className={`web-body${legendOpen ? ' web-body-legend' : ''}`}>
        {legendOpen && !phone && <aside className="web-side web-side-legend">{legend}</aside>}
        <div className="web-stage-wrap">
          {!full && <p className="web-loading small muted">Het web wordt gesponnen…</p>}
          <WebCanvas
            ref={canvasRef}
            graph={graph}
            mode={effectiveMode}
            words={words}
            selected={selected}
            onSelect={onSelect}
            onFocus={(id) => setFocus(id)}
            onUnfold={(column) => setExpanded((current) => new Set([...current, column]))}
            expandedColumns={expanded}
            labelsAlways={labelsAlways}
            showImages={showImages}
            fitKey={fitKey}
            phone={phone}
          />
          {hint && full && !phone && (
            <div
              className="web-hint"
              role="note"
              onPointerDown={() => {
                setHint(false);
                store(HINT_KEY, true);
              }}
            >
              <strong>Zo lees je het web.</strong> Klik = kiezen · dubbelklik = middelpunt · scrollen = zoomen · slepen = schuiven · shift-slepen = meer kiezen. De kleur zegt wat voor lijn het is; beweeg erover en hij zegt hoe.
              <span className="tiny muted" style={{ display: 'block', marginTop: '0.3rem' }}>Klik om dit weg te doen.</span>
            </div>
          )}
          {graph.truncated && (
            <p className="web-truncated tiny">Niet alles past op {depth} diep — de rest is weggelaten.</p>
          )}
        </div>
        {!phone && <aside className="web-side web-side-panel">{panelBody}</aside>}
      </div>

      {phone && legendOpen && (
        <Sheet onClose={() => setLegendOpen(false)} labelledBy="web-legend-title">
          <h2 id="web-legend-title" style={{ margin: '0 0 0.6rem', fontSize: '1.1rem' }}>
            Legenda
          </h2>
          {legend}
        </Sheet>
      )}
      {phone && panelOpen && selected.size > 0 && (
        <Sheet onClose={() => setPanelOpen(false)} labelledBy="web-panel-title">
          {panelBody}
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- the panel */

function NodeGlyph({ node }: { node: WebNode }) {
  const icon = node.kind === 'entry' ? (node.isCharacter ? 'mask' : node.typeIcon || 'file') : NODE_KINDS[node.kind].icon;
  const colour = node.kind === 'entry' ? node.typeColour : undefined;
  return (
    <span className={`web-glyph web-glyph-${node.kind}`} style={colour ? { color: colour } : undefined}>
      <Icon name={icon} size={15} />
    </span>
  );
}

function NodePanel({
  node,
  edges,
  nodeById,
  isFocus,
  onPick,
  onFocus,
  onCentre,
  words,
}: {
  node: WebNode;
  edges: WebEdge[];
  nodeById: Map<WebNodeId, WebNode>;
  isFocus: boolean;
  onPick: (id: WebNodeId) => void;
  onFocus: (id: WebNodeId) => void;
  onCentre: (id: WebNodeId) => void;
  words: Record<string, string>;
}) {
  type Row = { edge: WebEdge; other: WebNode; arrow: '←' | '→' | '↔' };
  const rows: Row[] = [];
  for (const edge of edges) {
    if (edge.from !== node.id && edge.to !== node.id) continue;
    const otherId = edge.from === node.id ? edge.to : edge.from;
    const other = nodeById.get(otherId);
    if (!other) continue;
    // The arrow reads from this knot: → "this points at that", ← "that points
    // at this", ↔ a draad, which has no direction.
    rows.push({ edge, other, arrow: edge.kind === 'thread' ? '↔' : edge.to === node.id ? '←' : '→' });
  }
  rows.sort((a, b) => a.other.name.localeCompare(b.other.name, 'nl') || a.edge.kind.localeCompare(b.edge.kind));

  // Grouped by the *kind* of tie — the legend's groups — because "in which
  // dossier" and "on which wall" are the questions, and the direction is a
  // detail the arrow carries. A long list gets a filter box.
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const shown = needle ? rows.filter((row) => row.other.name.toLowerCase().includes(needle) || EDGE_KINDS[row.edge.kind].phrase(words, row.edge.detail).toLowerCase().includes(needle)) : rows;
  const groups = EDGE_GROUPS.map((group) => ({
    group,
    rows: shown.filter((row) => EDGE_KINDS[row.edge.kind].group === group.key),
  })).filter((g) => g.rows.length);

  const kindLabel = node.kind === 'entry' ? node.typeLabel ?? words.entry : NODE_KINDS[node.kind].label(words);

  const list = (items: Row[]) => (
    <ul className="web-list">
      {items.map(({ edge, other, arrow }) => {
        const info = EDGE_KINDS[edge.kind];
        const via = edge.via ? nodeById.get(edge.via) : undefined;
        return (
          <li key={`${edge.id}|${other.id}`}>
            <button type="button" className="web-list-row" onClick={() => onPick(other.id)} onDoubleClick={() => onFocus(other.id)} title={`${arrow === '←' ? `${other.name} wijst hierheen` : arrow === '→' ? `${node.name} verwijst naar ${other.name}` : `${words.string} tussen beide`} · klik: kiezen · dubbelklik: middelpunt`}>
              <span className="web-list-arrow" aria-hidden="true" style={{ color: `var(--web-${edge.kind})` }}>{arrow}</span>
              <NodeGlyph node={other} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="web-list-name">{other.name}</span>
                <span className="web-list-how" style={{ color: `var(--web-${edge.kind})` }}>
                  {info.phrase(words, edge.detail)}
                  {via ? ` · ${via.name}` : ''}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="web-panel-body" data-testid="web-panel">
      {node.coverAssetId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="web-panel-cover" src={assetUrl(node.coverAssetId, 'card')} alt="" />
      )}
      <p className="eyebrow row" style={{ gap: '0.35rem' }}>
        <NodeGlyph node={node} />
        {kindLabel}
        {node.isCharacter && <span className="muted">· {words.character}</span>}
      </p>
      <h2 className="web-panel-name">{node.name}</h2>
      {node.subtitle && node.subtitle !== kindLabel && (
        <p className="small muted" style={{ margin: '0.1rem 0 0' }}>
          {node.subtitle}
        </p>
      )}
      <div className="row-wrap" style={{ margin: '0.6rem 0 0.9rem' }}>
        <Link className="btn btn-small btn-primary" href={node.href} data-testid="web-open">
          <Icon name="chevron" size={14} />
          Openen
        </Link>
        {!isFocus && (
          <button type="button" className="btn btn-small" onClick={() => onFocus(node.id)} data-testid="web-focus-this">
            <Icon name="crosshair" size={14} />
            Middelpunt
          </button>
        )}
        <button type="button" className="btn btn-small btn-ghost" onClick={() => onCentre(node.id)} aria-label="In beeld brengen" title="In beeld brengen">
          <Icon name="fit" size={14} />
        </button>
      </div>

      {rows.length > 12 && (
        <>
          <label className="visually-hidden" htmlFor="web-panel-filter">
            Zoek in de verbindingen
          </label>
          <input
            id="web-panel-filter"
            className="input web-panel-filter"
            value={filter}
            placeholder={`Zoek in ${rows.length} verbindingen…`}
            onChange={(e) => setFilter(e.target.value)}
          />
        </>
      )}
      {groups.map(({ group, rows: items }) => (
        <div key={group.key}>
          <h3 className="web-panel-h" style={{ color: `var(--web-${items[0].edge.kind})` }}>
            {group.label(words)} <span className="muted">({items.length})</span>
          </h3>
          {list(items)}
        </div>
      ))}
      {!rows.length && (
        <p className="small muted">Niets in beeld zit hieraan vast. Ga dieper, of zet meer soorten lijnen aan in de legenda.</p>
      )}
      {rows.length > 0 && !shown.length && <p className="small muted">Niets gevonden.</p>}
      <p className="tiny muted" style={{ marginTop: '0.8rem' }}>
        → verwijst naar · ← wijst hierheen · ↔ {words.string}
      </p>
    </div>
  );
}

