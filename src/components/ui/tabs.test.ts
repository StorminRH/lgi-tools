import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Tabs } from './tabs';

test('route tabs keep native links and the current page without rendering empty panels', () => {
  const html = renderToStaticMarkup(createElement(Tabs, {
    label: 'Industry sections',
    value: '/industry/templates',
    tabs: [
      { value: '/industry', label: 'Profiles', href: '/industry' },
      { value: '/industry/templates', label: 'Plans', href: '/industry/templates' },
      { value: 'research', label: 'Research planned', disabled: true },
    ],
  }));
  expect(html).toMatch(/<a[^>]*href="\/industry"[^>]*>Profiles<\/a>/);
  expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/industry\/templates"[^>]*>Plans<\/a>/);
  expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>Research planned<\/button>/);
  expect(html).not.toContain('role="tabpanel"');
});

test('content tabs still render the selected panel', () => {
  const html = renderToStaticMarkup(createElement(Tabs, {
    label: 'Build details',
    defaultValue: 'plan',
    tabs: [
      { value: 'plan', label: 'Plan', content: 'Build plan contents' },
      { value: 'materials', label: 'Materials', content: 'Material demand' },
    ],
  }));
  expect(html).toContain('role="tabpanel"');
  expect(html).toContain('Build plan contents');
  expect(html).not.toContain('Material demand');
});
