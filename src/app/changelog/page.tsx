import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cacheLife } from 'next/cache';
import { Callout } from '@/components/ui/callout';
import { EmptyState } from '@/components/ui/empty-state';
import { EntryCard } from '@/features/changelog/components/EntryCard';
import { parseChangelog } from '@/features/changelog/parse';

export const metadata = {
  title: 'Changelog',
  description: 'User-facing changes to LGI.tools, grouped by ship date.',
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
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <div className="w-full max-w-[800px] mb-4">
        <Callout label="Beta">
          LGI.tools is in public beta. Expect rough edges and rapid iteration; some
          tools are incomplete and data may shift. Hit the Feedback button (bottom-right)
          to flag anything broken or missing.
        </Callout>
      </div>

      <header className="w-full max-w-[800px] mb-6 pb-4 border-b border-border-soft">
        <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          Changelog
        </div>
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
          {entries.length} update{entries.length === 1 ? '' : 's'}
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="w-full max-w-[800px]">
          <EmptyState>No changelog entries yet.</EmptyState>
        </div>
      ) : (
        <div className="w-full max-w-[800px] flex flex-col gap-4">
          {entries.map((entry) => (
            <EntryCard key={entry.date} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
