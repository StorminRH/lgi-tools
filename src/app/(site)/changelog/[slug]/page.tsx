import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  findChangelogDocument,
  toChangelogDocuments,
  type ChangelogDocument,
} from '@/features/changelog/browser';
import { MasterSection } from '@/features/changelog/components/MasterSection';
import { loadChangelog } from '@/features/changelog/load';
import { buildPageMetadata } from '@/lib/page-metadata';

async function olderChangelogDocuments(): Promise<ChangelogDocument[]> {
  return toChangelogDocuments(await loadChangelog()).slice(1);
}

async function findOlderChangelogDocument(slug: string): Promise<ChangelogDocument | undefined> {
  return findChangelogDocument(await olderChangelogDocuments(), slug);
}

/**
 * Enumerates the canonical static parameter set for /changelog/[slug]; callers must treat the
 * returned slugs as build inputs.
 */
export async function generateStaticParams() {
  return (await olderChangelogDocuments()).map(({ slug }) => ({ slug }));
}

/**
 * Builds request-independent metadata for /changelog/[slug] from the route parameter and canonical
 * content source.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const document = await findOlderChangelogDocument(slug);
  if (!document) notFound();
  const { master } = document;
  const masterName = master.title ? `v${master.version} — ${master.title}` : `v${master.version}`;
  return buildPageMetadata({
    title: `${masterName} — Changelog`,
    description:
      master.summary[0] ?? `User-facing changes to LGI.tools in the v${master.version} releases.`,
    canonical: `/changelog/${document.slug}`,
  });
}

async function ChangelogMaster({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = await findOlderChangelogDocument(slug);
  if (!document) notFound();
  return (
    <div className="max-w-[820px]">
      <MasterSection master={document.master} />
    </div>
  );
}

function ChangelogMasterFallback() {
  return (
    <div className="flex max-w-[820px] flex-col gap-4">
      <Skeleton label="Loading changelog" className="h-8 w-40" />
      <Skeleton aria-hidden="true" className="h-4 w-full" />
      <Skeleton aria-hidden="true" className="h-4 w-5/6" />
      <Skeleton aria-hidden="true" className="h-48 w-full" />
    </div>
  );
}

/**
 * Renders the /changelog/[slug] route surface. The slug (`params`) is URL data —
 * isolated in Suspense so soft navigations between masters stay instant.
 */
export default function ChangelogMasterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<ChangelogMasterFallback />}>
      <ChangelogMaster params={params} />
    </Suspense>
  );
}
