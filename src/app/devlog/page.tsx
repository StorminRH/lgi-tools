import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocumentView } from '@/features/devlog/components/DocumentView';
import { loadDevlog } from '@/features/devlog/load';
import { introDocument } from '@/features/devlog/parse';

export const metadata: Metadata = {
  title: 'Under the Hood',
  description:
    'A dev log for LGI.tools — how an EVE Online tool was built with AI, and the rails that keep it honest.',
  alternates: { canonical: '/devlog' },
};

// The landing document (Introduction). Content is the deploy-static dev log, so the
// route prerenders as the static shell.
export default async function DevlogIndexPage() {
  const doc = introDocument(await loadDevlog());
  if (!doc) notFound();
  return <DocumentView title={doc.title} blocks={doc.blocks} />;
}
