import { Editor, getSchema, type JSONContent } from '@tiptap/core';
import { expect, test } from 'vitest';
import { CODEX_CALLOUT_LABELS, CODEX_MARKS, CODEX_NODES } from '../nodes';
import { codexEditorExtensions, editorBlocks } from './extensions';

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
