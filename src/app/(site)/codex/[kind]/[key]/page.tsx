import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CodexReaderView, CodexSubjectShell, describe, loadPage, type CodexParams } from './codex-subject';

export async function generateMetadata({ params }: { params: CodexParams }): Promise<Metadata> {
  const { kind, key } = await params;
  const { subject, page } = await loadPage(kind, key);
  if (!page) notFound();
  return describe(subject, page.title);
}

export async function CodexReader({ params }: { params: CodexParams }) {
  const { kind, key } = await params;
  const { subject, page } = await loadPage(kind, key);
  if (!page) notFound();
  return <CodexReaderView subject={subject} page={page} />;
}

export default function CodexSubjectPage({ params }: { params: CodexParams }) {
  return (
    <CodexSubjectShell>
      <CodexReader params={params} />
    </CodexSubjectShell>
  );
}
