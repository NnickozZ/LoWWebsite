/**
 * §90: the three a Keeper comes here for mid-session — a password, the review
 * queue, the bin — come first. On a phone the strip scrolls sideways, and the
 * bin started at x 696 of 390: off the screen, behind a swipe nobody knew to
 * make. The rest keep the page's own order.
 */
export const ADMIN_FIRST = ['users', 'review', 'trash'];

export function orderPanes<T extends { key: string }>(panes: T[]): T[] {
  const rank = (key: string) => {
    const at = ADMIN_FIRST.indexOf(key);
    return at === -1 ? ADMIN_FIRST.length : at;
  };
  return panes
    .map((pane, index) => ({ pane, index }))
    .sort((a, b) => rank(a.pane.key) - rank(b.pane.key) || a.index - b.index)
    .map(({ pane }) => pane);
}
