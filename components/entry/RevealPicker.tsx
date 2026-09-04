'use client';

import { Icon } from '@/components/Icon';

export type RevealableUser = { id: string; username: string; isKeeper: boolean };
export type RevealableCase = { id: string; name: string; memberIds: string[] };

/**
 * §9's "Reveal to…" picker: every player as a chip, plus one chip per case that
 * has investigators assigned, which ticks all of them at once. Keepers are
 * listed but never tickable — they see everything anyway, and a ticked box that
 * changes nothing is a lie.
 */
export function RevealPicker({
  users,
  cases,
  value,
  onChange,
  label,
}: {
  users: RevealableUser[];
  cases: RevealableCase[];
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
}) {
  const chosen = new Set(value);
  const players = users.filter((user) => !user.isKeeper);

  function toggle(id: string) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  function toggleCase(memberIds: string[]) {
    const players = memberIds.filter((id) => users.some((u) => u.id === id && !u.isKeeper));
    const allOn = players.length > 0 && players.every((id) => chosen.has(id));
    const next = new Set(chosen);
    for (const id of players) {
      if (allOn) next.delete(id);
      else next.add(id);
    }
    onChange([...next]);
  }

  return (
    <div>
      <span className="label">{label}</span>
      {players.length === 0 ? (
        <p className="tiny muted" style={{ margin: 0 }}>
          Er zijn nog geen spelers om aan te onthullen.
        </p>
      ) : (
        <>
          <div className="row-wrap">
            {players.map((user) => (
              <button
                key={user.id}
                type="button"
                role="switch"
                aria-checked={chosen.has(user.id)}
                className={`chip chip-selectable${chosen.has(user.id) ? ' chip-active' : ''}`}
                onClick={() => toggle(user.id)}
              >
                {chosen.has(user.id) && <Icon name="check" size={12} />}
                {user.username}
              </button>
            ))}
          </div>

          {cases.length > 0 && (
            <div className="row-wrap" style={{ marginTop: '0.4rem' }}>
              <span className="tiny muted">Of in één keer:</span>
              {cases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="chip chip-selectable"
                  onClick={() => toggleCase(item.memberIds)}
                  title={`Alle toegewezen onderzoekers van ${item.name}`}
                >
                  <Icon name="folder" size={12} />
                  {item.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
