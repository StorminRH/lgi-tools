import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { loadCodexProposalBases } from '@/composition/codex-proposal-bases';
import { getFullSession } from '@/composition/session';
import { CODEX_PROPOSAL_STATUS } from '@/features/codex/proposal-status';
import { listCodexProposalsBy, type CodexProposalView } from '@/features/codex/proposals';
import { codexPageHref } from '@/features/codex/subjects';
import { formatRelativeTime } from '@/lib/format/time';

export const metadata: Metadata = { title: 'My Codex suggestions', robots: { index: false } };

type SearchParams = Promise<{ notice?: string | string[] }>;

const NOTICES: Readonly<Record<string, string>> = {
  submitted: 'Your suggestion was sent. The site admin reviews it before it goes live.',
  withdrawn: 'Your suggestion was withdrawn.',
  'not-pending': 'That suggestion was already reviewed, so it could not be withdrawn.',
};

function SuggestionRow({ proposal, sectionTitle }: { proposal: CodexProposalView; sectionTitle: string }) {
  const status = CODEX_PROPOSAL_STATUS[proposal.status];
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 border-b border-border-soft px-4 py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Link href={codexPageHref(proposal.subject)} className="font-ui text-nav text-isk hover:underline">
            {proposal.pageTitle}
          </Link>
          <span className="text-faint">›</span>
          <span className="font-ui text-ui text-text">{sectionTitle}</span>
          <span className="font-ui text-label text-faint">{formatRelativeTime(proposal.createdAt)}</span>
        </div>
        <p className="mt-1 font-ui text-ui text-text">“{proposal.summary}”</p>
        {proposal.status === 'denied' && proposal.reviewNote ? (
          <p className="mt-1 font-ui text-ui text-muted">Reviewer note: {proposal.reviewNote}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Pill tone={status.tone}>{status.label}</Pill>
        {proposal.status === 'pending' ? (
          <form action="/api/codex/proposals" method="post">
            <input type="hidden" name="action" value="withdraw" />
            <input type="hidden" name="proposalId" value={proposal.id} />
            <Button type="submit" variant="ghost" size="sm">
              Withdraw
            </Button>
          </form>
        ) : null}
      </div>
    </li>
  );
}

async function MySuggestions({ searchParams }: { searchParams: SearchParams }) {
  const [session, query] = await Promise.all([getFullSession(), searchParams]);
  if (!session) {
    return (
      <Card>
        <EmptyState>Sign in to see your suggestions.</EmptyState>
      </Card>
    );
  }
  const proposals = await listCodexProposalsBy(session.user.id);
  const bases = await loadCodexProposalBases(proposals);
  const notice = typeof query.notice === 'string' ? NOTICES[query.notice] : undefined;
  return (
    <div className="flex flex-col gap-4">
      {notice ? <Banner tone="info">{notice}</Banner> : null}
      <Card className="overflow-hidden">
        <SectionHeader size="md" label="Your suggestions" hint="Newest first" />
        {proposals.length === 0 ? (
          <EmptyState>You have not suggested any edits yet. Open a Codex page and press Suggest edit.</EmptyState>
        ) : (
          <ul>
            {proposals.map((proposal) => (
              <SuggestionRow
                key={proposal.id}
                proposal={proposal}
                sectionTitle={bases.get(proposal.id)?.sectionTitle ?? proposal.sectionId}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function MySuggestionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell mode="workspace">
      <div className="flex flex-col gap-6 pb-20">
        <PageHead title="My suggestions" />
        <Suspense fallback={<Skeleton label="Loading suggestions" className="h-40 w-full rounded-card" />}>
          <MySuggestions searchParams={searchParams} />
        </Suspense>
      </div>
    </PageShell>
  );
}
