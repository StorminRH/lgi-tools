import { describe, expect, it } from 'vitest';
import { highlightExcerpt, highlightTree, rebuildTree } from './highlight';
import type { Block, DevlogTree, Excerpt } from './types';

const ex = (id: string, over: Partial<Excerpt> = {}): Excerpt => ({
  id,
  file: 'f',
  lines: '1-2',
  lang: 'ts',
  code: 'const x = 1;',
  ref: '',
  ...over,
});

const excerptBlocks = (blocks: Block[]) =>
  blocks.filter((b): b is Extract<Block, { type: 'excerpt' }> => b.type === 'excerpt');

describe('rebuildTree', () => {
  it('swaps every excerpt block for its highlighted object without mutating the input', () => {
    const shared = ex('code-x');
    const tree: DevlogTree = {
      looseDocuments: [
        {
          slug: 'd',
          title: 'D',
          blocks: [
            { type: 'excerpt', excerpt: shared },
            { type: 'paragraph', tokens: [] },
            { type: 'excerpt', excerpt: shared },
          ],
        },
      ],
      folders: [
        {
          slug: 'f',
          title: 'F',
          documents: [{ slug: 'e', title: 'E', blocks: [{ type: 'excerpt', excerpt: shared }] }],
        },
      ],
    };
    const highlighted: Excerpt = { ...shared, tokens: [[{ content: 'const', color: 'red' }]] };

    const out = rebuildTree(tree, new Map([['code-x', highlighted]]));

    // all three instances (two loose blocks + the folder one) point at the highlighted object
    const blocks = excerptBlocks([
      ...out.looseDocuments[0]!.blocks,
      ...out.folders[0]!.documents[0]!.blocks,
    ]);
    expect(blocks).toHaveLength(3);
    for (const b of blocks) expect(b.excerpt).toBe(highlighted);

    // input untouched — original object still token-less, new references out
    expect(shared.tokens).toBeUndefined();
    expect(out.looseDocuments[0]!.blocks[0]).not.toBe(tree.looseDocuments[0]!.blocks[0]);
  });

  it('keeps the original excerpt when its id is absent from the map', () => {
    const orphan = ex('code-o');
    const tree: DevlogTree = {
      looseDocuments: [{ slug: 'd', title: 'D', blocks: [{ type: 'excerpt', excerpt: orphan }] }],
      folders: [],
    };
    expect(excerptBlocks(rebuildTree(tree, new Map()).looseDocuments[0]!.blocks)[0]!.excerpt).toBe(orphan);
  });
});

describe('highlightExcerpt', () => {
  it('colours a known language and preserves the code verbatim', async () => {
    const out = await highlightExcerpt(ex('code-ts', { lang: 'ts', code: 'const x = 1;' }));
    expect(out.tokens).toBeDefined();
    expect(out.tokens!.flat().some((t) => t.color)).toBe(true);
    const rejoined = out.tokens!.map((line) => line.map((t) => t.content).join('')).join('\n');
    expect(rejoined).toBe('const x = 1;');
  });

  it('falls back to uncoloured lines for an unknown language without throwing', async () => {
    const out = await highlightExcerpt(ex('code-x', { lang: 'brainfuck', code: 'a\nb' }));
    expect(out.tokens).toEqual([[{ content: 'a' }], [{ content: 'b' }]]);
  });

  it('does not mutate the input excerpt', async () => {
    const input = ex('code-ts', { lang: 'ts' });
    await highlightExcerpt(input);
    expect(input.tokens).toBeUndefined();
  });
});

describe('highlightTree', () => {
  it('highlights each distinct definition once and reuses it across instances', async () => {
    const shared = ex('code-x', { lang: 'ts', code: 'const a = 1;' });
    const other = ex('code-y', { lang: 'ts', code: 'const b = 2;' });
    const tree: DevlogTree = {
      looseDocuments: [
        {
          slug: 'd',
          title: 'D',
          blocks: [
            { type: 'excerpt', excerpt: shared },
            { type: 'excerpt', excerpt: shared },
            { type: 'excerpt', excerpt: other },
          ],
        },
      ],
      folders: [],
    };

    const blocks = excerptBlocks((await highlightTree(tree)).looseDocuments[0]!.blocks);
    // both instances of the shared definition resolve to ONE highlighted object (deduped)
    expect(blocks[0]!.excerpt).toBe(blocks[1]!.excerpt);
    expect(blocks[0]!.excerpt).not.toBe(blocks[2]!.excerpt);
    expect(blocks[0]!.excerpt.tokens).toBeDefined();
  });
});
