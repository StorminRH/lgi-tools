import { Editor } from '@tiptap/core';
import { expect, test } from 'vitest';
import { blockedBy, blockInsertPosition, firstBlockMissingText, requiredTextProblem } from './block-select';
import { codexEditorExtensions, videoNode } from './extensions';

const paragraph = { type: 'paragraph' };

test('finds the first image without alt text or video without a title', () => {
  expect(firstBlockMissingText([paragraph, { type: 'image', attrs: { assetId: 'x', alt: '' } }])).toEqual({ type: 'image', index: 1 });
  expect(firstBlockMissingText([{ type: 'image', attrs: { assetId: 'x', alt: '   ' } }])).toEqual({ type: 'image', index: 0 });
  expect(firstBlockMissingText([paragraph, { type: 'video', attrs: { title: '  ' } }])).toEqual({ type: 'video', index: 1 });
});

test('finds nothing when every image and video is described', () => {
  expect(
    firstBlockMissingText([
      paragraph,
      { type: 'image', attrs: { assetId: 'x', alt: 'Gila' } },
      { type: 'video', attrs: { title: 'Full clear' } },
    ]),
  ).toBeNull();
});

test('names the block a save problem is about', () => {
  expect(blockedBy('Add alt text to every image before saving')).toBe('image');
  expect(blockedBy('Add a title to every video before saving')).toBe('video');
  expect(blockedBy('Something else')).toBeNull();
  expect(blockedBy(null)).toBeNull();
});

test('a blocked save shows its message only on the empty field of the block it is about', () => {
  expect(requiredTextProblem('video', 'video', '  ')).toBe('Add a title to every video before saving');
  expect(requiredTextProblem('image', 'image', '')).toBe('Add alt text to every image before saving');
  expect(requiredTextProblem('video', 'video', 'Full clear')).toBeNull();
  expect(requiredTextProblem('image', 'video', '')).toBeNull();
  expect(requiredTextProblem(null, 'image', '')).toBeNull();
});

test('a video inserted from inside a list item goes after the whole list', () => {
  const item = (id: string, text: string) => ({
    type: 'listItem',
    attrs: { id },
    content: [{ type: 'paragraph', attrs: { id: null }, content: [{ type: 'text', text }] }],
  });
  const list = { type: 'bulletList', attrs: { id: 'list' }, content: [item('a', 'Align'), item('b', 'Warp'), item('c', 'Dock')] };
  const editor = new Editor({ element: null, extensions: codexEditorExtensions, content: { type: 'doc', content: [list] } });
  let caret = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === 'Warp') caret = pos + node.nodeSize;
  });
  editor.commands.setTextSelection(caret);

  editor.commands.insertContentAt(blockInsertPosition(editor), videoNode({ provider: 'youtube', videoId: 'dQw4w9WgXcQ' }, 'Full clear'));

  expect(editor.getJSON()).toEqual({
    type: 'doc',
    content: [
      list,
      { type: 'video', attrs: { id: null, provider: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'Full clear' } },
    ],
  });
  editor.destroy();
});
