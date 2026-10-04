import { expect, test } from 'vitest';
import { findUntrustedNodes, parseCodexDoc } from './doc';

const paragraph = (id: string, text: string, marks: unknown[] = []) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text, marks }],
});

const doc = (content: unknown[]) => ({ type: 'doc', attrs: { schemaVersion: 1 }, content });

test('accepts a document with every C1 node and fills attribute defaults', () => {
  const result = parseCodexDoc(
    doc([
      { type: 'heading', attrs: { id: 'h', level: 2 }, content: [{ type: 'text', text: 'Rolling' }] },
      paragraph('p', 'See the map', [{ type: 'link', attrs: { href: '/atlas', target: '_blank' } }]),
      {
        type: 'orderedList',
        attrs: { id: 'ol' },
        content: [{ type: 'listItem', content: [paragraph('li', 'Jump')] }],
      },
      {
        type: 'table',
        attrs: { id: 't' },
        content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [] }] }],
      },
      { type: 'callout', attrs: { id: 'c' }, content: [] },
      { type: 'horizontalRule', attrs: { id: 'hr' } },
    ]),
  );

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.doc.content[1]).toEqual({
    type: 'paragraph',
    attrs: { id: 'p' },
    content: [{ type: 'text', text: 'See the map', marks: [{ type: 'link', attrs: { href: '/atlas' } }] }],
  });
  expect(result.doc.content[2]!.attrs).toEqual({ id: 'ol', start: 1 });
  expect(result.doc.content[3]!.content[0]!).toEqual({
    type: 'tableRow',
    attrs: {},
    content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [] }],
  });
  expect(result.doc.content[4]!.attrs).toEqual({ id: 'c', tone: 'tip' });
});

test('rejects unknown nodes, duplicate ids, unsafe links, missing ids, and oversized documents', () => {
  expect(parseCodexDoc(doc([paragraph('a', 'ok'), { type: 'iframe', attrs: { id: 'x' } }]))).toEqual({
    ok: false,
    problems: ['content.1.type: node type "iframe" is not allowed here'],
  });

  expect(
    parseCodexDoc(
      doc([
        { type: 'table', attrs: { id: 't' }, content: [{ type: 'paragraph', content: [] }] },
      ]),
    ),
  ).toEqual({ ok: false, problems: ['content.0.content.0.type: node type "paragraph" is not allowed here'] });

  expect(parseCodexDoc(doc([paragraph('a', 'one'), paragraph('a', 'two')]))).toEqual({
    ok: false,
    problems: ['duplicate block id "a"'],
  });

  expect(
    parseCodexDoc(doc([paragraph('a', 'x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])])),
  ).toEqual({
    ok: false,
    problems: ['content.0.content.0.marks.0.attrs.href: link "javascript:alert(1)" is not an https or site-relative URL'],
  });

  for (const href of ['http://example.com', '//evil.example', 'mailto:pilot@example.com']) {
    expect(parseCodexDoc(doc([paragraph('a', 'x', [{ type: 'link', attrs: { href } }])])).ok).toBe(false);
  }
  expect(
    parseCodexDoc(doc([paragraph('a', 'x', [{ type: 'link', attrs: { href: 'https://zkillboard.com/' } }])])).ok,
  ).toBe(true);

  expect(parseCodexDoc(doc([{ type: 'paragraph', content: [] }]))).toEqual({
    ok: false,
    problems: ['content.0: block has no id'],
  });

  const big = doc(
    Array.from({ length: 300 }, (_, index) => paragraph(`p${index}`, 'x'.repeat(1024))),
  );
  expect(parseCodexDoc(big)).toEqual({
    ok: false,
    problems: ['document is over the 262144 byte limit'],
  });
});

test('rejects site-relative links that a browser resolves to another origin', () => {
  for (const href of [
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r\\evil.example',
    '/\t\\evil.example',
    '/\\[',
    '//[',
    '/\\%',
    '//',
    '/\\',
    '/\\evil.example',
  ]) {
    expect(parseCodexDoc(doc([paragraph('a', 'x', [{ type: 'link', attrs: { href } }])]))).toEqual({
      ok: false,
      problems: [
        `content.0.content.0.marks.0.attrs.href: link ${JSON.stringify(href)} is not an https or site-relative URL`,
      ],
    });
  }
});

const nestedList = (pairs: number) => {
  let node: object = { type: 'listItem', content: [] };
  for (let pair = 0; pair < pairs; pair += 1) {
    node = { type: 'bulletList', content: [node] };
    if (pair < pairs - 1) node = { type: 'listItem', content: [node] };
  }
  return doc([{ ...node, attrs: { id: 'deep' } }]);
};

test('parses lists nested up to the depth limit and rejects deeper ones instead of overflowing the stack', () => {
  expect(parseCodexDoc(nestedList(15)).ok).toBe(true);
  expect(parseCodexDoc(nestedList(16))).toEqual({ ok: false, problems: ['document nests deeper than 64 levels'] });

  const deep = nestedList(200);
  expect(JSON.stringify(deep).length).toBeLessThan(32 * 1024);
  expect(parseCodexDoc(deep)).toEqual({ ok: false, problems: ['document nests deeper than 64 levels'] });
});

const dataBlock = (attrs: Record<string, unknown>) => ({
  type: 'dataBlock',
  attrs: { id: 'd', source: 'wormholeType', key: 'C247', layout: 'infobox', ...attrs },
});

test('accepts a data block that names a source, key, fields, and layout, and stores no values', () => {
  const result = parseCodexDoc(doc([dataBlock({})]));
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.doc.content[0]).toEqual({
    type: 'dataBlock',
    attrs: { id: 'd', source: 'wormholeType', key: 'C247', fields: [], layout: 'infobox' },
    content: [],
  });
});

test('rejects a data block with a bad layout, repeated or too many fields, a nested place, or no id', () => {
  expect(parseCodexDoc(doc([dataBlock({ layout: 'poster' })]))).toEqual({
    ok: false,
    problems: ['content.0.attrs.layout: Invalid option: expected one of "infobox"|"table"|"card"'],
  });
  expect(parseCodexDoc(doc([dataBlock({ layout: 'inline' })])).ok).toBe(false);

  expect(parseCodexDoc(doc([dataBlock({ fields: ['a', 'a'] })]))).toEqual({
    ok: false,
    problems: ['content.0.attrs.fields: fields must be unique'],
  });

  const many = Array.from({ length: 17 }, (_, index) => `f${index}`);
  expect(parseCodexDoc(doc([dataBlock({ fields: many })]))).toEqual({
    ok: false,
    problems: ['content.0.attrs.fields: Too big: expected array to have <=16 items'],
  });

  expect(
    parseCodexDoc(
      doc([{ type: 'bulletList', attrs: { id: 'l' }, content: [{ type: 'listItem', content: [dataBlock({})] }] }]),
    ),
  ).toEqual({ ok: false, problems: ['content.0.content.0.content.0.type: node type "dataBlock" is not allowed here'] });

  expect(parseCodexDoc(doc([{ type: 'dataBlock', attrs: { source: 'site', key: '20', layout: 'card' } }]))).toEqual({
    ok: false,
    problems: ['content.0: block has no id'],
  });
});

const dataInline = { type: 'dataInline', attrs: { source: 'wormholeType', key: 'C247', fields: ['totalMass'] } };

test('accepts an inline data value inside a paragraph and nowhere at the top level', () => {
  const sentence = {
    type: 'paragraph',
    attrs: { id: 'p' },
    content: [{ type: 'text', text: 'A ' }, dataInline, { type: 'text', text: ' hole.' }],
  };
  const result = parseCodexDoc(doc([sentence]));
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.doc.content[0]!.content[1]).toEqual({ ...dataInline, content: [] });

  expect(parseCodexDoc(doc([{ ...dataInline, attrs: { ...dataInline.attrs, id: 'x' } }]))).toEqual({
    ok: false,
    problems: ['content.0.type: node type "dataInline" is not allowed here'],
  });
});

const ASSET = '0b9a3c1e-6f0d-4b55-9e0e-2f8c1d7a9b10';
const image = (attrs: Record<string, unknown>) => ({ type: 'image', attrs: { id: 'i1', assetId: ASSET, alt: 'Gila', ...attrs } });

test('stores an image as its asset id, alt text, and caption, never the editor preview address', () => {
  const result = parseCodexDoc(doc([image({ src: 'https://s.public.blob.vercel-storage.com/codex/local/img/ab12' })]));

  expect(result).toEqual({
    ok: true,
    doc: doc([{ type: 'image', attrs: { id: 'i1', assetId: ASSET, alt: 'Gila', caption: '' }, content: [] }]),
  });
});

test('rejects an image without alt text, with a bad asset id, or inside a list', () => {
  expect(parseCodexDoc(doc([image({ alt: '  ' })]))).toEqual({
    ok: false,
    problems: [expect.stringMatching(/^content\.0\.attrs\.alt: /)],
  });
  expect(parseCodexDoc(doc([image({ assetId: 'x' })]))).toEqual({
    ok: false,
    problems: [expect.stringMatching(/^content\.0\.attrs\.assetId: /)],
  });
  const nested = parseCodexDoc(
    doc([{ type: 'bulletList', attrs: { id: 'l' }, content: [{ type: 'listItem', content: [image({})] }] }]),
  );
  expect(nested.ok ? [] : nested.problems).toContainEqual(expect.stringContaining('node type "image" is not allowed here'));
});

test('finds nodes of a type anywhere in untrusted JSON with their paths', () => {
  const blocks = [
    paragraph('p', 'Intro'),
    image({}),
    { type: 'blockquote', content: [null, image({ id: 'deep' })] },
    'junk',
  ];

  expect(findUntrustedNodes(blocks, new Set(['image'])).map(({ path, node }) => [path, (node.attrs as { id: string }).id])).toEqual([
    ['content.1', 'i1'],
    ['content.2.content.1', 'deep'],
  ]);
});
