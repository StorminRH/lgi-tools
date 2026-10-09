import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listCodexEntries } from '@/composition/codex-templates';
import { CODEX_SUBJECT_KINDS, CODEX_SUBJECTS } from '@/features/codex/subjects';
import {
  CodexReaderView,
  CodexSubjectShell,
  describe,
  loadPage,
  loadReaderAssets,
  type CodexParams,
} from './codex-subject';

export async function generateStaticParams(): Promise<{ kind: string; key: string }[]> {
  const kinds = CODEX_SUBJECT_KINDS.filter((kind) => CODEX_SUBJECTS[kind].entity);
  const entries = await Promise.all(
    kinds.map(async (kind) => (await listCodexEntries(kind)).map(({ key }) => ({ kind, key }))),
  );
  return entries.flat();
}

export async function generateMetadata({ params }: { params: CodexParams }): Promise<Metadata> {
  const { kind, key } = await params;
  const { subject, page, template } = await loadPage(kind, key);
  if (!page) notFound();
  return describe(subject, page.title, template?.description);
}

export async function CodexReader({ params }: { params: CodexParams }) {
  const { kind, key } = await params;
  const { subject, page, credits } = await loadPage(kind, key);
  if (!page) notFound();
  const assets = await loadReaderAssets(subject, page);
  return <CodexReaderView subject={subject} page={page} credits={credits} assets={assets} />;
}

export default function CodexSubjectPage({ params }: { params: CodexParams }) {
  return (
    <CodexSubjectShell>
      <CodexReader params={params} />
    </CodexSubjectShell>
  );
}
