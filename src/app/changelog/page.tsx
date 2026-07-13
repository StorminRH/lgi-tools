import { EmptyState } from '@/components/ui/empty-state';
import { MasterSection } from '@/features/changelog/components/MasterSection';
import { loadChangelog } from '@/features/changelog/load';
import { buildPageMetadata } from '@/lib/page-metadata';

export const metadata = buildPageMetadata({
  title: 'Changelog',
  description: 'User-facing changes to LGI.tools, grouped by release and tagged by change type.',
  canonical: '/changelog',
});

export default async function ChangelogPage() {
  const master = (await loadChangelog())[0];
  if (!master) return <EmptyState>No changelog entries yet.</EmptyState>;
  return (
    <div className="changelog">
      <MasterSection master={master} />
    </div>
  );
}
