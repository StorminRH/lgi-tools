import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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

export async function generateStaticParams() {
  return (await olderChangelogDocuments()).map(({ slug }) => ({ slug }));
}

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

export default async function ChangelogMasterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const document = await findOlderChangelogDocument(slug);
  if (!document) notFound();
  return (
    <div className="changelog">
      <MasterSection master={document.master} />
    </div>
  );
}
