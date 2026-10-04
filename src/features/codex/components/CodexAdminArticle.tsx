'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, Suspense, useState, type ReactNode } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { HistoryIcon, PencilIcon } from './icons';
import { Pill } from '@/components/ui/pill';
import { Skeleton } from '@/components/ui/skeleton';
import type { RenderedCodexSection } from '../render';
import { PAGE_SCOPE } from '../sections';
import { codexHistoryHref, codexPageHref, type CodexEditorNotice, type CodexSubject } from '../subjects';
import type { CodexSourceCatalogue } from './CodexDataView';
import { CodexPageLayout } from './CodexPageLayout';
import { CodexSectionFrame } from './CodexSectionFrame';
import { openCodexScope } from './editing-scope';

const CodexEditor = dynamic(() => import('../editor/CodexEditor').then((module) => module.CodexEditor), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

function EditorSkeleton() {
  return <Skeleton label="Loading editor" className="h-56 w-full rounded-card" />;
}

function PageActions({ subject, locked, onEdit }: { subject: CodexSubject; locked: boolean; onEdit: () => void }) {
  const history = (
    <>
      <HistoryIcon size={14} />
      History
    </>
  );
  return (
    <div className="flex items-center gap-2">
      {locked ? (
        <Button variant="secondary" size="sm" disabled>
          {history}
        </Button>
      ) : (
        <Link href={codexHistoryHref(subject)} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          {history}
        </Link>
      )}
      <Button variant="primary" size="sm" disabled={locked} onClick={onEdit}>
        <PencilIcon size={14} />
        Edit page
      </Button>
    </div>
  );
}

export function CodexAdminArticle({
  subject,
  newTitle,
  baseRevisionId,
  header,
  aside,
  footer,
  sections,
  initialScope,
  initialNotice,
  goneSectionId = null,
  catalogue,
}: {
  subject: CodexSubject;
  newTitle: string | null;
  baseRevisionId: string | null;
  header: ReactNode;
  aside: ReactNode;
  footer: ReactNode;
  sections: readonly RenderedCodexSection[];
  initialScope: string | null;
  initialNotice: CodexEditorNotice | null;
  goneSectionId?: string | null;
  catalogue: CodexSourceCatalogue;
}) {
  const router = useRouter();
  const [scope, setScope] = useState(initialScope);
  const [notice, setNotice] = useState(initialNotice);
  const locked = scope !== null;

  const open = (requested: string) => {
    const next = openCodexScope(scope, requested);
    if (next === scope) return;
    performance.mark('codex-editor-open');
    setScope(next);
    setNotice(null);
  };
  const cancel = () => {
    setScope(null);
    setNotice(null);
    if (newTitle !== null) router.push('/codex');
    else if (initialScope !== null) router.replace(codexPageHref(subject), { scroll: false });
  };
  const editor = (sectionId: string | null, blocks: readonly unknown[]) => (
    <Suspense fallback={<EditorSkeleton />}>
      <CodexEditor
        subject={subject}
        newTitle={newTitle}
        baseRevisionId={baseRevisionId}
        sectionId={sectionId}
        goneSectionId={sectionId === null && notice !== null ? goneSectionId : null}
        initialBlocks={blocks}
        notice={notice}
        catalogue={catalogue}
        onCancel={cancel}
      />
    </Suspense>
  );

  const sectionAction = (section: RenderedCodexSection) => {
    if (scope === section.id) return section.heading ? <Pill tone="green">Editing</Pill> : null;
    return (
      <Button
        variant="bare"
        aria-label={section.heading ? 'Edit section' : 'Edit introduction'}
        disabled={locked}
        onClick={() => open(section.id)}
        className="size-8 justify-center rounded-full border border-transparent text-faint hover:border-border hover:text-isk"
      >
        <PencilIcon size={15} />
      </Button>
    );
  };

  const article =
    scope === PAGE_SCOPE ? (
      editor(
        null,
        sections.flatMap((section) => (section.heading ? [section.heading, ...section.blocks] : section.blocks)),
      )
    ) : (
      <>
        {sections.map((section) => (
          <CodexSectionFrame
            key={section.id}
            id={section.id}
            title={section.title}
            action={sectionAction(section)}
            editing={scope === section.id}
          >
            {scope === section.id ? (
              editor(section.id, section.blocks)
            ) : (
              <Fragment key={section.id}>{section.body}</Fragment>
            )}
          </CodexSectionFrame>
        ))}
        {footer}
      </>
    );

  const actions =
    newTitle === null ? <PageActions subject={subject} locked={locked} onEdit={() => open(PAGE_SCOPE)} /> : null;

  return <CodexPageLayout header={header} actions={actions} article={article} aside={aside} />;
}
