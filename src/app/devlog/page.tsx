import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { buildDevlogArticleJsonLd } from '@/features/devlog/article-json-ld';
import { DocumentView } from '@/features/devlog/components/DocumentView';
import { loadDevlog } from '@/features/devlog/load';
import { introDocument } from '@/features/devlog/parse';
import { buildPageMetadata } from '@/lib/page-metadata';

/** Static search and social metadata for the /devlog route. */
export const metadata = buildPageMetadata({
  title: 'Under the Hood',
  description:
    'A dev log for LGI.tools — how an EVE Online tool was built with AI, and the rails that keep it honest.',
  canonical: '/devlog',
});

/**
 * The landing document (Introduction). Content is the deploy-static dev log, so the
 * route prerenders as the static shell.
 */
export default async function DevlogIndexPage() {
  const doc = introDocument(await loadDevlog());
  if (!doc) notFound();
  return (
    <>
      <JsonLd data={buildDevlogArticleJsonLd(doc, '/devlog')} />
      <DocumentView title={doc.title} blocks={doc.blocks} />
    </>
  );
}
