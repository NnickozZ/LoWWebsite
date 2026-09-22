import Link from 'next/link';
import { Thumb } from '@/components/Cover';
import { MentionText } from '@/components/ui/MentionPopover';
import { PanelDoor } from '@/components/spelers/PanelDoor';
import type { CaseSummary } from '@/lib/cases/service';
import { relativeTime } from '@/lib/diff';
import type { SpelerLite } from '@/lib/spelers/service';
import { fill, type Words } from '@/lib/words';

/**
 * §77, panel 5: the dossiers this person is on, as far as the reader may know.
 *
 * Two rights, and both are asked: the list is `listCases(viewer, { memberOf })`,
 * so `visibleCaseCondition` decides what the **reader** may see (§7/§17) and
 * `memberOf` decides which of those this **speler** is on. A dossier the reader
 * may not open is absent, never greyed out and never counted — §17's rule is
 * that it appears nowhere, and a spelerspagina is not an exception.
 */
export function DossiersPanel({
  cases,
  speler,
  words,
}: {
  cases: CaseSummary[];
  speler: SpelerLite;
  words: Words;
}) {
  if (cases.length === 0) {
    return (
      <p className="small muted" style={{ margin: 0 }}>
        Geen {words.casePlural} die jij ook kunt zien.
      </p>
    );
  }

  return (
    <>
      <ul className="speler-feed" aria-label={`${words.casePlural} — ${speler.username}`}>
        {cases.map((item) => (
          <li key={item.id}>
            <Link href={`/c/${item.slug}`} className="feed-item speler-feed-row">
              <Thumb assetId={item.coverAssetId} crop={item.coverCrop} shape="portrait" icon="folder" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="small" style={{ display: 'block', fontWeight: 600 }}>
                  {item.name}
                </span>
                {item.summary && (
                  <span className="tiny muted clamp-2" style={{ display: 'block' }}>
                    {/* §48: flat chips — the whole row is a link. */}
                    <MentionText text={item.summary} flat tokens />
                  </span>
                )}
                <span className="tiny muted" style={{ display: 'block' }}>
                  {relativeTime(item.updatedAt)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <PanelDoor href="/cases">{fill(words.toCases, { dossiers: words.casePlural })}</PanelDoor>
    </>
  );
}
