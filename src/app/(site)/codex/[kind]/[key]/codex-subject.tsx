import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, Suspense, type ReactNode } from 'react';
import { codexComponents, codexComponentsFor } from '@/components/composition/codex-data-block';
import { JsonLd } from '@/components/composition/JsonLd';
import { PageShell } from '@/components/ui/page-shell';
import { Pill } from '@/components/ui/pill';
import { Skeleton } from '@/components/ui/skeleton';
import { SITE_URL } from '@/config/site-url';
import { codexTemplate, type CodexTemplate } from '@/composition/codex-templates';
import type { CodexDoc } from '@/features/codex/doc';
import { loadCodexPageAssets, type CodexAssetView } from '@/features/codex/assets';
import { CodexEmptySection } from '@/features/codex/components/CodexEmptySection';
import { CodexPageLayout } from '@/features/codex/components/CodexPageLayout';
import { CodexFooter } from '@/features/codex/credits';
import { formatCodexDate } from '@/features/codex/format';
import { listCodexCredits, loadCodexPage, type CodexCredit, type CodexPageView } from '@/features/codex/queries';
import { CodexArticle, codexOutline } from '@/features/codex/render';
import { leadInfobox } from '@/features/codex/sections';
import {
  CODEX_SUBJECTS,
  codexKindHref,
  codexPageHref,
  resolveCodexSubject,
  type CodexSubject,
} from '@/features/codex/subjects';
import { buildPageMetadata } from '@/lib/page-metadata';
import { buildBreadcrumbList } from '@/lib/structured-data';

export type CodexParams = Promise<{ kind: string; key: string }>;

export type CodexPage =
  | CodexPageView
  | { readonly title: string; readonly doc: CodexDoc; readonly revisionId: null; readonly updatedAt: null };

interface LoadedPage {
  readonly subject: CodexSubject;
  readonly page: CodexPage | null;
  readonly template: CodexTemplate | null;
  readonly credits: readonly CodexCredit[];
}

export const loadPage = cache(async (kind: string, key: string): Promise<LoadedPage> => {
  const subject = resolveCodexSubject(kind, key);
  if (!subject) notFound();
  const entity = CODEX_SUBJECTS[subject.kind].entity;
  const [row, template, credits] = await Promise.all([
    loadCodexPage(subject),
    entity ? codexTemplate(subject) : null,
    listCodexCredits(subject),
  ]);
  if (!entity) return { subject, page: row, template: null, credits };
  if (!template) notFound();
  const page = row ?? { title: template.title, doc: template.doc, revisionId: null, updatedAt: null };
  return { subject, page, template, credits };
});

export function describe(subject: CodexSubject, title: string, description?: string) {
  return buildPageMetadata({
    title,
    description:
      description ?? `${title}: a pilot-written ${CODEX_SUBJECTS[subject.kind].singular.toLowerCase()} in the LGI.tools Codex.`,
    canonical: codexPageHref(subject),
    image: subject.kind === 'sites' ? 'segment' : 'root',
  });
}

function OnThisPage({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="On this page" className="hidden font-ui lg:sticky lg:top-24 lg:block lg:w-[200px]">
      <div className="mb-2 text-label font-semibold uppercase tracking-eyebrow text-muted">On this page</div>
      <ul className="space-y-1 border-l border-border-soft">
        {items.map((item, index) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={
                index === 0
                  ? '-ml-px block border-l border-isk py-0.5 pl-3 text-ui text-name'
                  : '-ml-px block border-l border-transparent py-0.5 pl-3 text-ui text-muted hover:text-name'
              }
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function CodexHeader({ subject, title, updated }: { subject: CodexSubject; title: string; updated: string }) {
  const spec = CODEX_SUBJECTS[subject.kind];
  const breadcrumb = buildBreadcrumbList([
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Codex', url: `${SITE_URL}/codex` },
    { name: spec.label, url: `${SITE_URL}${codexKindHref(subject.kind)}` },
    { name: title, url: `${SITE_URL}${codexPageHref(subject)}` },
  ]);
  return (
    <>
      <JsonLd data={breadcrumb} />
      <nav
        aria-label="Breadcrumb"
        className="mb-4 flex flex-wrap items-center gap-2 text-label uppercase tracking-[0.12em] text-muted"
      >
        <Link href="/codex" className="hover:text-name">
          Codex
        </Link>
        <span className="text-faint">/</span>
        <Link href={codexKindHref(subject.kind)} className="hover:text-name">
          {spec.label}
        </Link>
        <span className="text-faint">/</span>
        <span className="text-text">{title}</span>
      </nav>
      <header className="reveal">
        <h1 className="font-display text-title font-bold uppercase leading-none tracking-optical text-name">
          {title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill tone={spec.tone}>{spec.singular}</Pill>
          <span className="font-ui text-ui text-muted">{updated}</span>
        </div>
      </header>
    </>
  );
}

function sideColumn(subject: CodexSubject, page: CodexPage): { aside: ReactNode; omit: string | undefined } {
  const lead = CODEX_SUBJECTS[subject.kind].entity ? leadInfobox(page.doc) : null;
  if (lead) {
    return {
      aside: (
        <div className="order-first lg:order-none lg:sticky lg:top-24 lg:w-[320px]">
          {codexComponents.dataBlock({ attrs: lead.attrs, children: null })}
        </div>
      ),
      omit: lead.attrs.id,
    };
  }
  const outline = codexOutline(page.doc);
  return { aside: outline.length > 0 ? <OnThisPage items={outline} /> : null, omit: undefined };
}

export function codexPageFrame(subject: CodexSubject, page: CodexPage) {
  const updated = page.updatedAt === null ? 'Not written yet' : `Updated ${formatCodexDate(page.updatedAt)}`;
  return {
    header: <CodexHeader subject={subject} title={page.title} updated={updated} />,
    ...sideColumn(subject, page),
  };
}

export function loadReaderAssets(subject: CodexSubject, page: CodexPage) {
  return loadCodexPageAssets(subject, page.doc.content, { kind: 'reader' });
}

export function CodexReaderView({
  subject,
  page,
  credits,
  assets,
}: {
  subject: CodexSubject;
  page: CodexPage;
  credits: readonly CodexCredit[];
  assets: ReadonlyMap<string, CodexAssetView>;
}) {
  const { header, aside, omit } = codexPageFrame(subject, page);
  const components = codexComponentsFor(assets);
  return (
    <CodexPageLayout
      header={header}
      article={
        <>
          <CodexArticle
            doc={page.doc}
            components={components}
            omit={omit}
            placeholder={CODEX_SUBJECTS[subject.kind].entity ? <CodexEmptySection /> : undefined}
          />
          <CodexFooter credits={credits} />
        </>
      }
      aside={aside}
    />
  );
}

export function CodexSubjectShell({ children }: { children: ReactNode }) {
  return (
    <PageShell mode="workspace">
      <Suspense
        fallback={
          <div className="flex flex-col gap-4 pb-20">
            <Skeleton label="Loading page" className="h-4 w-48" />
            <Skeleton aria-hidden="true" className="h-10 w-full max-w-[32rem]" />
            <Skeleton aria-hidden="true" className="h-64 w-full max-w-[760px] rounded-card" />
          </div>
        }
      >
        {children}
      </Suspense>
    </PageShell>
  );
}
