import { SearchScreen } from '@/components/SearchScreen';
import { LivePage } from '@/components/live/LivePage';
import { listEntryTypes } from '@/lib/entries/service';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q, type } = await searchParams;
  const types = listEntryTypes().map((item) => ({
    slug: item.slug,
    label: item.label,
    icon: item.icon,
    colour: item.colour,
  }));
  return (
    <>
      <LivePage place="page:/search" watch={['entries', 'types']} />
      <SearchScreen initialQuery={q ?? ''} initialType={type ?? ''} types={types} />
    </>
  );
}
