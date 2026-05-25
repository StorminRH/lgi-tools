import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EmptyState } from '@/components/ui/empty-state';
import { EntryCard } from '@/features/changelog/components/EntryCard';
import { parseChangelog } from '@/features/changelog/parse';

export const metadata = {
  title: 'Changelog — LGI.tools',
  description: 'User-facing changes to LGI.tools, grouped by ship date.',
};

export default async function ChangelogPage() {
  const md = await readFile(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
  const entries = parseChangelog(md);

  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <header className="w-full max-w-[800px] mb-6 pb-4 border-b border-border-soft">
        <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          LGI.tools — Changelog
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
