import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import { PageShell } from '@/components/ui/page-shell';
import { Pill } from '@/components/ui/pill';
import { Skeleton } from '@/components/ui/skeleton';
import { loadCodexPage } from '@/features/codex/queries';
import { CodexArticle, codexOutline } from '@/features/codex/render';
import { CODEX_SUBJECTS, resolveCodexSubject } from '@/features/codex/subjects';
import { buildPageMetadata } from '@/lib/page-metadata';

type Params = Promise<{ kind: string; key: string }>;

const loadPage = cache(async (kind: string, key: string) => {
  const subject = resolveCodexSubject(kind, key);
  if (!subject) notFound();
  const page = await loadCodexPage(subject);
  if (!page) notFound();
  return { subject, page };
});

const UPDATED_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { kind, key } = await params;
  const { subject, page } = await loadPage(kind, key);
  return buildPageMetadata({
    title: page.title,
    description: `${page.title}: a pilot-written ${CODEX_SUBJECTS[subject.kind].singular.toLowerCase()} in the LGI.tools Codex.`,
    canonical: `/codex/${subject.kind}/${subject.key}`,
  });
}

function OnThisPage({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="On this page" className="hidden font-ui lg:sticky lg:top-24 lg:block">
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

export async function CodexReader({ params }: { params: Params }) {
  const { kind, key } = await params;
  const { subject, page } = await loadPage(kind, key);
  const spec = CODEX_SUBJECTS[subject.kind];
  const outline = codexOutline(page.doc);

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
        <span>{spec.label}</span>
        <span className="text-faint">/</span>
        <span className="text-text">{page.title}</span>
      </nav>
      <header className="reveal pb-6">
        <h1 className="font-display text-title font-bold uppercase leading-none tracking-optical text-name">
          {page.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill tone="green">{spec.singular}</Pill>
          <span className="font-ui text-ui text-muted">
            Updated {UPDATED_FORMAT.format(page.updatedAt)}
          </span>
        </div>
      </header>
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_200px]">
        <article className="min-w-0 max-w-[760px]">
          <CodexArticle doc={page.doc} components={{}} />
          <footer className="mt-14 border-t border-border-soft pt-6 font-ui text-label text-faint">
            Text available under{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              className="text-muted underline-offset-2 hover:text-name hover:underline"
            >
              CC BY-SA 4.0
            </a>
            . EVE Online data and images © Fenris Creations.
          </footer>
        </article>
        {outline.length > 0 ? <OnThisPage items={outline} /> : null}
      </div>
    </div>
  );
}

export default function CodexSubjectPage({ params }: { params: Params }) {
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
        <CodexReader params={params} />
      </Suspense>
    </PageShell>
  );
}
