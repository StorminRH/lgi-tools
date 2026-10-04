import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CodexBlockEditor, CodexEditor, type CodexEditorProps } from './CodexEditor';

const props: CodexEditorProps = {
  mode: 'suggest',
  viewerName: 'Karaka',
  subject: { kind: 'guides', key: 'rolling-a-c3' },
  newTitle: null,
  baseRevisionId: 'rev-2',
  sectionId: 'strategy',
  initialBlocks: [],
  notice: null,
  tools: { catalogue: { sources: [] }, uploadPrefix: 'codex/local/pending/u1/' },
  onCancel: () => {},
};

const hidden = (html: string, name: string) => new RegExp(`<input type="hidden" name="${name}" value="([^"]*)"`).exec(html)?.[1];

test('a suggester submits for review with a required summary and the license box', () => {
  const html = renderToStaticMarkup(createElement(CodexEditor, props));

  expect(html).toContain('action="/api/codex/proposals"');
  expect(hidden(html, 'action')).toBe('submit');
  expect(hidden(html, 'proposalId')).toMatch(/^[0-9a-f-]{36}$/);
  expect(hidden(html, 'license')).toBe('');
  expect(html).toContain('aria-label="I license my contribution under CC BY-SA 4.0."');
  expect(html).toContain('An admin reviews every suggestion before it goes live.');
  expect(/<input[^>]*name="summary"[^>]*>/.exec(html)?.[0]).toContain('required=""');
  expect(html).toContain('· Required');
  expect(html).toContain('Signed in as Karaka');
  expect(html).toContain('Submit for review');
  expect(html).toContain('aria-label="Video"');
});

test('the admin publishes straight away with no license box', () => {
  const html = renderToStaticMarkup(createElement(CodexEditor, { ...props, mode: 'publish' }));

  expect(html).toContain('action="/api/admin/codex/revisions"');
  expect(hidden(html, 'action')).toBe('publish');
  expect(hidden(html, 'proposalId')).toBeUndefined();
  expect(hidden(html, 'license')).toBeUndefined();
  expect(html).toContain('Publishes immediately · saved to history');
  expect(html).toContain('Save section');
  expect(html).not.toContain('Required');
  expect(html).toContain('aria-label="Video"');
});

test('the block editor is a bare editing surface with no form of its own', () => {
  const html = renderToStaticMarkup(
    createElement(CodexBlockEditor, { initialBlocks: [], catalogue: { sources: [] }, onChange: () => {} }),
  );

  expect(html).not.toContain('<form');
  expect(html).not.toContain('type="hidden"');
  expect(html).toContain('aria-label="Formatting"');
  expect(html).not.toContain('Edit summary');
  expect(html).toContain('aria-label="Video"');
});
