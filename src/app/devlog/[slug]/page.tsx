import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
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

/**
 * Renders the /devlog/[slug] route surface and owns its page-level composition, metadata boundary,
 * and fallback presentation.
 */
export default async function DevlogDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
