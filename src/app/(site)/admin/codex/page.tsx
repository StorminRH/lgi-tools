import Link from 'next/link';
import { Suspense } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { ChevronDownIcon } from '@/components/ui/icons';
import { Textarea } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { loadCodexProposalBases, type CodexProposalBase } from '@/composition/codex-proposal-bases';
import { diffCodexBlocks, wordStats } from '@/features/codex/diff';
import { listPendingCodexProposals, type CodexProposalView, type ReviewOutcome } from '@/features/codex/proposals';
import { formatRelativeTime } from '@/lib/format/time';
import { AdminPageFrame } from '../AdminFrame';
import { getCodexPendingShared } from '../codex-pending-shared';
import { ProposalByline } from './ProposalByline';
import { ProposalDiff } from './ProposalDiff';
import { QueuePager } from './QueuePager';

const PAGE_SIZE = 25;

type QueueParams = { outcome?: string | string[]; page?: string | string[] };

const OUTCOME_LABELS: Readonly<Partial<Record<ReviewOutcome, string>>> = {
  approved: 'The suggestion was published and its author credited on the page.',
  denied: 'The suggestion was denied and the note was saved for its author.',
  'not-pending': 'That suggestion was already reviewed or withdrawn.',
  'note-required': 'Write a note to the author before denying a suggestion.',
};

function outcomeMessage(raw: string | string[] | undefined): string | undefined {
  return typeof raw === 'string' ? OUTCOME_LABELS[raw as ReviewOutcome] : undefined;
}

function pageNumber(raw: string | string[] | undefined, pageCount: number): number {
  const page = typeof raw === 'string' ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(page) ? Math.min(Math.max(page, 1), pageCount) : 1;
}

const pageQuery = (page: number) => (page > 1 ? `?page=${page}` : '');

async function PendingCount() {
  const pending = await getCodexPendingShared();
  return <Pill tone="orange">{`${pending.toLocaleString()} pending`}</Pill>;
}

function Stats({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="font-data text-label tabular-nums">
      <span className="text-isk">+{added}</span> <span className="text-dps-high">−{removed}</span>
      <span className="text-faint"> words</span>
    </span>
  );
}

function ProposalItem({
  proposal,
  base,
  open,
  page,
}: {
  proposal: CodexProposalView;
  base: CodexProposalBase;
  open: boolean;
  page: number;
}) {
  const diff = diffCodexBlocks(base.before, proposal.blocks);
  const firstName = proposal.character.name.split(' ')[0];
  return (
    <Collapsible
      defaultOpen={open}
      headerClassName="items-start gap-3.5 px-4 py-3.5"
      header={
        <>
          <ProposalByline
            proposal={proposal}
            sectionTitle={base.sectionTitle}
            trailing={
              proposal.headRevisionId !== proposal.baseRevisionId ? (
                <Pill tone="yellow">
                  <Link href={`/admin/codex/${proposal.id}${pageQuery(page)}`} className="hover:underline">
                    Review merge
                  </Link>
                </Pill>
              ) : null
            }
          >
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <Stats {...wordStats(diff)} />
              <span className="font-ui text-label text-faint">{formatRelativeTime(proposal.createdAt)}</span>
              <span className="font-ui text-label text-faint">CC BY-SA 4.0 accepted</span>
            </div>
          </ProposalByline>
          <ChevronDownIcon size={16} className="mt-1 shrink-0 text-faint group-open:rotate-180" />
        </>
      }
    >
      <form
        action="/api/admin/codex/proposals"
        method="post"
        className="flex flex-col gap-4 border-t border-border-soft px-4 pt-4 pb-4 sm:pl-[68px]"
      >
        <input type="hidden" name="proposalId" value={proposal.id} />
        <input type="hidden" name="headRevisionId" value={proposal.headRevisionId ?? ''} />
        {page > 1 ? <input type="hidden" name="page" value={page} /> : null}
        <div className="flex items-center justify-between gap-3">
          <span className="font-ui text-label font-semibold uppercase tracking-eyebrow text-muted">
            Changes to {base.sectionTitle}
          </span>
          <span className="flex items-center gap-3 font-ui text-label text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-isk" /> Added
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-dps-high" /> Removed
            </span>
          </span>
        </div>
        <ProposalDiff diff={diff} />
        <label className="flex flex-col gap-2">
          <span className="font-ui text-label font-semibold uppercase tracking-eyebrow text-muted">
            Note to {firstName}{' '}
            <span className="font-normal normal-case tracking-normal text-faint">· sent with a denial</span>
          </span>
          <Textarea name="note" size="sm" rows={2} maxLength={1000} placeholder="Why this can't go in as written" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="action" value="approve" variant="primary">
            Approve and publish
          </Button>
          <Button type="submit" name="action" value="deny" variant="danger">
            Deny
          </Button>
        </div>
      </form>
    </Collapsible>
  );
}

async function CodexQueue({ searchParams }: { searchParams: Promise<QueueParams> }) {
  const [total, raw] = await Promise.all([getCodexPendingShared(), searchParams]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = pageNumber(raw.page, pageCount);
  const proposals = await listPendingCodexProposals({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const bases = await loadCodexProposalBases(proposals);
  const outcome = outcomeMessage(raw.outcome);
  const oldest = page === 1 ? proposals[0] : undefined;
  return (
    <div className="reveal reveal-1 flex w-full flex-col gap-4">
      {outcome ? <Banner tone="info">{outcome}</Banner> : null}
      <Card className="overflow-hidden">
        <SectionHeader
          size="md"
          label="Pending suggestions"
          hint={oldest ? `Oldest first: ${formatRelativeTime(oldest.createdAt)}` : undefined}
        />
        {proposals.length === 0 ? (
          <EmptyState>No suggestions are waiting for review.</EmptyState>
        ) : (
          proposals.map((proposal, index) => (
            <ProposalItem
              key={proposal.id}
              proposal={proposal}
              base={bases.get(proposal.id)!}
              open={index === 0}
              page={page}
            />
          ))
        )}
        {pageCount > 1 ? <QueuePager page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} /> : null}
      </Card>
    </div>
  );
}

export default function CodexSuggestionsPage({
  searchParams,
}: {
  searchParams: Promise<QueueParams>;
}) {
  return (
    <AdminPageFrame
      title="Codex suggestions"
      actions={
        <Suspense fallback={null}>
          <PendingCount />
        </Suspense>
      }
      fallbackLabel="Pending suggestions"
    >
      <CodexQueue searchParams={searchParams} />
    </AdminPageFrame>
  );
}
