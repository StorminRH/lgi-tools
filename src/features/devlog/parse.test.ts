import { describe, expect, it } from 'vitest';
import { readDevlogSource } from './load';
import {
  documentSummary,
  findDocument,
  flattenDocuments,
  githubUrl,
  isCleanSingleRange,
  lineFragment,
  parseDevlog,
  parseInline,
  parseStartLine,
  slugify,
} from './parse';
import type { Block } from './types';

// Assembled from the per-document files under content/devlog/ exactly as the loader
// does, then parsed — the durable guard that segmentation didn't disturb the tree.
const realTree = parseDevlog(await readDevlogSource());

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
    '<!-- updated: 2026-06-30 -->',
    '',
    'Landing prose.',
    '',
    '## Building with AI',
    '<!-- updated: 2026-07-12 -->',
    '',
    'Loose second doc.',
    '',
    '# Services',
    '',
    '## Vercel',
    '<!-- updated: 2026-07-01 -->',
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

describe('parseDevlog — document metadata', () => {
  it('parses the committed update date without rendering the marker', () => {
    const document = parseDevlog(
      ['## Dated', '<!-- updated: 2026-07-12 -->', '', 'Visible prose.'].join('\n'),
    ).looseDocuments[0]!;
    expect(document.updated).toBe('2026-07-12');
    expect(documentSummary(document)).toBe('Visible prose.');
  });

  it('rejects a missing update date', () => {
    expect(() => parseDevlog(['## Undated', '', 'Prose.'].join('\n'))).toThrow(
      /must start with <!-- updated/,
    );
  });

  it('rejects a malformed or impossible update date', () => {
    expect(() =>
      parseDevlog(['## Invalid', '<!-- updated: 2026-02-30 -->', '', 'Prose.'].join('\n')),
    ).toThrow(/using a real date/);
  });
});

describe('parseDevlog — excerpts', () => {
  const md = [
    '## Doc',
    '<!-- updated: 2026-07-12 -->',
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
      ['## Doc', '<!-- updated: 2026-07-12 -->', '', 'Start with a [link](https://x), then `code`, then **bold**.', '', 'Second para.'].join('\n'),
    );
    expect(documentSummary(tree.looseDocuments[0]!)).toBe('Start with a link, then code, then bold.');
  });

  it('truncates past the max with an ellipsis', () => {
    const tree = parseDevlog(['## Doc', '<!-- updated: 2026-07-12 -->', '', 'x'.repeat(200)].join('\n'));
    const summary = documentSummary(tree.looseDocuments[0]!, 20);
    expect(summary).toHaveLength(20);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('falls back when the document has no paragraph', () => {
    expect(documentSummary({ slug: 'e', title: 'E', updated: '2026-07-12', blocks: [] })).toMatch(/behind-the-scenes/);
  });
});

describe('parseDevlog — the real dev log source', () => {
  const tree = realTree;

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

  it('carries a real update date on every document', () => {
    const dates = flattenDocuments(tree).map((document) => document.updated);
    expect(dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))).toBe(true);
    expect(new Set(dates).size).toBeGreaterThanOrEqual(2);
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

describe('parseDevlog — excerpt ref attribute', () => {
  const md = [
    '## Doc',
    '<!-- updated: 2026-07-12 -->',
    '',
    'Cites code.<sup><a href="#code-r">1</a></sup>',
    '',
    '<!-- uth:code-excerpts:start -->',
    '<!-- uth:code id="code-r" file="src/lib/cron.ts" lines="7-23" lang="ts" ref="5d16c056340da1fa70ad385dd7bab0b1140f7282" -->',
    '```ts',
    'export const x = 1;',
    '```',
    '<!-- uth:code id="code-n" file="a.ts" lines="1-2" lang="ts" -->',
    '```ts',
    'const y = 2;',
    '```',
    '<!-- uth:code-excerpts:end -->',
  ].join('\n');

  it('parses ref when present and defaults to empty otherwise', () => {
    const byId = new Map(
      excerptBlocks(parseDevlog(md).looseDocuments[0]!.blocks).map((b) => [b.excerpt.id, b.excerpt]),
    );
    expect(byId.get('code-r')!.ref).toBe('5d16c056340da1fa70ad385dd7bab0b1140f7282');
    expect(byId.get('code-n')!.ref).toBe('');
  });
});

describe('excerpt line + permalink helpers', () => {
  it('parseStartLine returns the first integer, else 1', () => {
    expect(parseStartLine('43-48')).toBe(43);
    expect(parseStartLine('8-14,48-62')).toBe(8);
    expect(parseStartLine('src/features/auth/queries.ts:750-759')).toBe(750);
    expect(parseStartLine('convex/corpIndustryJobs.ts:238')).toBe(238);
    expect(parseStartLine('')).toBe(1);
    expect(parseStartLine('no digits here')).toBe(1);
  });

  it('isCleanSingleRange accepts a lone number or one hyphen range only', () => {
    expect(isCleanSingleRange('238')).toBe(true);
    expect(isCleanSingleRange('43-48')).toBe(true);
    expect(isCleanSingleRange('9-9')).toBe(true);
    expect(isCleanSingleRange('8-14,48-62')).toBe(false);
    expect(isCleanSingleRange('10-16,23-45;60-80')).toBe(false);
    expect(isCleanSingleRange('src/db/index.ts:17-103')).toBe(false);
    expect(isCleanSingleRange('')).toBe(false);
  });

  it('lineFragment builds #L… only for a clean single range', () => {
    expect(lineFragment('43-48')).toBe('#L43-L48');
    expect(lineFragment('238')).toBe('#L238');
    expect(lineFragment('9-9')).toBe('#L9');
    expect(lineFragment('8-14,48-62')).toBe('');
    expect(lineFragment('src/db/index.ts:17-103')).toBe('');
    expect(lineFragment('')).toBe('');
  });

  it('githubUrl needs a full commit SHA + file; pins the SHA; fragments only clean ranges', () => {
    const base = 'https://github.com/StorminRH/lgi-tools/blob';
    const sha = '5d16c056340da1fa70ad385dd7bab0b1140f7282';
    expect(githubUrl({ ref: sha, file: 'src/lib/cron.ts', lines: '7-23' })).toBe(
      `${base}/${sha}/src/lib/cron.ts#L7-L23`,
    );
    expect(githubUrl({ ref: sha, file: 'x.ts', lines: '238' })).toBe(`${base}/${sha}/x.ts#L238`);
    expect(githubUrl({ ref: sha, file: 'x.ts', lines: '9-9' })).toBe(`${base}/${sha}/x.ts#L9`);
    // multi-range / path-prefixed / empty lines → file at the pin, no fragment
    expect(githubUrl({ ref: sha, file: 'x.ts', lines: '8-14,48-62' })).toBe(`${base}/${sha}/x.ts`);
    expect(githubUrl({ ref: sha, file: 'x.ts', lines: '' })).toBe(`${base}/${sha}/x.ts`);
    // missing file → no link
    expect(githubUrl({ ref: sha, file: '', lines: '1-2' })).toBeNull();
    // non-pinned refs (empty, branch name, abbreviated sha) → no link (they would drift)
    expect(githubUrl({ ref: '', file: 'x.ts', lines: '1-2' })).toBeNull();
    expect(githubUrl({ ref: 'main', file: 'x.ts', lines: '1-2' })).toBeNull();
    expect(githubUrl({ ref: '5d16c05', file: 'x.ts', lines: '1-2' })).toBeNull();
  });
});
