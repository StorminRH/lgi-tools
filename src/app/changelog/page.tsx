import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cacheLife } from 'next/cache';
import { Callout } from '@/components/ui/callout';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHead } from '@/components/ui/page-head';
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
    <div className="w-full">
      <PageHead
        crumb="changelog"
        title="Changelog"
        meta={
          <span>
            Current <b className="text-isk font-semibold">v{APP_VERSION}</b>
          </span>
        }
      />

      <div className="w-full max-w-[1080px] mx-auto px-7 pb-16">
        <div className="max-w-[860px] mb-7">
          <Callout label="Beta">
            LGI.tools is in public beta. Expect rough edges and rapid iteration; some tools are
            incomplete and data may shift. Hit the Feedback button (bottom-right) to flag anything
            broken or missing.
          </Callout>
        </div>

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
    </div>
  );
}
