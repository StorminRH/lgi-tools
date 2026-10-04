import { Fragment, type ReactNode } from 'react';
import { DocTable } from '@/components/ui/static-table';
import { CodexSectionFrame } from './components/CodexSectionFrame';
import type { CodexBlockNode, CodexDoc, CodexMark, CodexNode, CodexTextNode } from './doc';
import {
  CODEX_CALLOUT_LABELS,
  type CodexInjectedNodeName,
  type CodexMarkName,
  type CodexNodeAttrs,
  type CodexNodeName,
} from './nodes';
import { codexSections, isBlankSection, type CodexSection } from './sections';

type BlockName = Exclude<CodexNodeName, 'text'>;
type BuiltinName = Exclude<BlockName, CodexInjectedNodeName>;
export type NodeRenderer<K extends CodexNodeName> = (props: {
  attrs: CodexNodeAttrs<K>;
  children: ReactNode;
}) => ReactNode;
type AnyRenderer = (props: { attrs: unknown; children: ReactNode }) => ReactNode;

export type CodexInjectedComponents = {
  [K in CodexInjectedNodeName]: NodeRenderer<K>;
};

function spans({ colspan, rowspan }: CodexNodeAttrs<'tableCell'>) {
  return {
    colSpan: colspan > 1 ? colspan : undefined,
    rowSpan: rowspan > 1 ? rowspan : undefined,
  };
}

const BLOCKS: { [K in BuiltinName]: NodeRenderer<K> } = {
  paragraph: ({ children }) => <p>{children}</p>,
  heading: ({ attrs, children }) => {
    const Tag = `h${attrs.level}` as const;
    return <Tag id={attrs.id}>{children}</Tag>;
  },
  bulletList: ({ children }) => <ul>{children}</ul>,
  orderedList: ({ attrs, children }) => (
    <ol start={attrs.start === 1 ? undefined : attrs.start}>{children}</ol>
  ),
  listItem: ({ children }) => <li>{children}</li>,
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
  callout: ({ attrs, children }) => (
    <aside className="codex-callout" data-tone={attrs.tone}>
      <span className="codex-callout-label">{CODEX_CALLOUT_LABELS[attrs.tone]}</span>
      {children}
    </aside>
  ),
  table: ({ children }) => <DocTable>{children}</DocTable>,
  tableRow: ({ children }) => <tr>{children}</tr>,
  tableHeader: ({ attrs, children }) => <th {...spans(attrs)}>{children}</th>,
  tableCell: ({ attrs, children }) => <td {...spans(attrs)}>{children}</td>,
  horizontalRule: () => <hr />,
};

const MARKS: Record<CodexMarkName, (attrs: CodexMark['attrs'], children: ReactNode) => ReactNode> = {
  bold: (_, children) => <strong>{children}</strong>,
  italic: (_, children) => <em>{children}</em>,
  code: (_, children) => <code>{children}</code>,
  link: ({ href }, children) =>
    href?.startsWith('/') ? (
      <a href={href}>{children}</a>
    ) : (
      <a href={href} rel="nofollow noopener noreferrer">
        {children}
      </a>
    ),
};

function renderText(node: CodexTextNode): ReactNode {
  return node.marks.reduceRight<ReactNode>(
    (children, mark) => MARKS[mark.type](mark.attrs, children),
    node.text,
  );
}

type Renderers = Record<string, AnyRenderer>;

function renderNodes(nodes: readonly CodexNode[], renderers: Renderers): ReactNode {
  return nodes.map((node, index) => (
    <Fragment key={node.type !== 'text' && 'id' in node.attrs && node.attrs.id ? node.attrs.id : index}>
      {renderNode(node, renderers)}
    </Fragment>
  ));
}

function renderNode(node: CodexNode, renderers: Renderers): ReactNode {
  if (node.type === 'text') return renderText(node);
  return renderers[node.type]!({
    attrs: node.attrs,
    children: renderNodes(node.content, renderers),
  });
}

function plainText(node: CodexNode): string {
  return node.type === 'text' ? node.text : node.content.map(plainText).join('');
}

export function codexOutline(doc: CodexDoc): { id: string; label: string }[] {
  return codexSections(doc).flatMap(({ id, heading }) =>
    heading ? [{ id, label: plainText(heading) }] : [],
  );
}

export interface RenderedCodexSection extends CodexSection {
  readonly title: ReactNode | null;
  readonly body: ReactNode;
  readonly empty: boolean;
  readonly lifted: boolean;
}

const blockId = (block: CodexBlockNode) => ('id' in block.attrs ? block.attrs.id : undefined);

export function renderCodexSections(
  doc: CodexDoc,
  components: CodexInjectedComponents,
  omit?: string,
): RenderedCodexSection[] {
  const renderers = { ...BLOCKS, ...components } as Renderers;
  return codexSections(doc).map((section) => {
    const shown = omit === undefined ? section.blocks : section.blocks.filter((block) => blockId(block) !== omit);
    return {
      ...section,
      title: section.heading ? renderNodes(section.heading.content, renderers) : null,
      body: <div className="codex-prose">{renderNodes(shown, renderers)}</div>,
      empty: isBlankSection(section.blocks),
      lifted: section.heading === null && omit !== undefined && shown.length === 0,
    };
  });
}

export function CodexArticle({
  doc,
  components,
  omit,
  placeholder,
}: {
  doc: CodexDoc;
  components: CodexInjectedComponents;
  omit?: string;
  placeholder?: ReactNode;
}) {
  return renderCodexSections(doc, components, omit).flatMap(({ id, title, body, empty, lifted }) =>
    lifted
      ? []
      : [
          <CodexSectionFrame key={id} id={id} title={title}>
            {title !== null && empty && placeholder ? placeholder : body}
          </CodexSectionFrame>,
        ],
  );
}
