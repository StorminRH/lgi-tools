'use client';

import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import {
  BoldIcon,
  BulletIcon,
  CalloutIcon,
  DataIcon,
  ItalicIcon,
  LinkIcon,
  NumberedIcon,
} from '../components/icons';
import { Input } from '@/components/ui/input';
import type { CodexSourceCatalogue } from '../components/CodexDataView';
import { isSafeHref } from '../nodes';
import type { CodexEditorNotice, CodexSubject } from '../subjects';
import { DataBlockPicker } from './DataBlockPicker';
import type { DataNode } from './data-block-picker-state';
import { EditorNotice } from './EditorNotice';
import { codexDraftKey, initialEditorBlocks, keepCodexDraft, takeConflictDraft } from './draft';
import { codexEditorExtensions, dataInsertion, editorBlocks } from './extensions';

export interface CodexEditorProps {
  readonly subject: CodexSubject;
  readonly newTitle: string | null;
  readonly baseRevisionId: string | null;
  readonly sectionId: string | null;
  readonly goneSectionId?: string | null;
  readonly initialBlocks: readonly unknown[];
  readonly notice: CodexEditorNotice | null;
  readonly catalogue: CodexSourceCatalogue;
  readonly onCancel: () => void;
}

function toolButtonClass(active: boolean | undefined, wide: boolean | undefined) {
  return cn(
    'h-8 justify-center gap-1.5 rounded-ctl border font-ui text-ui font-semibold',
    wide ? 'px-2.5' : 'w-8',
    active
      ? 'border-border-active bg-row-on text-isk shadow-card-edge'
      : 'border-transparent text-muted hover:bg-row-related hover:text-name',
  );
}

function ToolButton({
  label,
  active,
  onClick,
  children,
  wide,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Button variant="bare" aria-label={label} aria-pressed={active} onClick={onClick} className={toolButtonClass(active, wide)}>
      {children}
    </Button>
  );
}

const editorSurfaceClass = cn(
  'px-5 py-4',
  '[&_.ProseMirror]:min-h-32 [&_.ProseMirror]:outline-none!',
  '[&_table]:w-full [&_table]:border-collapse [&_table]:text-ui',
  '[&_td]:border [&_td]:border-border-soft [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:text-left [&_td]:align-top',
  '[&_th]:border [&_th]:border-border-soft [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:align-top',
  '[&_th]:bg-bg-deep [&_th]:text-muted',
  '[&_.codex-data-chip]:flex [&_.codex-data-chip]:cursor-grab [&_.codex-data-chip]:items-center [&_.codex-data-chip]:gap-2',
  '[&_.codex-data-chip]:rounded-ctl [&_.codex-data-chip]:border [&_.codex-data-chip]:border-dashed [&_.codex-data-chip]:border-border-active',
  '[&_.codex-data-chip]:bg-bg-deep [&_.codex-data-chip]:px-3 [&_.codex-data-chip]:py-2',
  '[&_.codex-data-chip]:font-data [&_.codex-data-chip]:text-ui [&_.codex-data-chip]:text-isk',
  '[&_span.codex-data-chip]:inline-flex [&_span.codex-data-chip]:px-1.5 [&_span.codex-data-chip]:py-0 [&_span.codex-data-chip]:align-baseline',
  '[&_.codex-data-chip.ProseMirror-selectednode]:border-solid [&_.codex-data-chip.ProseMirror-selectednode]:border-isk',
);

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px bg-border" />;

function useToolbarState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      h2: current?.isActive('heading', { level: 2 }) ?? false,
      h3: current?.isActive('heading', { level: 3 }) ?? false,
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      link: current?.isActive('link') ?? false,
      bullets: current?.isActive('bulletList') ?? false,
      numbers: current?.isActive('orderedList') ?? false,
      callout: current?.isActive('callout') ?? false,
    }),
  });
}

function LinkRow({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [href, setHref] = useState(() => String(editor.getAttributes('link').href ?? ''));
  const [problem, setProblem] = useState<string | null>(null);
  const apply = () => {
    const value = href.trim();
    if (value === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onClose();
      return;
    }
    if (!isSafeHref(value)) {
      setProblem('Use an https:// address or a site path such as /sites.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
    onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      apply();
    }
    if (event.key === 'Escape') onClose();
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-soft bg-row-hover px-3 py-2">
      <Input
        size="sm"
        aria-label="Link address"
        placeholder="https://… or /sites"
        value={href}
        onChange={(event) => setHref(event.target.value)}
        onKeyDown={onKeyDown}
        autoFocus
        className="min-w-0 flex-1"
      />
      <Button size="sm" variant="secondary" onClick={apply}>
        Apply
      </Button>
      <Button size="sm" variant="ghost" onClick={onClose}>
        Close
      </Button>
      {problem ? <p className="w-full font-ui text-ui text-dps-mid">{problem}</p> : null}
    </div>
  );
}

function Toolbar({
  editor,
  onLink,
  data,
  bar,
}: {
  editor: Editor | null;
  onLink: () => void;
  data: ReactNode;
  bar: RefObject<HTMLDivElement | null>;
}) {
  const state = useToolbarState(editor);
  const chain = () => editor?.chain().focus();
  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 rounded-t-card border-b border-border-soft bg-row-hover px-2 py-1.5"
    >
      <ToolButton label="Heading 2" wide active={state?.h2} onClick={() => chain()?.toggleHeading({ level: 2 }).run()}>
        H2
      </ToolButton>
      <ToolButton label="Heading 3" wide active={state?.h3} onClick={() => chain()?.toggleHeading({ level: 3 }).run()}>
        H3
      </ToolButton>
      <Divider />
      <ToolButton label="Bold" active={state?.bold} onClick={() => chain()?.toggleBold().run()}>
        <BoldIcon size={15} />
      </ToolButton>
      <ToolButton label="Italic" active={state?.italic} onClick={() => chain()?.toggleItalic().run()}>
        <ItalicIcon size={15} />
      </ToolButton>
      <ToolButton label="Link" active={state?.link} onClick={onLink}>
        <LinkIcon size={15} />
      </ToolButton>
      <Divider />
      <ToolButton label="Bulleted list" active={state?.bullets} onClick={() => chain()?.toggleBulletList().run()}>
        <BulletIcon size={15} />
      </ToolButton>
      <ToolButton label="Numbered list" active={state?.numbers} onClick={() => chain()?.toggleOrderedList().run()}>
        <NumberedIcon size={15} />
      </ToolButton>
      <ToolButton label="Callout" active={state?.callout} onClick={() => chain()?.toggleWrap('callout').run()}>
        <CalloutIcon size={15} />
      </ToolButton>
      <Divider />
      {data}
    </div>
  );
}

function insertDataNode(editor: Editor, node: DataNode) {
  const { at, content } = dataInsertion(editor.state.selection, node);
  editor.chain().focus().insertContentAt(at, content).run();
}

function EditorToolbar({ editor, catalogue }: { editor: Editor | null; catalogue: CodexSourceCatalogue }) {
  const [linking, setLinking] = useState(false);
  const [picking, setPicking] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  return (
    <>
      <Toolbar
        bar={bar}
        editor={editor}
        onLink={() => setLinking((open) => !open)}
        data={
          <DataBlockPicker
            catalogue={catalogue}
            open={picking}
            onOpenChange={setPicking}
            onInsert={(node) => editor && insertDataNode(editor, node)}
            trigger={
              <>
                <DataIcon size={15} />
                Data
              </>
            }
            triggerClassName={cn('inline-flex items-center', toolButtonClass(picking, true))}
            anchor={bar}
          />
        }
      />
      {linking && editor ? <LinkRow editor={editor} onClose={() => setLinking(false)} /> : null}
    </>
  );
}

function TargetFields({
  subject,
  baseRevisionId,
  sectionId,
  newTitle,
}: Pick<CodexEditorProps, 'subject' | 'baseRevisionId' | 'sectionId' | 'newTitle'>) {
  return (
    <>
      <input type="hidden" name="action" value="publish" />
      <input type="hidden" name="kind" value={subject.kind} />
      <input type="hidden" name="key" value={subject.key} />
      <input type="hidden" name="baseRevisionId" value={baseRevisionId ?? ''} />
      {sectionId === null ? null : <input type="hidden" name="sectionId" value={sectionId} />}
      {newTitle === null ? null : <input type="hidden" name="title" value={newTitle} />}
    </>
  );
}

function EditorFooter({
  summary,
  saveLabel,
  canSave,
  onCancel,
}: {
  summary: string;
  saveLabel: string;
  canSave: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-b-card border-t border-border-soft bg-row-hover px-4 py-3">
      <label className="flex flex-col gap-1.5">
        <span className="font-ui text-label font-semibold uppercase tracking-eyebrow text-muted">Edit summary</span>
        <Input
          size="sm"
          name="summary"
          maxLength={200}
          placeholder="Briefly describe the change"
          defaultValue={summary}
        />
      </label>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto font-ui text-ui text-faint">Publishes immediately · saved to history</span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={!canSave}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

const EDITOR_LABELS = {
  page: { text: 'Page text', save: 'Publish page' },
  section: { text: 'Section text', save: 'Save section' },
} as const;

function useDraftForm(storageKey: string, editor: Editor | null) {
  const [saving, setSaving] = useState(false);
  const blocksField = useRef<HTMLInputElement>(null);

  const save = (event: FormEvent<HTMLFormElement>) => {
    if (!editor || !blocksField.current) {
      event.preventDefault();
      return;
    }
    const blocks = editorBlocks(editor.getJSON());
    blocksField.current.value = JSON.stringify(blocks);
    keepCodexDraft(storageKey, { blocks, summary: String(new FormData(event.currentTarget).get('summary') ?? '') });
    setSaving(true);
  };

  return { blocksField, saving, save };
}

export function CodexEditor({
  subject,
  newTitle,
  baseRevisionId,
  sectionId,
  goneSectionId = null,
  initialBlocks,
  notice,
  catalogue,
  onCancel,
}: CodexEditorProps) {
  const storageKey = codexDraftKey(subject, sectionId);
  const [draft] = useState(() => takeConflictDraft(subject, sectionId, goneSectionId, notice !== null));
  const labels = sectionId === null ? EDITOR_LABELS.page : EDITOR_LABELS.section;

  const editor = useEditor({
    extensions: codexEditorExtensions,
    content: { type: 'doc', content: initialEditorBlocks(draft, initialBlocks, goneSectionId !== null) as JSONContent[] },
    immediatelyRender: false,
    autofocus: 'start',
    editorProps: {
      attributes: { class: 'codex-prose', 'aria-label': labels.text },
    },
    onCreate: () => performance.mark('codex-editor-ready'),
  });

  const { blocksField, saving, save } = useDraftForm(storageKey, editor);

  return (
    <form
      action="/api/admin/codex/revisions"
      method="post"
      onSubmit={save}
      data-codex-editor
      className="rounded-card border border-isk/30 bg-bg-deep/50 shadow-card-edge"
    >
      <TargetFields subject={subject} baseRevisionId={baseRevisionId} sectionId={sectionId} newTitle={newTitle} />
      <input ref={blocksField} type="hidden" name="blocks" />
      {notice ? <EditorNotice notice={notice} subject={subject} sectionId={sectionId} goneSectionId={goneSectionId} /> : null}
      <EditorToolbar editor={editor} catalogue={catalogue} />
      <div className={editorSurfaceClass}>
        <EditorContent editor={editor} />
      </div>
      <EditorFooter
        summary={draft?.summary ?? ''}
        saveLabel={labels.save}
        canSave={editor !== null && !saving}
        onCancel={onCancel}
      />
    </form>
  );
}
