import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { Banner } from '@/components/ui/banner';
import { getFullSession } from '@/composition/session';
import { CodexAdminArticle } from '@/features/codex/components/CodexAdminArticle';
import { renderCodexSections } from '@/features/codex/render';
import { PAGE_SCOPE } from '@/features/codex/sections';
import type { CodexEditorNotice } from '@/features/codex/subjects';
import {
  CodexHeader,
  codexPageFrame,
  CodexReaderView,
  CodexSubjectShell,
  describe,
  licenseFooter,
  loadPage,
  type CodexParams,
} from '../codex-subject';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const viewerIsAdmin = cache(async () => Boolean((await getFullSession())?.isAdmin));

interface EditRequest {
  readonly edit: string | null;
  readonly notice: CodexEditorNotice | null;
  readonly title: string | null;
}

function readEditRequest(query: Awaited<SearchParams>): EditRequest {
  const one = (name: string) => {
    const value = query[name];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  };
  const notice = one('notice');
  const title = one('title');
  return {
    edit: one('edit'),
    notice: notice === 'conflict' || notice === 'invalid' ? notice : null,
    title: title !== null && title.length <= 120 ? title : null,
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: CodexParams;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { kind, key } = await params;
  const { subject, page } = await loadPage(kind, key);
  if (page) return describe(subject, page.title);
  const { title } = readEditRequest(await searchParams);
  if (title && (await viewerIsAdmin())) return describe(subject, title);
  notFound();
}

export async function CodexAdminReader({ params, searchParams }: { params: CodexParams; searchParams: SearchParams }) {
  const { kind, key } = await params;
  const [{ subject, page }, isAdmin, query] = await Promise.all([loadPage(kind, key), viewerIsAdmin(), searchParams]);
  const request = readEditRequest(query);

  if (!page) {
    if (!isAdmin || !request.title) notFound();
    return (
      <CodexAdminArticle
        subject={subject}
        newTitle={request.title}
        baseRevisionId={null}
        header={<CodexHeader subject={subject} title={request.title} updated="New page, not published yet" />}
        aside={null}
        footer={null}
        sections={[]}
        initialScope={PAGE_SCOPE}
        initialNotice={request.notice}
      />
    );
  }
  if (!isAdmin) return <CodexReaderView subject={subject} page={page} />;

  const { header, aside } = codexPageFrame(subject, page);
  const sections = renderCodexSections(page.doc, {});
  const scopes = new Set([PAGE_SCOPE, ...sections.map((section) => section.id)]);
  const requested = request.edit !== null && scopes.has(request.edit) ? request.edit : null;
  const goneSectionId = request.notice !== null && request.edit !== null && requested === null ? request.edit : null;
  return (
    <>
      {request.title && !request.edit ? (
        <Banner tone="warn" className="mb-6">
          A page already lives at this address, so no new guide was started. Pick another address on the Codex home.
        </Banner>
      ) : null}
      <CodexAdminArticle
        subject={subject}
        newTitle={null}
        baseRevisionId={page.revisionId}
        header={header}
        aside={aside}
        footer={licenseFooter}
        sections={sections}
        initialScope={goneSectionId === null ? requested : PAGE_SCOPE}
        initialNotice={request.notice}
        goneSectionId={goneSectionId}
      />
    </>
  );
}

export default function CodexAdminSubjectPage({
  params,
  searchParams,
}: {
  params: CodexParams;
  searchParams: SearchParams;
}) {
  return (
    <CodexSubjectShell>
      <CodexAdminReader params={params} searchParams={searchParams} />
    </CodexSubjectShell>
  );
}
