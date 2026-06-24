import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cacheLife } from 'next/cache';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { APP_VERSION } from '@/config/app-version';
import { EntryCard } from '@/features/changelog/components/EntryCard';
import { parseChangelog } from '@/features/changelog/parse';

export const metadata = {
  title: 'Changelog',
  description: 'User-facing changes to LGI.tools, grouped by release and tagged by change type.',
  alternates: { canonical: '/changelog' },
};

// The changelog only changes on deploy, so cache the file read + parse and let
// the build ID invalidate it — this keeps /changelog in the static prerender
// shell instead of forcing the route dynamic on an uncached file read.
async function loadChangelog() {
  'use cache';
  cacheLife('max');
  const md = await readFile(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
  return parseChangelog(md);
}

export default async function ChangelogPage() {
  const entries = await loadChangelog();

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
        {entries.length === 0 ? (
          <EmptyState>No changelog entries yet.</EmptyState>
        ) : (
          <div className="changelog">
            {entries.map((entry) => (
              <EntryCard key={`${entry.version}-${entry.date}`} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
