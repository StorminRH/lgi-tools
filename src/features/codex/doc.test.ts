import { expect, test } from 'vitest';
import { parseCodexDoc } from './doc';

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
