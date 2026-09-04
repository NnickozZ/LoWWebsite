'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';

/** Free-form tags, lower-cased, autocompleted from what already exists (§6). */
export function TagsEditor({
  tags,
  known,
  onChange,
}: {
  tags: string[];
  known: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const matches = useMemo(() => {
    const typed = draft.trim().toLowerCase();
    if (!typed) return [];
    return known
      .filter((tag) => tag.includes(typed) && !tags.includes(tag))
      .slice(0, 6);
  }, [draft, known, tags]);

  function add(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!tag || tags.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...tags, tag]);
    setDraft('');
  }

  return (
    <div>
      <div className="row-wrap" style={{ marginBottom: '0.4rem' }}>
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
            <button
              type="button"
              aria-label={`${tag} verwijderen`}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
            >
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
      </div>

      <div style={{ position: 'relative' }}>
        <input
          className="input"
          value={draft}
          placeholder="Tag toevoegen…"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => draft.trim() && add(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add(draft);
            } else if (event.key === 'Backspace' && !draft && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
        />
        {matches.length > 0 && (
          <ul className="suggest-list" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0 }}>
            {matches.map((tag) => (
              <li key={tag}>
                <button type="button" className="suggest-item" onMouseDown={(e) => e.preventDefault()} onClick={() => add(tag)}>
                  {tag}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
