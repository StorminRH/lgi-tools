import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { codexComponents } from '@/components/composition/codex-data-block';
import { Banner } from '@/components/ui/banner';
import { codexSourceCatalogue } from '@/composition/codex-sources';
import { getFullSession } from '@/composition/session';
import { CodexAdminArticle } from '@/features/codex/components/CodexAdminArticle';
import { CodexFooter } from '@/features/codex/credits';
import type { CodexEditMode } from '@/features/codex/edit-modes';
import { renderCodexSections } from '@/features/codex/render';
import { PAGE_SCOPE } from '@/features/codex/sections';
import { isCodexEditorNotice, type CodexEditorNotice } from '@/features/codex/subjects';
import {
  CodexHeader,
  codexPageFrame,
  CodexReaderView,
  CodexSubjectShell,
  describe,
  loadPage,
  type CodexParams,
} from '../codex-subject';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface CodexViewer {
  readonly mode: CodexEditMode;
  readonly name: string;
}

const readViewer = cache(async (): Promise<CodexViewer | null> => {
  const session = await getFullSession();
  if (!session) return null;
  if (session.isAdmin) return { mode: 'publish', name: session.name ?? '' };
  return session.characterId == null ? null : { mode: 'suggest', name: session.name ?? '' };
});

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
    notice: isCodexEditorNotice(notice) ? notice : null,
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
  const { subject, page, template } = await loadPage(kind, key);
  if (page) return describe(subject, page.title, template?.description);
  const { title } = readEditRequest(await searchParams);
  if (title && (await readViewer())?.mode === 'publish') return describe(subject, title);
  notFound();
}

export async function CodexAdminReader({ params, searchParams }: { params: CodexParams; searchParams: SearchParams }) {
  const { kind, key } = await params;
  const [{ subject, page, credits }, viewer, query] = await Promise.all([loadPage(kind, key), readViewer(), searchParams]);
  const request = readEditRequest(query);

  if (!page) {
    if (viewer?.mode !== 'publish' || !request.title) notFound();
    return (
      <CodexAdminArticle
        mode="publish"
        viewerName={viewer.name}
        subject={subject}
        newTitle={request.title}
        baseRevisionId={null}
        header={<CodexHeader subject={subject} title={request.title} updated="New page, not published yet" />}
        aside={null}
        footer={null}
        sections={[]}
        initialScope={PAGE_SCOPE}
        initialNotice={request.notice}
        catalogue={codexSourceCatalogue()}
      />
    );
  }
  if (!viewer) return <CodexReaderView subject={subject} page={page} credits={credits} />;

  const { header, aside, omit } = codexPageFrame(subject, page);
  const sections = renderCodexSections(page.doc, codexComponents, omit);
  const pageScope = viewer.mode === 'publish' ? [PAGE_SCOPE] : [];
  const scopes = new Set([...pageScope, ...sections.flatMap((section) => (section.lifted ? [] : [section.id]))]);
  const requested = request.edit !== null && scopes.has(request.edit) ? request.edit : null;
  const goneSectionId =
    viewer.mode === 'publish' && request.notice !== null && request.edit !== null && requested === null
      ? request.edit
      : null;
  return (
    <>
      {viewer.mode === 'publish' && page.revisionId !== null && request.title && !request.edit ? (
        <Banner tone="warn" className="mb-6">
          A page already lives at this address, so no new guide was started. Pick another address on the Codex home.
        </Banner>
      ) : null}
      <CodexAdminArticle
        mode={viewer.mode}
        viewerName={viewer.name}
        subject={subject}
        newTitle={null}
        baseRevisionId={page.revisionId}
        header={header}
        aside={aside}
        footer={<CodexFooter credits={credits} />}
        sections={sections}
        initialScope={goneSectionId === null ? requested : PAGE_SCOPE}
        initialNotice={request.notice}
        goneSectionId={goneSectionId}
        catalogue={codexSourceCatalogue()}
      />
    </>
  );
}

export default function CodexEditSubjectPage({
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
