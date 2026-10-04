'use client';

import { useEditorState, type Editor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingLabel } from '@/components/ui/loading-label';
import { CODEX_UPLOAD_CONTENT_TYPES } from '../constants';
import { blockInsertPosition, requiredTextProblem, selectBlock } from './block-select';
import { imageNode } from './extensions';
import { imageFileFrom, uploadCodexImage, type ImageUploadState } from './image-upload';
import { RequiredField, useRequiredFieldFocus, type RequiredFocus } from './RequiredField';

const IDLE: ImageUploadState = { phase: 'idle' };

const PHASE_LABELS = {
  shrinking: 'Preparing the image…',
  uploading: 'Uploading the image…',
  finalizing: 'Making screen-sized copies…',
} as const;

export function insertImage(editor: Editor, asset: { id: string; stem: string }): void {
  const node = imageNode(asset);
  editor.chain().focus().insertContentAt(blockInsertPosition(editor), node).run();
  selectBlock(editor, 'image', (attrs) => attrs.id === node.attrs.id);
}

export function useImageDrops() {
  const start = useRef<(file: File) => void>(() => {});
  return useMemo(() => {
    const take = (data: DataTransfer | null) => {
      const file = imageFileFrom(data);
      if (file) start.current(file);
      return file !== null;
    };
    return {
      start,
      handlePaste: (_view: unknown, event: ClipboardEvent) => take(event.clipboardData),
      handleDrop: (_view: unknown, event: DragEvent, _slice: unknown, moved: boolean) => !moved && take(event.dataTransfer),
    };
  }, []);
}

export function useImageUpload(editor: Editor | null, uploadPrefix: string, dropsRef?: RefObject<(file: File) => void>) {
  const [state, setState] = useState<ImageUploadState>(IDLE);
  const inFlight = useRef(false);
  const start = useCallback(
    async (file: File) => {
      if (!editor || inFlight.current) return;
      inFlight.current = true;
      performance.mark('codex-image-paste');
      const outcome = await uploadCodexImage(file, uploadPrefix, (phase) => setState({ phase }));
      inFlight.current = false;
      if (!outcome.ok) {
        setState({ phase: 'failed', message: outcome.message });
        return;
      }
      setState(IDLE);
      insertImage(editor, outcome.asset);
      performance.mark('codex-image-preview');
    },
    [editor, uploadPrefix],
  );
  useEffect(() => {
    if (dropsRef) dropsRef.current = (file) => void start(file);
  }, [dropsRef, start]);
  const pick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = CODEX_UPLOAD_CONTENT_TYPES.join(',');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void start(file);
    });
    input.click();
  }, [start]);
  const busy = state.phase !== 'idle' && state.phase !== 'failed';
  return { state, busy, pick, dismiss: () => setState(IDLE) };
}

export function UploadLine({ state, onDismiss }: { state: ImageUploadState; onDismiss: () => void }) {
  if (state.phase === 'idle') return null;
  if (state.phase === 'failed') {
    return (
      <div className="flex items-center gap-2 border-b border-border-soft bg-row-hover px-3 py-2 font-ui text-ui text-dps-mid">
        <span className="flex-1">{state.message}</span>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Close
        </Button>
      </div>
    );
  }
  return (
    <div className="border-b border-border-soft bg-row-hover px-3 py-2">
      <LoadingLabel label={PHASE_LABELS[state.phase]} />
    </div>
  );
}

export function ImageRow({
  editor,
  focus,
}: {
  editor: Editor;
  focus: RequiredFocus;
}) {
  const altInput = useRequiredFieldFocus(editor, focus);
  const attrs = useEditorState({
    editor,
    selector: ({ editor: current }) => current.getAttributes('image') as { alt?: string; caption?: string },
  });
  const alt = attrs.alt ?? '';
  const update = (name: 'alt' | 'caption', value: string) => {
    editor.commands.updateAttributes('image', { [name]: value });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-soft bg-row-hover px-3 py-2">
      <RequiredField
        inputRef={altInput}
        label="Alt text (required)"
        placeholder="Alt text: what the screenshot shows"
        value={alt}
        maxLength={300}
        problem={requiredTextProblem(focus.blocked, 'image', alt)}
        autoFocus
        onChange={(value) => update('alt', value)}
      />
      <Input
        size="sm"
        aria-label="Caption"
        placeholder="Caption (optional)"
        value={attrs.caption ?? ''}
        maxLength={300}
        onChange={(event) => update('caption', event.target.value)}
        className="min-w-0 flex-1"
      />
      <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().deleteSelection().run()}>
        Remove
      </Button>
    </div>
  );
}
