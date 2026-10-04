import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CodexSectionFrame } from './CodexSectionFrame';

const pencil = createElement('button', { type: 'button' }, 'Edit');
const body = createElement('p', null, 'Start here.');

test('the lead pencil floats beside the text instead of taking its own row', () => {
  expect(renderToStaticMarkup(CodexSectionFrame({ id: 'lead', title: null, action: pencil, children: body }))).toBe(
    '<section class="scroll-mt-24 pt-10 first:pt-0">' +
      '<div class="float-right -mt-1 -mb-2 ml-3"><button type="button">Edit</button></div>' +
      '<p>Start here.</p></section>',
  );
});

test('a heading pencil sits on the heading line without growing it', () => {
  expect(renderToStaticMarkup(CodexSectionFrame({ id: 'ships', title: 'Ships', action: pencil, children: body }))).toBe(
    '<section id="ships" class="scroll-mt-24 pt-10 first:pt-0">' +
      '<header class="mb-4 flex items-center justify-between gap-4 border-b border-border-soft pb-3">' +
      '<h2 class="font-display text-h2 font-bold uppercase leading-none tracking-optical text-name">Ships</h2>' +
      '<div class="-my-2 shrink-0"><button type="button">Edit</button></div></header>' +
      '<p>Start here.</p></section>',
  );
});

test('a section in edit clears the floated infobox so its heading sits beside its editor', () => {
  expect(
    renderToStaticMarkup(CodexSectionFrame({ id: 'ships', title: 'Ships', editing: true, children: body })),
  ).toBe(
    '<section id="ships" class="scroll-mt-24 pt-10 first:pt-0 clear-right">' +
      '<header class="mb-4 flex items-center justify-between gap-4 border-b border-border-soft pb-3">' +
      '<h2 class="font-display text-h2 font-bold uppercase leading-none tracking-optical text-name">Ships</h2>' +
      '</header><p>Start here.</p></section>',
  );
});
