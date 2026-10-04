import { Editor, getSchema, type JSONContent } from '@tiptap/core';
import { expect, test } from 'vitest';
import { CODEX_CALLOUT_LABELS, CODEX_MARKS, CODEX_NODES } from '../nodes';
import type { DataNode } from './data-block-picker-state';
import { codexEditorExtensions, dataInsertion, editorBlocks, imageNode, videoNode } from './extensions';

const schema = getSchema(codexEditorExtensions);

test('the editor schema has exactly the registered nodes and marks', () => {
  expect(Object.keys(schema.nodes).filter((name) => name !== 'doc').sort()).toEqual(
    Object.keys(CODEX_NODES).sort(),
  );
  expect(Object.keys(schema.marks).sort()).toEqual(Object.keys(CODEX_MARKS).sort());
});

test('every registered attribute exists on its editor node', () => {
  for (const [name, spec] of Object.entries(CODEX_NODES)) {
    expect(Object.keys(schema.nodes[name]!.spec.attrs ?? {}), name).toEqual(
      expect.arrayContaining(Object.keys(spec.attrs.shape)),
    );
  }
});

test('nested nodes accept only their registered children', () => {
  expect(schema.nodes.blockquote!.spec.content).toBe('(paragraph|bulletList|orderedList)+');
  expect(schema.nodes.listItem!.spec.content).toBe('(paragraph|bulletList|orderedList)+');
  expect(schema.nodes.tableRow!.spec.content).toBe('(tableHeader|tableCell)+');
  expect(schema.nodes.callout!.spec.group).toBe('block');
  expect(schema.nodes.listItem!.spec.group).toBeUndefined();
});

test('editor JSON loses its null attributes on the way out', () => {
  expect(
    editorBlocks({
      content: [
        {
          type: 'orderedList',
          attrs: { id: 'list', start: 1, type: null },
          content: [{ type: 'listItem', attrs: { id: null }, content: [{ type: 'paragraph', attrs: { id: null } }] }],
        },
      ],
    }),
  ).toEqual([
    {
      type: 'orderedList',
      attrs: { id: 'list', start: 1 },
      content: [{ type: 'listItem', attrs: {}, content: [{ type: 'paragraph', attrs: {} }] }],
    },
  ]);
});

test('the editor shows the callout eyebrow from the shared label table', () => {
  expect(CODEX_CALLOUT_LABELS).toEqual({ tip: 'Tip', warning: 'Warning' });
  for (const [tone, label] of Object.entries(CODEX_CALLOUT_LABELS)) {
    const callout = schema.nodes.callout!.create(
      { tone },
      schema.nodes.paragraph!.create(null, schema.text('Hold range')),
    );
    expect(schema.nodes.callout!.spec.toDOM!(callout)).toEqual([
      'aside',
      { 'data-tone': tone, class: 'codex-callout' },
      ['span', { class: 'codex-callout-label', contenteditable: 'false' }, label],
      ['div', 0],
    ]);
  }
});

type EditorState = Editor['state'];
type Slice = ReturnType<EditorState['doc']['slice']>;

function editorState(content: JSONContent[]) {
  const editor = new Editor({ element: null, extensions: codexEditorExtensions, content: { type: 'doc', content } });
  let state = editor.state.reconfigure({ plugins: editor.extensionManager.plugins });
  editor.destroy();
  const uniqueId = state.plugins.find((plugin) =>
    (plugin.spec.key as { key?: string } | undefined)?.key?.startsWith('uniqueID$'),
  )!;
  return {
    apply: (build: (current: EditorState) => EditorState['tr']) => {
      state = state.applyTransaction(build(state)).state;
    },
    paste: (slice: Slice) => {
      uniqueId.props.handleDOMEvents!.paste!.call(uniqueId, null as never, null as never);
      return uniqueId.props.transformPasted!.call(uniqueId, slice, null as never, false);
    },
    ids: () => editorBlocks(state.doc.toJSON()).map((block) => (block as { attrs: { id: string } }).attrs.id),
    get state() {
      return state;
    },
  };
}

const textBlock = (type: string, id: string, text: string, attrs: object = {}) => ({
  type,
  attrs: { id, ...attrs },
  content: [{ type: 'text', text }],
});

test('splitting a paragraph keeps its id on the first half and gives the second a new one', () => {
  const editor = editorState([textBlock('paragraph', 'intro', 'Jump in cold.')]);
  editor.apply((state) => state.tr.split(9));

  const [first, second] = editor.ids();
  expect(first).toBe('intro');
  expect(second).toMatch(/^[0-9a-f-]{36}$/);
  expect(editor.state.doc.child(1).textContent).toBe('cold.');
});

test('pasting a copied paragraph and heading gives the copies new ids', () => {
  const editor = editorState([
    textBlock('heading', 'steps', 'Steps', { level: 2 }),
    textBlock('paragraph', 'intro', 'Jump in cold.'),
  ]);
  const end = editor.state.doc.content.size;
  const copied = editor.state.doc.slice(0, end);
  editor.apply((state) => state.tr.replaceRange(end, end, editor.paste(copied)));

  const ids = editor.ids();
  expect(ids.slice(0, 2)).toEqual(['steps', 'intro']);
  expect(ids).toHaveLength(4);
  expect(new Set(ids).size).toBe(4);
});

test('a data block is one selectable atom in the block group that keeps an empty field list', () => {
  const node = schema.nodes.dataBlock!;
  expect(node.spec.atom).toBe(true);
  expect(node.spec.group).toBe('block');
  const block = { type: 'dataBlock', attrs: { id: 'd', source: 'site', key: '20', fields: [], layout: 'card' } };
  expect(editorBlocks({ content: [block] })).toEqual([block]);
  expect(schema.nodeFromJSON(block).toJSON()).toEqual(block);
});

test('an inline data value is an atom in the inline group that a paragraph accepts beside text', () => {
  const node = schema.nodes.dataInline!;
  expect(node.spec.atom).toBe(true);
  expect(node.isInline).toBe(true);
  const inline = { type: 'dataInline', attrs: { source: 'wormholeType', key: 'C247', fields: ['totalMass'] } };
  const sentence = {
    type: 'paragraph',
    attrs: { id: 'p' },
    content: [{ type: 'text', text: 'A ' }, inline, { type: 'text', text: ' hole.' }],
  };
  expect(schema.nodeFromJSON(sentence).toJSON()).toEqual(sentence);
  expect(() => schema.nodeFromJSON(sentence).check()).not.toThrow();
});

test('data nodes parse back only from the editor chip, never from the reader markup', () => {
  const tags = (name: 'dataBlock' | 'dataInline') => schema.nodes[name]!.spec.parseDOM!.map((rule) => rule.tag);
  expect(tags('dataBlock')).toEqual(['div[data-codex-chip][data-source][data-key][data-layout]']);
  expect(tags('dataInline')).toEqual(['span[data-codex-chip][data-source][data-key]']);
});

const chip: DataNode = { type: 'dataInline', attrs: { source: 'wormholeType', key: 'C247', fields: ['totalMass'] } };

test('a heading holds text only, as the published page model does', () => {
  expect(schema.nodes.heading!.contentMatch.matchType(schema.nodes.dataInline!)).toBeNull();
  const heading = {
    type: 'heading',
    attrs: { id: 'h', level: 2 },
    content: [{ type: 'text', text: 'Mass ' }, chip],
  };
  expect(() => schema.nodeFromJSON(heading).check()).toThrow();
});

test('a heading still carries bold, italic, and link marks on its text', () => {
  const heading = {
    type: 'heading',
    attrs: { id: 'h', level: 3 },
    content: [{ type: 'text', text: 'Mass', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: '/codex' } }] }],
  };
  expect(() => schema.nodeFromJSON(heading).check()).not.toThrow();
});

test('an inline value picked inside a heading lands in a new paragraph after it', () => {
  const doc = schema.nodeFromJSON({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { id: 'h', level: 2 }, content: [{ type: 'text', text: 'Mass' }] },
      { type: 'paragraph', attrs: { id: 'p' }, content: [{ type: 'text', text: 'Body' }] },
    ],
  });
  const insertion = dataInsertion({ $from: doc.resolve(3), from: 3, to: 3 }, chip);
  expect(insertion).toEqual({ at: 6, content: { type: 'paragraph', content: [chip] } });
  const added = schema.nodeFromJSON(insertion.content);
  const next = doc.copy(doc.content.cut(0, 6).addToEnd(added).append(doc.content.cut(6)));
  expect(() => next.check()).not.toThrow();
  expect(next.child(1).toJSON()).toMatchObject({ type: 'paragraph', content: [chip] });
});

test('an inline value picked inside a paragraph replaces the selection in place', () => {
  const doc = schema.nodeFromJSON({
    type: 'doc',
    content: [{ type: 'paragraph', attrs: { id: 'p' }, content: [{ type: 'text', text: 'A hole' }] }],
  });
  expect(dataInsertion({ $from: doc.resolve(2), from: 2, to: 3 }, chip)).toEqual({
    at: { from: 2, to: 3 },
    content: chip,
  });
});

test('bold over an inline value marks the text around it and never the value', () => {
  const editor = new Editor({
    element: null,
    extensions: codexEditorExtensions,
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { id: 'p' }, content: [{ type: 'text', text: 'A ' }, chip, { type: 'text', text: ' hole' }] }],
    },
  });
  // A headless editor installs its plugins only when it mounts a view.
  editor.view.updateState(editor.state.reconfigure({ plugins: editor.extensionManager.plugins }));
  editor.chain().setNodeSelection(3).toggleBold().run();
  editor.chain().selectAll().toggleBold().run();
  expect(editor.state.doc.firstChild!.child(1).marks).toEqual([]);
  const bold = [{ type: 'bold' }];
  expect(editorBlocks(editor.getJSON())).toEqual([
    {
      type: 'paragraph',
      attrs: { id: 'p' },
      content: [
        { type: 'text', text: 'A ', marks: bold },
        chip,
        { type: 'text', text: ' hole', marks: bold },
      ],
    },
  ]);
  editor.destroy();
});

test('an image is one draggable atom that previews the 1280 variant and keeps its alt and caption', () => {
  const spec = schema.nodes.image!.spec;
  expect([spec.atom, spec.draggable, spec.selectable, spec.group]).toEqual([true, true, true, 'block']);
  const stem = 'https://s.public.blob.vercel-storage.com/codex/local/img/ab12';
  const inserted = imageNode({ id: 'asset-1', stem });
  const node = schema.nodeFromJSON({ ...inserted, attrs: { ...inserted.attrs, alt: 'Gila', caption: 'Wave 2' } });

  expect(spec.toDOM!(node)).toEqual([
    'figure',
    {
      'data-codex-image': '',
      'data-asset-id': 'asset-1',
      'data-alt': 'Gila',
      'data-caption': 'Wave 2',
      'data-src': stem,
      class: 'codex-image-node',
    },
    ['img', { src: `${stem}-1280.webp`, alt: 'Gila' }],
    ['figcaption', {}, 'Wave 2'],
  ]);
  expect(spec.toDOM!(schema.nodes.image!.create({ assetId: 'asset-1', alt: 'Gila' }))).toContainEqual([
    'div',
    { class: 'codex-image-missing' },
    'Image unavailable',
  ]);
});

test('a video is one draggable atom that the editor shows as a chip naming its provider and title', () => {
  const spec = schema.nodes.video!.spec;
  expect([spec.atom, spec.draggable, spec.selectable, spec.group]).toEqual([true, true, true, 'block']);
  const inserted = videoNode({ provider: 'youtube', videoId: 'dQw4w9WgXcQ' }, 'Full clear');
  expect(inserted).toEqual({ type: 'video', attrs: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'Full clear' } });

  expect(spec.toDOM!(schema.nodeFromJSON(inserted))).toEqual([
    'figure',
    {
      'data-codex-video': '',
      'data-provider': 'youtube',
      'data-video-id': 'dQw4w9WgXcQ',
      'data-title': 'Full clear',
      class: 'codex-data-chip',
    },
    'Video · YouTube · Full clear',
  ]);
});

test('a video leaves the editor as its block id, provider, id, and title', () => {
  const block = { type: 'video', attrs: { id: 'v1', provider: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'Full clear' } };
  const editor = new Editor({ element: null, extensions: codexEditorExtensions, content: { type: 'doc', content: [block] } });
  expect(editorBlocks(editor.getJSON())).toEqual([block]);
  editor.destroy();
});
