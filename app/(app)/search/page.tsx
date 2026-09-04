import { SearchScreen } from '@/components/SearchScreen';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <SearchScreen initialQuery={q ?? ''} />;
}
