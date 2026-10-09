import { Editor } from '@tiptap/core';
import { expect, test } from 'vitest';
import { codexEditorExtensions } from './extensions';
import { insertImage } from './ImageControls';

const ASSET = 'aaaaaaaa-0000-4000-8000-000000000001';
const stem = 'https://s.public.blob.vercel-storage.com/codex/local/img/ab12';

test('pasting an image already in the section selects the new copy and leaves the first alt alone', () => {
  const editor = new Editor({
    element: null,
    extensions: codexEditorExtensions,
    content: {
      type: 'doc',
      content: [
        { type: 'image', attrs: { id: 'first', assetId: ASSET, alt: 'first alt', caption: '', src: stem } },
        { type: 'paragraph', attrs: { id: 'para' }, content: [{ type: 'text', text: 'Then warp out.' }] },
      ],
    },
  });
  editor.commands.focus('end');

  insertImage(editor, { id: ASSET, stem });
  editor.commands.updateAttributes('image', { alt: 'second alt' });

  const images = editor.getJSON().content!.filter((block) => block.type === 'image');
  expect(images.map((block) => [block.attrs!.assetId, block.attrs!.alt])).toEqual([
    [ASSET, 'first alt'],
    [ASSET, 'second alt'],
  ]);
  expect(images[1]!.attrs!.id).not.toBe('first');
  editor.destroy();
});

test('pasting an image inside a list item puts it after the whole list', () => {
  const item = (id: string, text: string) => ({
    type: 'listItem',
    attrs: { id },
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  const list = { type: 'bulletList', attrs: { id: 'list' }, content: [item('a', 'Align'), item('b', 'Warp'), item('c', 'Dock')] };
  const editor = new Editor({ element: null, extensions: codexEditorExtensions, content: { type: 'doc', content: [list] } });
  let caret = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === 'Warp') caret = pos + node.nodeSize;
  });
  editor.commands.setTextSelection(caret);

  insertImage(editor, { id: ASSET, stem });

  const text = (id: string, words: string) => ({
    type: 'listItem',
    attrs: { id },
    content: [{ type: 'paragraph', attrs: { id: null }, content: [{ type: 'text', text: words }] }],
  });
  expect(editor.getJSON()).toEqual({
    type: 'doc',
    content: [
      { type: 'bulletList', attrs: { id: 'list' }, content: [text('a', 'Align'), text('b', 'Warp'), text('c', 'Dock')] },
      { type: 'image', attrs: { id: expect.any(String), assetId: ASSET, alt: '', caption: '', src: stem } },
    ],
  });
  editor.destroy();
});
