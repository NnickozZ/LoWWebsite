'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { webNodeId, type WebNodeKind } from '@/lib/web/types';

/**
 * §43: the button on a page that opens the web with that thing in the middle.
 * The same on an artikel, a dossier, a landkaart, a prikbord and a tijdlijn,
 * so it is one component rather than five links that drift apart.
 */
export function ConnectionsLink({
  kind,
  id,
  as = 'button',
}: {
  kind: WebNodeKind;
  id: string;
  /**
   * A small button beside other buttons, or a chip in a row of chips — or,
   * golf O, only the icon, beside an artikel's title.
   */
  as?: 'button' | 'chip' | 'icon';
}) {
  const ui = useUi();
  if (as === 'icon') {
    return (
      <Link
        className="connections-icoon"
        href={`/web?focus=${encodeURIComponent(webNodeId(kind, id))}`}
        data-testid="connections-link"
        title={`${ui.words.connections}: het web, met dit in het midden`}
        aria-label={ui.words.connections}
      >
        <Icon name="web" size={18} />
      </Link>
    );
  }
  return (
    <Link
      className={as === 'chip' ? 'chip' : 'btn btn-small'}
      href={`/web?focus=${encodeURIComponent(webNodeId(kind, id))}`}
      data-testid="connections-link"
      title="Het web, met dit in het midden"
      /* §105: on a tekenvlak's head a phone shows only the icon; the name stays (§64). */
      aria-label={ui.words.connections}
    >
      <Icon name="web" size={as === 'chip' ? 12 : 15} />
      <span className="connections-word">{ui.words.connections}</span>
    </Link>
  );
}
