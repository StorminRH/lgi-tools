'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RadioGroup, type RadioOption } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import type { CodexSourceCatalogue } from '@/features/codex/components/CodexDataView';
import { dropDraft, keepJsonDraft, parseDraft, peekRawDraft } from '@/features/codex/editor/draft';
import {
  codexMergeDraftKey,
  isMergeDraft,
  restoreMergeDraft,
  type CodexMergeChoice,
} from '@/features/codex/editor/merge-draft';

const CodexBlockEditor = dynamic(
  () => import('@/features/codex/editor/CodexEditor').then((module) => module.CodexBlockEditor),
  { ssr: false, loading: () => <Skeleton label="Loading editor" className="h-40 w-full rounded-card" /> },
);

export interface ConflictRow {
  readonly blockId: string;
  readonly columns: { readonly base: ReactNode; readonly head: ReactNode; readonly proposal: ReactNode };
  readonly headPresent: boolean;
  readonly proposalPresent: boolean;
  readonly initialBlocks: readonly unknown[];
}

const subscribeNever = () => () => {};

const COLUMN_LABELS = { base: 'Base', head: 'Page now', proposal: 'Suggestion' } as const;

const SIDE_LABELS = {
  head: { present: "Keep the page's version", absent: 'Leave it out (the page removed it)' },
  proposal: { present: 'Use the suggestion', absent: 'Leave it out (the suggestion removed it)' },
} as const;

const eyebrowClass = 'font-ui text-label font-semibold uppercase tracking-eyebrow text-muted';

function optionsFor(row: ConflictRow): RadioOption[] {
  return [
    { value: 'head', label: SIDE_LABELS.head[row.headPresent ? 'present' : 'absent'] },
    { value: 'proposal', label: SIDE_LABELS.proposal[row.proposalPresent ? 'present' : 'absent'] },
    { value: 'edit', label: 'Edit it by hand' },
  ];
}

function ChoiceFields({ blockId, choice }: { blockId: string; choice: CodexMergeChoice | undefined }) {
  if (choice === undefined) return null;
  const edited = typeof choice === 'object';
  return (
    <>
      <input type="hidden" name={`choice.${blockId}`} value={edited ? 'edit' : choice} />
      {edited ? <input type="hidden" name={`edit.${blockId}`} value={JSON.stringify(choice.blocks)} /> : null}
    </>
  );
}

function ConflictBlock({
  row,
  choice,
  catalogue,
  onChoose,
  onEdit,
}: {
  row: ConflictRow;
  choice: CodexMergeChoice | undefined;
  catalogue: CodexSourceCatalogue;
  onChoose: (value: string) => void;
  onEdit: (blocks: unknown[]) => void;
}) {
  const picked = choice === undefined ? null : typeof choice === 'object' ? 'edit' : choice;
  return (
    <div className="flex flex-col gap-3 border-t border-border-soft px-4 py-4">
      <ChoiceFields blockId={row.blockId} choice={choice} />
      <span className={eyebrowClass}>Block {row.blockId}</span>
      <div className="grid gap-3 md:grid-cols-3">
        {(['base', 'head', 'proposal'] as const).map((column) => (
          <div key={column} className="flex min-w-0 flex-col gap-1.5">
            <span className={eyebrowClass}>{COLUMN_LABELS[column]}</span>
            {row.columns[column]}
          </div>
        ))}
      </div>
      <RadioGroup label={`Resolve ${row.blockId}`} options={optionsFor(row)} value={picked} onValueChange={onChoose} />
      {typeof choice === 'object' ? (
        <CodexBlockEditor initialBlocks={choice.blocks} catalogue={catalogue} onChange={onEdit} />
      ) : null}
    </div>
  );
}

export function ConflictResolver({
  proposalId,
  headRevisionId,
  page,
  notice,
  catalogue,
  rows,
}: {
  proposalId: string;
  headRevisionId: string | null;
  page?: string;
  notice: string | null;
  catalogue: CodexSourceCatalogue;
  rows: readonly ConflictRow[];
}) {
  const key = codexMergeDraftKey(proposalId);
  const kept = useSyncExternalStore(subscribeNever, () => peekRawDraft(key), () => null);
  const [choices, setChoices] = useState<Record<string, CodexMergeChoice>>({});
  const [adopted, setAdopted] = useState(false);
  if (kept !== null && !adopted) {
    setAdopted(true);
    const restored = restoreMergeDraft(notice === null ? null : parseDraft(kept, isMergeDraft), headRevisionId);
    if (Object.keys(restored).length > 0) setChoices((current) => ({ ...restored, ...current }));
  }
  useEffect(() => {
    if (adopted) dropDraft(key);
  }, [adopted, key]);

  const choose = (row: ConflictRow) => (value: string) =>
    setChoices((current) => ({
      ...current,
      [row.blockId]:
        value === 'edit'
          ? typeof current[row.blockId] === 'object'
            ? current[row.blockId]!
            : { blocks: [...row.initialBlocks] }
          : (value as 'head' | 'proposal'),
    }));
  const edit = (row: ConflictRow) => (blocks: unknown[]) =>
    setChoices((current) => ({ ...current, [row.blockId]: { blocks } }));

  return (
    <form
      method="post"
      action="/api/admin/codex/proposals"
      onSubmit={() => keepJsonDraft(key, { headRevisionId, choices })}
      className="flex flex-col"
    >
      <input type="hidden" name="proposalId" value={proposalId} />
      <input type="hidden" name="headRevisionId" value={headRevisionId ?? ''} />
      {page === undefined ? null : <input type="hidden" name="page" value={page} />}
      {rows.length === 0 ? (
        <p className="border-t border-border-soft px-4 py-4 font-ui text-ui text-muted">
          Merges cleanly. The page changed elsewhere, and the suggestion fits around those edits.
        </p>
      ) : (
        rows.map((row) => (
          <ConflictBlock
            key={row.blockId}
            row={row}
            choice={choices[row.blockId]}
            catalogue={catalogue}
            onChoose={choose(row)}
            onEdit={edit(row)}
          />
        ))
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-border-soft px-4 py-4">
        <Button type="submit" name="action" value="approve" variant="primary">
          Approve and publish
        </Button>
      </div>
    </form>
  );
}
