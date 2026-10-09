import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('next/dynamic', () => ({ default: () => () => createElement('div', { 'data-editor': '' }) }));

import { ConflictResolver, type ConflictRow } from './ConflictResolver';

const P1 = '33333333-3333-4333-8333-333333333333';
const row = (blockId: string, headPresent: boolean, proposalPresent: boolean): ConflictRow => ({
  blockId,
  columns: { base: `base ${blockId}`, head: `head ${blockId}`, proposal: `proposal ${blockId}` },
  headPresent,
  proposalPresent,
  initialBlocks: [{ type: 'paragraph', attrs: { id: blockId } }],
});

const render = (rows: ConflictRow[], headRevisionId: string | null = 'rev-2') =>
  renderToStaticMarkup(
    createElement(ConflictResolver, { proposalId: P1, headRevisionId, notice: null, catalogue: { sources: [] }, rows }),
  );

test('one form carries the pin, the three columns, and a labelled choice per block', () => {
  const html = render([row('s1', true, true), row('s2', false, true), row('s3', true, false)]);

  expect(html.match(/<form /g)).toHaveLength(1);
  expect(html).toContain('action="/api/admin/codex/proposals"');
  expect(html).toContain(`<input type="hidden" name="proposalId" value="${P1}"/>`);
  expect(html).toContain('<input type="hidden" name="headRevisionId" value="rev-2"/>');
  expect(html).toContain('base s1');
  expect(html).toContain('head s1');
  expect(html).toContain('proposal s1');
  expect(html).toContain('aria-label="Resolve s1"');
  expect(html).toContain("Keep the page&#x27;s version");
  expect(html).toContain('Use the suggestion');
  expect(html).toContain('Leave it out (the page removed it)');
  expect(html).toContain('Leave it out (the suggestion removed it)');
  expect(html.match(/Edit it by hand/g)).toHaveLength(3);
  expect(html).not.toContain('name="choice.');
  expect(html).not.toContain('data-editor');
  expect(/<button[^>]*type="submit"[^>]*>Approve and publish/.exec(html)?.[0]).toContain('name="action"');
});

test('a clean merge says so and still offers the approve button', () => {
  const html = render([], null);
  expect(html).toContain('Merges cleanly');
  expect(html).toContain('<input type="hidden" name="headRevisionId" value=""/>');
  expect(html).not.toContain('Resolve');
  expect(html).toContain('Approve and publish');
});
