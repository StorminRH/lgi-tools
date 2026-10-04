import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { parseCodexDoc, type CodexDoc } from './doc';
import { CodexArticle, codexOutline } from './render';

const text = (value: string, marks: unknown[] = []) => ({ type: 'text', text: value, marks });
const paragraph = (content: unknown[], id?: string) => ({ type: 'paragraph', attrs: { id }, content });
const cell = (type: 'tableHeader' | 'tableCell', value: string, attrs = {}) => ({
  type,
  attrs,
  content: [paragraph([text(value)])],
});

function fixture(): CodexDoc {
  const result = parseCodexDoc({
    type: 'doc',
    attrs: { schemaVersion: 1 },
    content: [
      paragraph([text('Intro for '), text('C3', [{ type: 'bold' }])], 'intro'),
      { type: 'heading', attrs: { id: 'ships', level: 2 }, content: [text('Ship '), text('choice', [{ type: 'italic' }])] },
      { type: 'heading', attrs: { id: 'doctrine', level: 3 }, content: [text('Doctrine')] },
      {
        type: 'bulletList',
        attrs: { id: 'list' },
        content: [
          { type: 'listItem', content: [paragraph([text('Gila')])] },
          { type: 'listItem', content: [paragraph([text('/fit', [{ type: 'code' }])])] },
        ],
      },
      { type: 'heading', attrs: { id: 'data', level: 2 }, content: [text('Data')] },
      {
        type: 'table',
        attrs: { id: 'table' },
        content: [
          { type: 'tableRow', content: [cell('tableHeader', 'Class'), cell('tableHeader', 'Mass')] },
          { type: 'tableRow', content: [cell('tableCell', 'C3', { colspan: 2 })] },
        ],
      },
      paragraph(
        [
          text('Read '),
          text('Atlas', [{ type: 'link', attrs: { href: '/atlas' } }]),
          text(' and '),
          text('zKill', [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://zkillboard.com/' } }]),
        ],
        'links',
      ),
      { type: 'callout', attrs: { id: 'tip' }, content: [paragraph([text('Bring scouts.')])] },
      { type: 'horizontalRule', attrs: { id: 'rule' } },
    ],
  });
  if (!result.ok) throw new Error(result.problems.join('; '));
  return result.doc;
}

test('renders sections, lists, tables, links, and the outline from a parsed document', () => {
  const doc = fixture();
  const html = renderToStaticMarkup(createElement(CodexArticle, { doc, components: {} }));

  expect(codexOutline(doc)).toEqual([
    { id: 'ships', label: 'Ship choice' },
    { id: 'data', label: 'Data' },
  ]);
  expect(html).toContain(
    '<section class="scroll-mt-24 pt-10 first:pt-0"><div class="codex-prose"><p>Intro for <strong>C3</strong></p></div></section>',
  );
  expect(html).toContain(
    '<section id="ships" class="scroll-mt-24 pt-10 first:pt-0"><header class="mb-4 border-b border-border-soft pb-3"><h2 class="font-display text-h2 font-bold uppercase leading-none tracking-optical text-name">Ship <em>choice</em></h2></header>',
  );
  expect(html).toContain('<h3 id="doctrine">Doctrine</h3>');
  expect(html).toContain('<ul><li><p>Gila</p></li><li><p><code>/fit</code></p></li></ul>');
  expect(html).toContain(
    '<table><tbody><tr><th><p>Class</p></th><th><p>Mass</p></th></tr><tr><td colSpan="2"><p>C3</p></td></tr></tbody></table></div>',
  );
  expect(html).toContain(
    '<p>Read <a href="/atlas">Atlas</a> and <strong><a href="https://zkillboard.com/" rel="nofollow noopener noreferrer">zKill</a></strong></p>',
  );
  expect(html).toContain(
    '<aside class="codex-callout" data-tone="tip"><span class="codex-callout-label">Tip</span><p>Bring scouts.</p></aside><hr/>',
  );
  expect(html).not.toContain('style=');
});
