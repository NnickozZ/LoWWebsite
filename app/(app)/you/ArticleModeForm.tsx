'use client';

import { useActionState } from 'react';
import { Icon } from '@/components/Icon';
import { ARTICLE_MODE_CHOICES, articleModeFor, type ArticleModePref } from '@/lib/entries/mode';
import { setArticleModeAction, type ArticleModeState } from './actions';

/**
 * §22: how an artikel opens for this person.
 *
 * Three submit buttons in one form rather than a select and a Save: the choice
 * *is* the action, so there is nothing to confirm and nothing to forget. The
 * chip that is on is the one in force; the answer comes back in the action's
 * state, so the row is right again without a reload.
 */
export function ArticleModeForm({
  current,
  isKeeper,
}: {
  current: ArticleModePref;
  isKeeper: boolean;
}) {
  const [state, action, pending] = useActionState<ArticleModeState, FormData>(
    setArticleModeAction,
    {},
  );
  const chosen = state.mode ?? current;
  const lands = articleModeFor(chosen, isKeeper);
  const hint = ARTICLE_MODE_CHOICES.find((choice) => choice.value === chosen)?.hint ?? '';

  return (
    <form action={action}>
      <div className="row-wrap" role="group" aria-label="Hoe een artikel opengaat">
        {ARTICLE_MODE_CHOICES.map((choice) => {
          const on = choice.value === chosen;
          return (
            <button
              key={choice.value || 'role'}
              type="submit"
              name="mode"
              value={choice.value}
              disabled={pending}
              aria-pressed={on}
              className={`chip chip-selectable${on ? ' chip-active' : ''}`}
            >
              {on && <Icon name="check" size={13} />}
              {choice.label}
            </button>
          );
        })}
      </div>

      <p className="tiny muted" style={{ margin: '0.45rem 0 0' }}>
        {hint} Een artikel opent nu in{' '}
        <strong>{lands === 'edit' ? 'bewerken' : 'lezen'}</strong>; de knop bovenaan het artikel
        wisselt altijd.
      </p>

      {state.error && <p className="error-note">{state.error}</p>}
    </form>
  );
}
