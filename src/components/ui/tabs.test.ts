import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Tabs } from './tabs';

test('tabs use buttons and omit panels for options without content', () => {
  const html = renderToStaticMarkup(createElement(Tabs, {
    label: 'Industry sections',
    value: 'plans',
    tabs: [
      { value: 'profiles', label: 'Profiles' },
      { value: 'plans', label: 'Plans' },
      { value: 'research', label: 'Research planned', disabled: true },
    ],
  }));
  expect(html).toMatch(/<button[^>]*role="tab"[^>]*>Profiles<\/button>/);
  expect(html).toMatch(/<button[^>]*aria-selected="true"[^>]*>Plans<\/button>/);
  expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>Research planned<\/button>/);
  expect(html).not.toContain('role="tabpanel"');
  expect(html).not.toContain('<a ');
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

test('keepMounted preserves inactive panel contents', () => {
  const html = renderToStaticMarkup(createElement(Tabs, {
    label: 'Build details',
    value: 'materials',
    keepMounted: true,
    tabs: [
      { value: 'plan', label: 'Plan', content: 'Build plan contents' },
      { value: 'materials', label: 'Materials', content: 'Material demand' },
    ],
  }));
  expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
  expect(html).toContain('Build plan contents');
  expect(html).toContain('Material demand');
  expect(html).toMatch(/<div(?=[^>]*role="tabpanel")(?=[^>]* hidden="")(?=[^>]* inert="")[^>]*>Build plan contents<\/div>/);
});
