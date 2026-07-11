import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  documentSummary,
  findDocument,
  flattenDocuments,
  parseDevlog,
  parseInline,
  slugify,
} from './parse';
import type { Block } from './types';

const excerptBlocks = (blocks: Block[]) =>
  blocks.filter((b): b is Extract<Block, { type: 'excerpt' }> => b.type === 'excerpt');

describe('slugify', () => {
  it('lowercases, collapses non-alphanumerics, and trims', () => {
    expect(slugify('Market Prices & Indices')).toBe('market-prices-indices');
    expect(slugify('Borrowed vs. Built')).toBe('borrowed-vs-built');
    expect(slugify('The ESI Gate')).toBe('the-esi-gate');
    expect(slugify('Corps & Roles')).toBe('corps-roles');
  });
});

describe('parseInline', () => {
  it('splits links, inline code, bold, and text in one pass', () => {
    const tokens = parseInline('See [PR #1](https://x/1) then `run` and **stop**.');
    expect(tokens).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'link', text: 'PR #1', href: 'https://x/1' },
      { type: 'text', value: ' then ' },
      { type: 'code', value: 'run' },
      { type: 'text', value: ' and ' },
      { type: 'bold', value: 'stop' },
      { type: 'text', value: '.' },
    ]);
  });

  it('treats plain prose as a single text token', () => {
    expect(parseInline('nothing special here')).toEqual([
      { type: 'text', value: 'nothing special here' },
    ]);
  });
});

describe('parseDevlog — structure', () => {
  const md = [
    '## Introduction',
    '',
    'Landing prose.',
    '',
    '## Building with AI',
    '',
    'Loose second doc.',
    '',
    '# Services',
    '',
    '## Vercel',
    '',
    'A point about the host.',
    '',
    '- first item',
    '- second item',
    '',
    '> a quoted line',
  ].join('\n');

  it('places loose documents before folders, in order', () => {
    const tree = parseDevlog(md);
    expect(tree.looseDocuments.map((d) => d.title)).toEqual(['Introduction', 'Building with AI']);
    expect(tree.folders.map((f) => f.title)).toEqual(['Services']);
    expect(tree.folders[0]!.documents.map((d) => d.title)).toEqual(['Vercel']);
  });

  it('assigns deterministic slugs and finds by slug', () => {
    const tree = parseDevlog(md);
    expect(tree.looseDocuments[0]!.slug).toBe('introduction');
    expect(findDocument(tree, 'vercel')?.title).toBe('Vercel');
    expect(flattenDocuments(tree)).toHaveLength(3);
  });

  it('parses bullet lists and blockquotes', () => {
    const tree = parseDevlog(md);
    const vercel = findDocument(tree, 'vercel')!;
    const list = vercel.blocks.find((b) => b.type === 'list');
    expect(list).toEqual({
      type: 'list',
      ordered: false,
      items: [[{ type: 'text', value: 'first item' }], [{ type: 'text', value: 'second item' }]],
    });
    expect(vercel.blocks.some((b) => b.type === 'blockquote')).toBe(true);
  });
});

describe('parseDevlog — excerpts', () => {
  const md = [
    '## Doc',
    '',
    'Prose that cites code.<sup><a href="#code-x">1</a></sup>',
    '',
    '<!-- uth:code-excerpts:start -->',
    '<!-- uth:code id="code-x" file="a.md" lines="1-3" lang="md" -->',
    '```md',
    '## Not A Heading',
    'inner markdown:',
    '```js',
    'const y = 1;',
    '```',
    'trailing line',
    '```',
    '<!-- uth:code id="code-orphan" file="b.ts" lines="9-9" lang="ts" -->',
    '```ts',
    'export const z = 2;',
    '```',
    '<!-- uth:code-excerpts:end -->',
  ].join('\n');

  it('resolves a trailing <sup> reference to an inline excerpt block at that point', () => {
    const tree = parseDevlog(md);
    const doc = tree.looseDocuments[0]!;
    expect(doc.blocks[0]).toEqual({
      type: 'paragraph',
      tokens: [{ type: 'text', value: 'Prose that cites code.' }],
    });
    expect(doc.blocks[1]).toMatchObject({
      type: 'excerpt',
      excerpt: { id: 'code-x', file: 'a.md', lines: '1-3', lang: 'md' },
    });
  });

  it('captures a nested-fence md excerpt whole (delimiter-bounded, not fence-counted)', () => {
    const tree = parseDevlog(md);
    const ex = excerptBlocks(tree.looseDocuments[0]!.blocks)[0]!.excerpt;
    expect(ex.code).toBe('## Not A Heading\ninner markdown:\n```js\nconst y = 1;\n```\ntrailing line');
  });

  it('does not treat a ## inside an excerpt body as a document', () => {
    const tree = parseDevlog(md);
    expect(flattenDocuments(tree)).toHaveLength(1);
  });

  it('appends an unreferenced definition as a safety net (never dropped)', () => {
    const tree = parseDevlog(md);
    const ids = excerptBlocks(tree.looseDocuments[0]!.blocks).map((b) => b.excerpt.id);
    expect(ids).toEqual(['code-x', 'code-orphan']);
  });
});

describe('documentSummary', () => {
  it('flattens the first paragraph (links/code/bold → their text)', () => {
    const tree = parseDevlog(
      ['## Doc', '', 'Start with a [link](https://x), then `code`, then **bold**.', '', 'Second para.'].join('\n'),
    );
    expect(documentSummary(tree.looseDocuments[0]!)).toBe('Start with a link, then code, then bold.');
  });

  it('truncates past the max with an ellipsis', () => {
    const tree = parseDevlog(['## Doc', '', 'x'.repeat(200)].join('\n'));
    const summary = documentSummary(tree.looseDocuments[0]!, 20);
    expect(summary).toHaveLength(20);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('falls back when the document has no paragraph', () => {
    expect(documentSummary({ slug: 'e', title: 'E', blocks: [] })).toMatch(/behind-the-scenes/);
  });
});

describe('parseDevlog — the real UNDER_THE_HOOD.md', () => {
  const md = readFileSync(join(process.cwd(), 'UNDER_THE_HOOD.md'), 'utf8');
  const tree = parseDevlog(md);

  it('matches the locked nav tree exactly', () => {
    expect(tree.looseDocuments.map((d) => d.title)).toEqual(['Introduction', 'Building with AI']);
    expect(tree.folders.map((f) => [f.title, f.documents.length])).toEqual([
      ['Services', 5],
      ['Stack', 3],
      ['EVE Data', 4],
      ['Features', 7],
      ['Rails', 5],
      ['Lessons', 3],
    ]);
    expect(flattenDocuments(tree)).toHaveLength(29);
  });

  it('resolves every excerpt with a display label and non-empty code', () => {
    const all = flattenDocuments(tree).flatMap((d) => excerptBlocks(d.blocks));
    // 278 rendered instances across 242 distinct definitions — a definition cited
    // by more than one paragraph renders its own collapsed instance each time.
    expect(all).toHaveLength(278);
    expect(new Set(all.map((b) => b.excerpt.id)).size).toBe(242);
    for (const b of all) {
      expect(b.excerpt.file).not.toBe('');
      expect(b.excerpt.lines).not.toBe('');
      expect(b.excerpt.code.length).toBeGreaterThan(0);
    }
  });

  it('renders every excerpt inline (no orphan defs left to append)', () => {
    // Every definition is wired to a <sup>, so each excerpt block sits directly
    // after the paragraph that references it — the block before it is a paragraph.
    for (const doc of flattenDocuments(tree)) {
      doc.blocks.forEach((b, i) => {
        if (b.type === 'excerpt' && i > 0) {
          const prev = doc.blocks[i - 1]!;
          expect(prev.type === 'paragraph' || prev.type === 'excerpt').toBe(true);
        }
      });
    }
  });
});
