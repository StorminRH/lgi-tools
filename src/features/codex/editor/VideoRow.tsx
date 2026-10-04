'use client';

import { useEditorState, type Editor } from '@tiptap/react';
import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CODEX_VIDEO_PROVIDERS, parseCodexVideoUrl, type CodexVideoProvider } from '../video';
import { blockInsertPosition, requiredTextProblem } from './block-select';
import { videoNode } from './extensions';
import { RequiredField, useRequiredFieldFocus, type RequiredFocus } from './RequiredField';

const ROW = 'flex flex-wrap items-center gap-2 border-b border-border-soft bg-row-hover px-3 py-2';

export function VideoInsertRow({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const insert = () => {
    const ref = parseCodexVideoUrl(link);
    if (!ref) {
      setProblem('Paste a YouTube or Twitch video link.');
      return;
    }
    if (title.trim() === '') {
      setProblem('Give the video a title.');
      return;
    }
    editor.chain().focus().insertContentAt(blockInsertPosition(editor), videoNode(ref, title.trim())).run();
    onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      insert();
    }
    if (event.key === 'Escape') onClose();
  };
  return (
    <div className={ROW}>
      <Input
        size="sm"
        aria-label="Video link"
        placeholder="YouTube or Twitch link"
        value={link}
        onChange={(event) => setLink(event.target.value)}
        onKeyDown={onKeyDown}
        autoFocus
        className="min-w-0 flex-1"
      />
      <Input
        size="sm"
        aria-label="Video title"
        placeholder="Title"
        value={title}
        maxLength={200}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1"
      />
      <Button size="sm" variant="secondary" onClick={insert}>
        Insert
      </Button>
      <Button size="sm" variant="ghost" onClick={onClose}>
        Close
      </Button>
      {problem ? <p className="w-full font-ui text-ui text-dps-mid">{problem}</p> : null}
    </div>
  );
}

export function VideoRow({
  editor,
  focus,
}: {
  editor: Editor;
  focus: RequiredFocus;
}) {
  const titleInput = useRequiredFieldFocus(editor, focus);
  const attrs = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current.getAttributes('video') as { provider?: CodexVideoProvider; videoId?: string; title?: string },
  });
  const title = attrs.title ?? '';
  return (
    <div className={ROW}>
      <RequiredField
        inputRef={titleInput}
        label="Video title (required)"
        placeholder="Title"
        value={title}
        maxLength={200}
        problem={requiredTextProblem(focus.blocked, 'video', title)}
        onChange={(value) => editor.commands.updateAttributes('video', { title: value })}
      />
      {attrs.provider ? (
        <span className="font-data text-ui text-muted">
          {CODEX_VIDEO_PROVIDERS[attrs.provider].label} · {attrs.videoId}
        </span>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().deleteSelection().run()}>
        Remove
      </Button>
    </div>
  );
}
