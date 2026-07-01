import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocumentView } from '@/features/devlog/components/DocumentView';
import { loadDevlog } from '@/features/devlog/load';
import { documentSummary, findDocument, flattenDocuments, introDocument } from '@/features/devlog/parse';

// Every document except the Introduction (which lands at /devlog) is prerendered by
// slug (generateStaticParams enumerates them all); an unknown slug falls through to
// notFound(). Cache Components disallows the `dynamicParams` route segment config
// (it errors the build), so unknown-slug handling is the notFound() above, not
// `dynamicParams = false`.
export async function generateStaticParams() {
  const tree = await loadDevlog();
  const introSlug = introDocument(tree)?.slug;
  return flattenDocuments(tree)
    .filter((d) => d.slug !== introSlug)
    .map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = findDocument(await loadDevlog(), slug);
  if (!doc) return {};
  return {
    title: `${doc.title} — Under the Hood`,
    description: documentSummary(doc),
    alternates: { canonical: `/devlog/${doc.slug}` },
  };
}

export default async function DevlogDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = findDocument(await loadDevlog(), slug);
  if (!doc) notFound();
  return <DocumentView title={doc.title} blocks={doc.blocks} />;
}
