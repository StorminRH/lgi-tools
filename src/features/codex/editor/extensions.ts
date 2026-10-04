import { mergeAttributes, Node, type AnyExtension, type Attributes } from '@tiptap/core';
import UniqueID from '@tiptap/extension-unique-id';
import StarterKit from '@tiptap/starter-kit';
import {
  CODEX_CALLOUT_LABELS,
  CODEX_NODES,
  isSafeHref,
  type CodexNodeAttrs,
  type CodexNodeName,
} from '../nodes';

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
    heading: { levels: [2, 3, 4] },
    link: {
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      defaultProtocol: 'https',
      isAllowedUri: (url) => isSafeHref(url),
    },
  }),
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
