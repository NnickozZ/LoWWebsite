import Link from 'next/link';

/** Tag filter chips plus the recent/name sort toggle, shared by the browse pages. */
export function TagBar({
  tags,
  activeTag,
  sort,
  basePath,
}: {
  tags: { tag: string; count: number }[];
  activeTag?: string;
  sort: 'recent' | 'name';
  basePath: string;
}) {
  const withParams = (next: { tag?: string; sort?: string }) => {
    const params = new URLSearchParams();
    if (next.tag) params.set('tag', next.tag);
    if (next.sort && next.sort !== 'recent') params.set('sort', next.sort);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="chip-strip" style={{ marginBottom: '1rem' }}>
      {tags.slice(0, 14).map((entry) => (
        <Link
          key={entry.tag}
          className={`chip chip-selectable${entry.tag === activeTag ? ' chip-active' : ''}`}
          href={withParams({ tag: entry.tag === activeTag ? undefined : entry.tag, sort })}
        >
          {entry.tag}
          <span className="muted">{entry.count}</span>
        </Link>
      ))}
      <div className="spacer" />
      <Link
        className="chip chip-selectable"
        href={withParams({ tag: activeTag, sort: sort === 'name' ? 'recent' : 'name' })}
      >
        Sorteren: {sort === 'name' ? 'op naam' : 'recent'}
      </Link>
    </div>
  );
}
