import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { JsonLd } from '@/components/composition/JsonLd';
import { Skeleton } from '@/components/ui/skeleton';
import { buildDevlogArticleJsonLd } from '@/features/devlog/article-json-ld';
import { DocumentView } from '@/features/devlog/components/DocumentView';
import { loadDevlog } from '@/features/devlog/load';
import { documentSummary, findDocument, flattenDocuments, introDocument } from '@/features/devlog/parse';
import { buildPageMetadata } from '@/lib/page-metadata';

/**
 * Every document except the Introduction (which lands at /devlog) is prerendered by
 * slug (generateStaticParams enumerates them all); an unknown slug falls through to
 * notFound(). Cache Components disallows the `dynamicParams` route segment config
 * (it errors the build), so unknown-slug handling is the notFound() above, not
 * `dynamicParams = false`.
 */
export async function generateStaticParams() {
  const tree = await loadDevlog();
  const introSlug = introDocument(tree)?.slug;
  return flattenDocuments(tree)
    .filter((d) => d.slug !== introSlug)
    .map((d) => ({ slug: d.slug }));
}

/**
 * Builds request-independent metadata for /devlog/[slug] from the route parameter and canonical
 * content source.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = findDocument(await loadDevlog(), slug);
  if (!doc) return {};
  return buildPageMetadata({
    title: `${doc.title} — Under the Hood`,
    description: documentSummary(doc),
    canonical: `/devlog/${doc.slug}`,
  });
}

async function DevlogDocument({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = findDocument(await loadDevlog(), slug);
  if (!doc) notFound();
  return (
    <>
      <JsonLd data={buildDevlogArticleJsonLd(doc, `/devlog/${doc.slug}`)} />
      <DocumentView title={doc.title} blocks={doc.blocks} />
    </>
  );
}

function DevlogDocumentFallback() {
  return (
    <div className="flex w-full flex-col gap-4">
      <Skeleton label="Loading document" className="h-8 w-2/3 max-w-md" />
      <Skeleton aria-hidden="true" className="h-4 w-full" />
      <Skeleton aria-hidden="true" className="h-4 w-5/6" />
      <Skeleton aria-hidden="true" className="h-4 w-4/5" />
      <Skeleton aria-hidden="true" className="h-40 w-full" />
    </div>
  );
}

/**
 * Renders the /devlog/[slug] route surface. The slug (`params`) is URL data — it
 * stays below a Suspense boundary so soft navigations between documents stay
 * instant (shared layout chrome + skeleton) while the cached document streams.
 */
export default function DevlogDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<DevlogDocumentFallback />}>
      <DevlogDocument params={params} />
    </Suspense>
  );
}
