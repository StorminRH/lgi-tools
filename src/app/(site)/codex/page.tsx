import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionLabel } from '@/components/ui/section-label';
import { listCodexPages } from '@/features/codex/queries';
import { buildPageMetadata } from '@/lib/page-metadata';

export const metadata = buildPageMetadata({
  title: 'Codex',
  description: 'The pilot-written field guide to wormhole space.',
  canonical: '/codex',
});

export default async function CodexIndexPage() {
  const guides = await listCodexPages('guides');
  return (
    <PageShell mode="workspace">
      <PageHead
        title="Codex"
        subtitle="The pilot-written field guide to wormhole space. Game data stays live; the advice comes from people who fly it."
      />
      <Card className="reveal reveal-2 mb-20 overflow-hidden">
        <SectionLabel className="px-3.5 pt-3.5 pb-2">Guides</SectionLabel>
        <ul>
          {guides.map((guide) => (
            <li key={guide.key} className="border-t border-border-soft">
              <Link
                href={`/codex/guides/${guide.key}`}
                className="block px-3.5 py-3 font-ui text-nav text-name hover:bg-bg-deep/40"
              >
                {guide.title}
              </Link>
            </li>
          ))}
        </ul>
        {guides.length === 0 ? <EmptyState>No guides yet.</EmptyState> : null}
      </Card>
    </PageShell>
  );
}
