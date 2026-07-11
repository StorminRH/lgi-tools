import type { ReactNode } from 'react';
import type { Block } from '../types';
import { CodeExcerpt } from './CodeExcerpt';
import { InlineTokens } from './InlineTokens';

type BlockRenderer = (block: Block, key: number) => ReactNode;

// One renderer per block type — a config-map in place of a switch, so the document
// shell stays branch-free. Keyed by every `Block['type']`, so adding a block type
// is a compile error here until it has a renderer.
const BLOCK_RENDERERS: {
  [K in Block['type']]: (block: Extract<Block, { type: K }>, key: number) => ReactNode;
} = {
  paragraph: (block, key) => (
    <p key={key}>
      <InlineTokens tokens={block.tokens} />
    </p>
  ),
  blockquote: (block, key) => (
    <blockquote key={key}>
      <InlineTokens tokens={block.tokens} />
    </blockquote>
  ),
  list: (block, key) => {
    const items = block.items.map((item, j) => (
      <li key={j}>
        <InlineTokens tokens={item} />
      </li>
    ));
    return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
  },
  excerpt: (block, key) => <CodeExcerpt key={key} excerpt={block.excerpt} />,
};

// Renders one block by dispatching to its type's renderer.
export function renderBlock(block: Block, key: number): ReactNode {
  return (BLOCK_RENDERERS[block.type] as BlockRenderer)(block, key);
}

// One dev-log document: its title over the ordered blocks. Code excerpts sit inline
// where their reference sat, collapsed by default.
export function DocumentView({ title, blocks }: { title: string; blocks: Block[] }) {
  return (
    <article className="devlog-prose">
      <h2 className="devlog-doc-title">{title}</h2>
      {blocks.map((block, i) => renderBlock(block, i))}
    </article>
  );
}
