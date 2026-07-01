import type { Block } from '../types';
import { CodeExcerpt } from './CodeExcerpt';
import { InlineTokens } from './InlineTokens';

// One dev-log document: its title over the ordered blocks. Code excerpts sit inline
// where their reference sat, collapsed by default.
export function DocumentView({ title, blocks }: { title: string; blocks: Block[] }) {
  return (
    <article className="devlog-prose">
      <h2 className="devlog-doc-title">{title}</h2>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <p key={i}>
                <InlineTokens tokens={block.tokens} />
              </p>
            );
          case 'blockquote':
            return (
              <blockquote key={i}>
                <InlineTokens tokens={block.tokens} />
              </blockquote>
            );
          case 'list': {
            const items = block.items.map((item, j) => (
              <li key={j}>
                <InlineTokens tokens={item} />
              </li>
            ));
            return block.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
          }
          case 'excerpt':
            return <CodeExcerpt key={i} excerpt={block.excerpt} />;
        }
      })}
    </article>
  );
}
