import {
  mergeAttributes,
  Node,
  type AnyExtension,
  type Attributes,
  type Editor,
  type JSONContent,
  type Range,
} from '@tiptap/core';
import Heading from '@tiptap/extension-heading';
import { Plugin } from '@tiptap/pm/state';
import UniqueID from '@tiptap/extension-unique-id';
import StarterKit from '@tiptap/starter-kit';
import {
  CODEX_CALLOUT_LABELS,
  CODEX_NODES,
  isSafeHref,
  type CodexNodeAttrs,
  type CodexNodeName,
} from '../nodes';
import type { DataNode } from './data-block-picker-state';

const TOP_LEVEL = (Object.keys(CODEX_NODES) as CodexNodeName[]).filter((name) => CODEX_NODES[name].topLevel);

function contentOf(name: CodexNodeName): string {
  const { content } = CODEX_NODES[name];
  return Array.isArray(content) ? `(${content.join('|')})+` : '';
}

const idAttribute = {
  default: null,
  parseHTML: (element: HTMLElement) => element.dataset.id ?? null,
  renderHTML: (attributes: Record<string, unknown>) => (attributes.id == null ? {} : { 'data-id': attributes.id }),
};

const spanAttribute = (name: 'colspan' | 'rowspan') => ({
  default: 1,
  parseHTML: (element: HTMLElement) => Number(element.getAttribute(name) ?? 1) || 1,
  renderHTML: (attributes: Record<string, unknown>) =>
    attributes[name] === 1 ? {} : { [name]: attributes[name] },
});

function registryNode(
  name: CodexNodeName,
  tag: string,
  options: { attributes?: Attributes; inner?: 'tbody' } = {},
) {
  const spec = CODEX_NODES[name];
  return Node.create({
    name,
    group: spec.topLevel ? 'block' : undefined,
    content: contentOf(name),
    defining: spec.topLevel,
    isolating: name === 'tableCell' || name === 'tableHeader',
    addAttributes: () => ({
      ...(!spec.topLevel && 'id' in spec.attrs.shape ? { id: idAttribute } : {}),
      ...options.attributes,
    }),
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes }) =>
      options.inner ? [tag, HTMLAttributes, [options.inner, 0]] : [tag, HTMLAttributes, 0],
  });
}

const cellAttributes = { colspan: spanAttribute('colspan'), rowspan: spanAttribute('rowspan') };

const dataAttribute = (name: 'source' | 'key' | 'layout') => ({
  default: null,
  parseHTML: (element: HTMLElement) => element.dataset[name] ?? null,
  renderHTML: (attributes: Record<string, unknown>) => ({ [`data-${name}`]: attributes[name] }),
});

function parseFields(raw: string | undefined): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(value) ? value.filter((field): field is string => typeof field === 'string') : [];
  } catch {
    return [];
  }
}

const fieldsAttribute = {
  default: [],
  parseHTML: (element: HTMLElement) => parseFields(element.dataset.fields),
  renderHTML: (attributes: Record<string, unknown>) => ({ 'data-fields': JSON.stringify(attributes.fields ?? []) }),
};

const dataRefAttributes = { source: dataAttribute('source'), key: dataAttribute('key'), fields: fieldsAttribute };

const chipText = (attrs: Record<string, unknown>, extra: string[] = []) =>
  ['Data', attrs.source, attrs.key, ...extra].join(' · ');

const dataBlock = registryNode('dataBlock', 'div', {
  attributes: { ...dataRefAttributes, layout: dataAttribute('layout') },
}).extend({
  atom: true,
  selectable: true,
  draggable: true,
  parseHTML: () => [{ tag: 'div[data-codex-chip][data-source][data-key][data-layout]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-codex-chip': '', class: 'codex-data-chip' }),
    chipText(node.attrs, [String(node.attrs.layout)]),
  ],
});

const dataInline = registryNode('dataInline', 'span', { attributes: dataRefAttributes }).extend({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'span[data-codex-chip][data-source][data-key]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes(HTMLAttributes, { 'data-codex-chip': '', class: 'codex-data-chip' }),
    chipText(node.attrs),
  ],
  // ProseMirror lets a mark land on an inline chip, but the page model keeps marks on text only.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _previous, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const strip = state.tr;
          state.doc.descendants((node, position) => {
            if (node.type.name === this.name && node.marks.length > 0) strip.removeMark(position, position + node.nodeSize);
          });
          return strip.docChanged ? strip : null;
        },
      }),
    ];
  },
});

type StarterKitNode = 'paragraph' | 'heading' | 'bulletList' | 'orderedList' | 'horizontalRule' | 'text';

const REGISTRY_NODES: Record<Exclude<CodexNodeName, StarterKitNode>, AnyExtension> = {
  listItem: registryNode('listItem', 'li').extend({
    addKeyboardShortcuts() {
      return {
        Enter: () => this.editor.commands.splitListItem(this.name),
        Tab: () => this.editor.commands.sinkListItem(this.name),
        'Shift-Tab': () => this.editor.commands.liftListItem(this.name),
      };
    },
  }),
  blockquote: registryNode('blockquote', 'blockquote'),
  callout: registryNode('callout', 'aside', {
    attributes: {
      tone: {
        default: 'tip',
        parseHTML: (element: HTMLElement) => (element.dataset.tone === 'warning' ? 'warning' : 'tip'),
        renderHTML: (attributes: Record<string, unknown>) => ({ 'data-tone': attributes.tone }),
      },
    },
  }).extend({
    parseHTML: () => [{ tag: 'aside' }, { tag: 'span.codex-callout-label', ignore: true }],
    renderHTML: ({ node, HTMLAttributes }) => [
      'aside',
      mergeAttributes(HTMLAttributes, { class: 'codex-callout' }),
      [
        'span',
        { class: 'codex-callout-label', contenteditable: 'false' },
        CODEX_CALLOUT_LABELS[(node.attrs as CodexNodeAttrs<'callout'>).tone],
      ],
      ['div', 0],
    ],
  }),
  table: registryNode('table', 'table', { inner: 'tbody' }),
  tableRow: registryNode('tableRow', 'tr'),
  tableHeader: registryNode('tableHeader', 'th', { attributes: cellAttributes }),
  tableCell: registryNode('tableCell', 'td', { attributes: cellAttributes }),
  dataBlock,
  dataInline,
};

export const codexEditorExtensions: AnyExtension[] = [
  StarterKit.configure({
    blockquote: false,
    listItem: false,
    codeBlock: false,
    hardBreak: false,
    strike: false,
    underline: false,
    trailingNode: false,
    heading: false,
    link: {
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      defaultProtocol: 'https',
      isAllowedUri: (url) => isSafeHref(url),
    },
  }),
  Heading.extend({ content: 'text*' }).configure({ levels: [2, 3, 4] }),
  ...Object.values(REGISTRY_NODES),
  UniqueID.configure({ types: TOP_LEVEL }),
];

function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== null && entry !== undefined)
      .map(([key, entry]) => [key, withoutNulls(entry)]),
  );
}

export function editorBlocks(json: { content?: unknown[] }): unknown[] {
  return (json.content ?? []).map(withoutNulls);
}

export function dataInsertion(
  selection: Pick<Editor['state']['selection'], '$from' | 'from' | 'to'>,
  node: DataNode,
): { at: number | Range; content: JSONContent } {
  const { $from, from, to } = selection;
  if (node.type === 'dataBlock') return { at: to, content: node };
  if ($from.parent.type.name === 'paragraph') return { at: { from, to }, content: node };
  return { at: $from.depth > 0 ? $from.after() : to, content: { type: 'paragraph', content: [node] } };
}
