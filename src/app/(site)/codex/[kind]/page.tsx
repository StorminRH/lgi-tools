import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageShell } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { listCodexEntries } from '@/composition/codex-templates';
import {
  CODEX_SUBJECT_KINDS,
  CODEX_SUBJECTS,
  codexKindHref,
  codexPageHref,
  isCodexSubjectKind,
  type CodexSubjectKind,
} from '@/features/codex/subjects';
import { buildPageMetadata } from '@/lib/page-metadata';

type KindParams = Promise<{ kind: string }>;

async function readKind(params: KindParams): Promise<CodexSubjectKind> {
  const { kind } = await params;
  if (!isCodexSubjectKind(kind)) notFound();
  return kind;
}

export function generateStaticParams(): { kind: string }[] {
  return CODEX_SUBJECT_KINDS.map((kind) => ({ kind }));
}

export async function generateMetadata({ params }: { params: KindParams }): Promise<Metadata> {
  const kind = await readKind(params);
  const spec = CODEX_SUBJECTS[kind];
  return buildPageMetadata({
    title: spec.label,
    description: `${spec.label} in the LGI.tools Codex. ${spec.blurb}`,
    canonical: codexKindHref(kind),
  });
}

export async function CodexKindIndex({ params }: { params: KindParams }) {
  const kind = await readKind(params);
  const spec = CODEX_SUBJECTS[kind];
  const entries = await listCodexEntries(kind);
  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className="mb-4 flex flex-wrap items-center gap-2 text-label uppercase tracking-[0.12em] text-muted"
      >
        <Link href="/codex" className="hover:text-name">
          Codex
        </Link>
        <span className="text-faint">/</span>
        <span className="text-text">{spec.label}</span>
      </nav>
      <header className="reveal mb-8">
        <h1 className="font-display text-title font-bold uppercase leading-none tracking-optical text-name">
          {spec.label}
        </h1>
        <p className="mt-3 font-ui text-ui text-muted">
          {entries.length} {spec.nouns[entries.length === 1 ? 0 : 1]}. {spec.blurb}
        </p>
      </header>
      <Card className="overflow-hidden">
        {entries.length === 0 ? <EmptyState>{`No ${spec.nouns[1]} yet.`}</EmptyState> : null}
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.key} className="border-b border-border-soft">
              <Link
                href={codexPageHref({ kind, key: entry.key })}
                className="block px-4 py-3 font-ui text-nav text-name hover:bg-row-hover"
              >
                {entry.title}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export default function CodexKindPage({ params }: { params: KindParams }) {
  return (
    <PageShell mode="workspace">
      <div className="pb-20">
        <Suspense
          fallback={
            <div className="flex flex-col gap-4">
              <Skeleton label="Loading index" className="h-4 w-48" />
              <Skeleton aria-hidden="true" className="h-64 w-full rounded-card" />
            </div>
          }
        >
          <CodexKindIndex params={params} />
        </Suspense>
      </div>
    </PageShell>
  );
}
