import { EmptyState } from '@/components/ui/empty-state';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { APP_VERSION } from '@/config/app-version';
import { MasterSection } from '@/features/changelog/components/MasterSection';
import { loadChangelog } from '@/features/changelog/load';

export const metadata = {
  title: 'Changelog',
  description: 'User-facing changes to LGI.tools, grouped by release and tagged by change type.',
  alternates: { canonical: '/changelog' },
};

export default async function ChangelogPage() {
  const masters = await loadChangelog();

  return (
    <PageShell>
      <PageHead
        crumb="changelog"
        title="Changelog"
        meta={
          <span>
            Current <b className="text-isk font-semibold">v{APP_VERSION}</b>
          </span>
        }
      />

      <div className="pb-16">
        {masters.length === 0 ? (
          <EmptyState>No changelog entries yet.</EmptyState>
        ) : (
          <div className="changelog">
            {masters.map((master) => (
              <MasterSection key={master.version} master={master} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
