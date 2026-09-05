import Link from 'next/link';
import type { EntrySummary } from '@/lib/entries/service';
import { entryDisplayName, isAdrift } from '@/lib/entries/caseName';
import { AdriftChip } from './entry/AdriftChip';
import { borderClass } from './borders';
import { Cover } from './Cover';
import { Icon } from './Icon';

export function EntryCard({
  entry,
  note,
  showType = true,
}: {
  entry: EntrySummary;
  note?: string;
  /** Off on a page that already lists one type — the footer would only repeat it. */
  showType?: boolean;
}) {
  return (
    <Link className={`card ${borderClass(entry.typeBorder)}`} href={`/e/${entry.slug}`}>
      <Cover
        assetId={entry.coverAssetId}
        crop={entry.coverCrop}
        alt=""
        icon={entry.typeIcon}
        colour={entry.typeColour}
      />
      <div className="card-body">
        {/* §24: a voorwerp or a clue is made inside one investigation, so a
            list says which — two letters called "de brief" are two letters.
            Only the printing; the stored name is still the short one, and the
            dossier is named only to someone who may open it. */}
        <p className="card-name">
          {entryDisplayName(entry.name, entry.originCaseName)}
          {/* §24: and when it is in no dossier at all, the archive says so
              rather than letting a clue read like an ordinary artikel. */}
          {isAdrift(entry) && (
            <>
              {' '}
              <AdriftChip />
            </>
          )}
        </p>
        {entry.shortDescription && (
          <p className="tiny muted clamp-2" style={{ margin: 0 }}>
            {entry.shortDescription}
          </p>
        )}
        {note && (
          <p className="tiny clamp-2" style={{ margin: '0.3rem 0 0', fontStyle: 'italic' }}>
            {note}
          </p>
        )}
        {(showType || entry.visibility === 'keeper' || entry.viewMode !== 'all') && (
          <p
            className="tiny muted"
            style={{ margin: '0.35rem 0 0', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            {showType && (
              <>
                <Icon name={entry.typeIcon} size={13} style={{ color: entry.typeColour }} />
                {entry.typeLabel}
              </>
            )}
            {entry.visibility === 'keeper' && (
              <span className="stamp stamp-muted" style={{ fontSize: '0.6rem', marginLeft: 'auto' }}>
                Keeper
              </span>
            )}
            {entry.visibility !== 'keeper' && entry.viewMode !== 'all' && (
              // §17: not everyone sees this one — the owner chose who.
              <span
                className="stamp stamp-muted"
                style={{ fontSize: '0.6rem', marginLeft: 'auto' }}
                title={entry.viewMode === 'private' ? 'Privé' : 'Alleen gekozen personen'}
              >
                <Icon name="lock" size={9} /> {entry.viewMode === 'private' ? 'Privé' : 'Gekozen'}
              </span>
            )}
          </p>
        )}
      </div>
    </Link>
  );
}
