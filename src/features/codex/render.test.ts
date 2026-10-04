import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { parseCodexDoc, type CodexDoc } from './doc';
import { CodexPageLayout } from './components/CodexPageLayout';
import { CODEX_CALLOUT_LABELS } from './nodes';
import { CodexArticle, codexOutline, type CodexInjectedComponents } from './render';

const components: CodexInjectedComponents = {
  dataBlock: ({ attrs }) =>
    createElement('aside', { 'data-stub': `${attrs.source}:${attrs.key}:${attrs.fields.join(',')}:${attrs.layout}` }),
  dataInline: ({ attrs }) => createElement('span', { 'data-stub': `${attrs.source}:${attrs.key}:${attrs.fields.join(',')}` }),
};

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
        type: 'dataBlock',
        attrs: { id: 'c247', source: 'wormholeType', key: 'C247', fields: ['totalMass', 'lifetimeMinutes'], layout: 'infobox' },
      },
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
      {
        type: 'callout',
        attrs: { id: 'tip' },
        content: [
          paragraph([
            text('Bring scouts into '),
            { type: 'dataInline', attrs: { source: 'wormholeClass', key: 'C3', fields: ['effects'] } },
            text('.'),
          ]),
        ],
      },
      { type: 'horizontalRule', attrs: { id: 'rule' } },
    ],
  });
  if (!result.ok) throw new Error(result.problems.join('; '));
  return result.doc;
}

test('renders sections, lists, tables, links, and the outline from a parsed document', () => {
  const doc = fixture();
  const html = renderToStaticMarkup(createElement(CodexArticle, { doc, components }));

  expect(codexOutline(doc)).toEqual([
    { id: 'ships', label: 'Ship choice' },
    { id: 'data', label: 'Data' },
  ]);
  expect(html).toContain(
    '<section class="scroll-mt-24 pt-10 first:pt-0"><div class="codex-prose"><p>Intro for <strong>C3</strong></p></div></section>',
  );
  expect(html).toContain(
    '<section id="ships" class="scroll-mt-24 pt-10 first:pt-0"><header class="mb-4 flex items-center justify-between gap-4 border-b border-border-soft pb-3"><h2 class="font-display text-h2 font-bold uppercase leading-none tracking-optical text-name">Ship <em>choice</em></h2></header>',
  );
  expect(html).toContain('<h3 id="doctrine">Doctrine</h3>');
  expect(html).toContain('<ul><li><p>Gila</p></li><li><p><code>/fit</code></p></li></ul>');
  expect(html).toContain(
    '<h2 class="font-display text-h2 font-bold uppercase leading-none tracking-optical text-name">Data</h2></header><div class="codex-prose"><aside data-stub="wormholeType:C247:totalMass,lifetimeMinutes:infobox"></aside><div',
  );
  expect(html).toContain(
    '<table><tbody><tr><th><p>Class</p></th><th><p>Mass</p></th></tr><tr><td colSpan="2"><p>C3</p></td></tr></tbody></table></div>',
  );
  expect(html).toContain(
    '<p>Read <a href="/atlas">Atlas</a> and <strong><a href="https://zkillboard.com/" rel="nofollow noopener noreferrer">zKill</a></strong></p>',
  );
  expect(html).toContain(
    '<aside class="codex-callout" data-tone="tip"><span class="codex-callout-label">Tip</span><p>Bring scouts into <span data-stub="wormholeClass:C3:effects"></span>.</p></aside><hr/>',
  );
  expect(html).not.toContain('style=');
});

test('the callout eyebrow reads from the shared label table', () => {
  for (const [tone, label] of Object.entries(CODEX_CALLOUT_LABELS)) {
    const parsed = parseCodexDoc({
      type: 'doc',
      attrs: { schemaVersion: 1 },
      content: [{ type: 'callout', attrs: { id: 'note', tone }, content: [paragraph([text('Scout first.')])] }],
    });
    if (!parsed.ok) throw new Error(parsed.problems.join('; '));
    expect(renderToStaticMarkup(createElement(CodexArticle, { doc: parsed.doc, components }))).toContain(
      `<span class="codex-callout-label">${label}</span>`,
    );
  }
});

test('prose paragraphs take the shared block spacing instead of resetting it', () => {
  const rules = [...readFileSync('src/features/codex/render.css', 'utf8').matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const paragraphRules = rules.filter(([, selector]) => selector!.split(',').some((part) => part.trim() === '.codex-prose p'));
  expect(paragraphRules.map(([, , body]) => body!.trim())).toEqual(['text-wrap: pretty;']);
  expect(rules.find(([, selector]) => selector!.trim() === '.codex-prose > * + *')?.[2]?.trim()).toBe('margin-top: 0.85em;');
});

test('an infobox floats across section boundaries only on wide screens, where inline code also stops splitting', () => {
  const css = readFileSync('src/features/codex/render.css', 'utf8');
  const body = (selector: string) =>
    [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(([, found]) => found!.trim() === selector)?.[2] ?? '';
  expect(body('.codex-prose')).not.toContain('display');
  expect(body('.codex-prose code')).not.toContain('white-space');
  const wide = /@media \(min-width: 900px\) \{([\s\S]*)\}\s*$/.exec(css)?.[1] ?? '';
  expect(wide).toMatch(/^\s*\.codex-prose > \[data-codex-layout="infobox"\] \{\s*float: right;/);
  expect(wide).toContain('.codex-prose code { white-space: nowrap; }');
  expect(renderToStaticMarkup(createElement(CodexPageLayout, { header: null, article: 'Body', aside: null }))).toContain(
    '<article class="flow-root min-w-0 max-w-[760px]">Body</article>',
  );
});
