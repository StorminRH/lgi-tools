import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import { Pill } from '@/components/ui/pill';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdminPage } from '@/composition/route-guards';
import { listCodexRevisions, type CodexRevisionRow } from '@/features/codex/queries';
import {
  CODEX_SUBJECTS,
  codexPageHref,
  resolveCodexSubject,
  type CodexSubject,
} from '@/features/codex/subjects';

type Params = Promise<{ kind: string; key: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = { title: 'Page history', robots: { index: false } };

const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

const NOTICES: Readonly<Record<string, string>> = {
  conflict: 'The page changed while this history was open, so nothing was restored. The list below is current.',
  invalid: 'That version no longer passes the page checks, so it was not restored.',
};

function fallbackSummary(origin: CodexRevisionRow['origin']): string {
  return origin === 'revert' ? 'Restored an earlier version' : 'No summary';
}

function RestoreForm({
  subject,
  currentRevisionId,
  revisionId,
}: {
  subject: CodexSubject;
  currentRevisionId: string;
  revisionId: string;
}) {
  return (
    <form action="/api/admin/codex/revisions" method="post">
      <input type="hidden" name="action" value="restore" />
      <input type="hidden" name="kind" value={subject.kind} />
      <input type="hidden" name="key" value={subject.key} />
      <input type="hidden" name="baseRevisionId" value={currentRevisionId} />
      <input type="hidden" name="revisionId" value={revisionId} />
      <Button type="submit" variant="secondary" size="sm">
        Restore
      </Button>
    </form>
  );
}

function RevisionRow({
  subject,
  revision,
  currentRevisionId,
}: {
  subject: CodexSubject;
  revision: CodexRevisionRow;
  currentRevisionId: string | null;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-soft px-4 py-3 first:border-t-0">
      <time dateTime={revision.createdAt.toISOString()} className="w-36 shrink-0 font-data text-ui text-muted">
        {TIME_FORMAT.format(revision.createdAt)}
      </time>
      <span className="flex min-w-0 items-center gap-2 font-ui text-ui text-name">
        {revision.character ? (
          <>
            <CharacterPortrait characterId={revision.character.id} name={revision.character.name} size={28} />
            {revision.character.name}
          </>
        ) : (
          <>
            <span aria-hidden="true" className="size-7 shrink-0 rounded-full border border-border-idle bg-row-hover" />
            <span className="text-muted">Unknown pilot</span>
          </>
        )}
      </span>
      <span className="min-w-0 flex-1 font-ui text-ui text-text">
        {revision.summary ?? fallbackSummary(revision.origin)}
      </span>
      {revision.current ? (
        <Pill tone="green">Current</Pill>
      ) : currentRevisionId ? (
        <RestoreForm subject={subject} currentRevisionId={currentRevisionId} revisionId={revision.id} />
      ) : null}
    </li>
  );
}

export async function CodexHistory({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAdminPage();
  const [{ kind, key }, query] = await Promise.all([params, searchParams]);
  const subject = resolveCodexSubject(kind, key);
  if (!subject) notFound();
  const history = await listCodexRevisions(subject);
  if (!history) notFound();
  const currentRevisionId = history.revisions.find((revision) => revision.current)?.id ?? null;
  const notice = typeof query.notice === 'string' ? NOTICES[query.notice] : undefined;
  const pageHref = codexPageHref(subject);

  return (
    <div className="pb-20">
      <nav
        aria-label="Breadcrumb"
        className="mb-4 flex flex-wrap items-center gap-2 text-label uppercase tracking-[0.12em] text-muted"
      >
        <Link href="/codex" className="hover:text-name">
          Codex
        </Link>
        <span className="text-faint">/</span>
        <span>{CODEX_SUBJECTS[subject.kind].label}</span>
        <span className="text-faint">/</span>
        <Link href={pageHref} className="hover:text-name">
          {history.title}
        </Link>
      </nav>
      <h1 className="reveal pb-6 font-display text-title font-bold uppercase leading-none tracking-optical text-name">
        History
      </h1>
      {notice ? (
        <Banner tone="warn" className="mb-6">
          {notice}
        </Banner>
      ) : null}
      <Card className="overflow-hidden">
        <ol aria-label="Revisions, newest first">
          {history.revisions.map((revision) => (
            <RevisionRow
              key={revision.id}
              subject={subject}
              revision={revision}
              currentRevisionId={currentRevisionId}
            />
          ))}
        </ol>
      </Card>
    </div>
  );
}

export default function CodexHistoryPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <PageShell mode="workspace">
      <Suspense
        fallback={
          <div className="flex flex-col gap-4 pb-20">
            <Skeleton label="Loading history" className="h-4 w-48" />
            <Skeleton aria-hidden="true" className="h-48 w-full rounded-card" />
          </div>
        }
      >
        <CodexHistory params={params} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
