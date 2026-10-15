import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { SectionHeader } from './section-header';

type Props = Parameters<typeof SectionHeader>[0];

function render(props: Partial<Props> = {}): string {
  return renderToStaticMarkup(createElement(SectionHeader, { label: 'Visitors & users', ...props }));
}

test('keeps the label a plain span by default, renders a real heading when asked, and shows the hint beside it', () => {
  expect(render()).toContain('<span>Visitors &amp; users</span>');
  expect(render({ as: 'h2', hint: '12 items' })).toMatch(/<h2>Visitors &amp; users<\/h2><span [^>]*>12 items<\/span>/);
  expect(render({ variant: 'sub', as: 'h3' })).toContain('<h3>Visitors &amp; users</h3>');
});
