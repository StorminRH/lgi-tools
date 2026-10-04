import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Banner } from '@/components/ui/banner';
import { Card, insetSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { loadCodexProposalMerge, type CodexProposalMerge } from '@/composition/codex-merge-review';
import { codexSourceCatalogue } from '@/composition/codex-sources';
import { codexQueuePage } from '@/features/codex/api-contract';
import { collectCodexAssetIds, loadCodexAssetViews, withImageSources, type CodexAssetView } from '@/features/codex/assets';
import { CodexImageFigure } from '@/features/codex/components/CodexImage';
import { diffCodexBlocks } from '@/features/codex/diff';
import type { CodexBlockNode } from '@/features/codex/doc';
import type { CodexMergeConflict } from '@/features/codex/merge';
import { CODEX_PROPOSAL_STATUS } from '@/features/codex/proposal-status';
import { plainText, sectionTitle } from '@/features/codex/sections';
import { formatRelativeTime } from '@/lib/format/time';
import { AdminPageFrame } from '../../AdminFrame';
import { ProposalByline } from '../ProposalByline';
import { ProposalDiff } from '../ProposalDiff';
import { ConflictResolver, type ConflictRow } from './ConflictResolver';

type Params = Promise<{ proposalId: string }>;
type SearchParams = Promise<{ notice?: string | string[]; page?: string | string[] }>;

const REVIEW_NOTICES: Readonly<Record<string, string>> = {
  moved:
    'The page changed while you were reviewing, so nothing was published. The conflicts below are fresh and your hand edits were kept.',
  invalid: 'An edited block did not pass the page checks, so nothing was published. Your edits are kept below.',
  conflict: 'Pick a version for every block below, then approve.',
};

const proposalIdSchema = z.uuid();

function noticeOf(raw: string | string[] | undefined): string | null {
  return typeof raw === 'string' && Object.hasOwn(REVIEW_NOTICES, raw) ? raw : null;
}

function queuePageOf(raw: string | string[] | undefined): string | undefined {
  const parsed = codexQueuePage.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

type Assets = ReadonlyMap<string, CodexAssetView>;

const against = (base: CodexBlockNode | null, side: CodexBlockNode | null, assets: Assets) => (
  <ProposalDiff diff={diffCodexBlocks(base ? [base] : [], side ? [side] : [])} assets={assets} />
);

function baseColumn(base: CodexBlockNode | null, assets: Assets) {
  if (base?.type === 'image') return <CodexImageFigure attrs={base.attrs} asset={assets.get(base.attrs.assetId)} />;
  return (
    <p className={cn(insetSurface, 'px-4 py-3.5 font-ui text-nav leading-[1.75] whitespace-pre-wrap text-text')}>
      {base ? plainText(base) : <span className="text-ui text-muted italic">Not in the original</span>}
    </p>
  );
}

function conflictRow({ blockId, base, head, proposal }: CodexMergeConflict, assets: Assets): ConflictRow {
  const initial = proposal ?? head;
  return {
    blockId,
    columns: {
      base: baseColumn(base, assets),
      head: against(base, head, assets),
      proposal: against(base, proposal, assets),
    },
    headPresent: head !== null,
    proposalPresent: proposal !== null,
    initialBlocks: initial === null ? [null] : withImageSources([initial], assets),
  };
}

function conflictAssets(conflicts: readonly CodexMergeConflict[]): Promise<Map<string, CodexAssetView>> {
  const blocks = conflicts.flatMap(({ base, head, proposal }) => [base, head, proposal]);
  return loadCodexAssetViews(
    collectCodexAssetIds(blocks.filter((block) => block !== null)),
    { kind: 'admin' },
  );
}

function Byline({ proposal, merge }: CodexProposalMerge) {
  const status = CODEX_PROPOSAL_STATUS[proposal.status];
  const doc = merge.kind === 'invalid' ? null : merge.doc;
  return (
    <div className="flex items-start gap-3.5 px-4 py-3.5">
      <ProposalByline
        proposal={proposal}
        sectionTitle={sectionTitle(doc, proposal.sectionId)}
        trailing={<Pill tone={status.tone}>{status.label}</Pill>}
      >
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <span className="font-ui text-label text-faint">{formatRelativeTime(proposal.createdAt)}</span>
          <span className="font-ui text-label text-faint">CC BY-SA 4.0 accepted</span>
        </div>
      </ProposalByline>
    </div>
  );
}

export async function MergeReview({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ proposalId }, query] = await Promise.all([params, searchParams]);
  const id = proposalIdSchema.safeParse(proposalId);
  if (!id.success) notFound();
  const loaded = await loadCodexProposalMerge(id.data);
  if (!loaded) notFound();
  const { proposal, headRevisionId, merge } = loaded;
  const notice = noticeOf(query.notice);
  const page = queuePageOf(query.page);
  const conflicts = merge.kind === 'conflict' ? merge.conflicts : [];
  const assets = await conflictAssets(conflicts);
  return (
    <div className="reveal reveal-1 flex w-full flex-col gap-4">
      <Link
        href={page === undefined ? '/admin/codex' : `/admin/codex?page=${page}`}
        className="self-start font-ui text-label text-muted hover:text-name hover:underline"
      >
        Back to the queue
      </Link>
      {notice ? <Banner tone={notice === 'conflict' ? 'info' : 'warn'}>{REVIEW_NOTICES[notice]}</Banner> : null}
      <Card className="overflow-hidden">
        <SectionHeader
          size="md"
          label="Suggestion"
          hint={conflicts.length > 0 ? `${conflicts.length} block${conflicts.length === 1 ? '' : 's'} to settle` : undefined}
        />
        <Byline {...loaded} />
        {merge.kind === 'invalid' ? (
          <Banner tone="warn" className="mx-4 mb-4">
            This suggestion cannot be merged: {merge.problems.join('; ')}
          </Banner>
        ) : proposal.status === 'pending' ? (
          <ConflictResolver
            proposalId={proposal.id}
            headRevisionId={headRevisionId}
            page={page}
            notice={notice}
            catalogue={codexSourceCatalogue()}
            rows={conflicts.map((conflict) => conflictRow(conflict, assets))}
          />
        ) : null}
      </Card>
    </div>
  );
}

export default function CodexMergeReviewPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <AdminPageFrame title="Review a suggestion" fallbackLabel="Suggestion">
      <MergeReview params={params} searchParams={searchParams} />
    </AdminPageFrame>
  );
}
