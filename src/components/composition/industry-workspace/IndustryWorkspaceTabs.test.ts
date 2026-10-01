import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const location = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => location.params }));
// The stable React resolved by Vitest has no ViewTransition export.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ViewTransition: ({ children }: { children: ReactNode }) => children,
}));

import { IndustryWorkspaceTabs } from './IndustryWorkspaceTabs';

test.each([
  ['', 'Profiles', 'Profile workspace contents'],
  ['tab=plans', 'Plans &amp; templates', 'Saved plans contents'],
  ['tab=jobs&profile=caps&character=9001', 'Active jobs', 'Active jobs contents'],
  ['tab=invalid', 'Profiles', 'Profile workspace contents'],
])('industry tab query %s selects %s and mounts only its contents', (query, selected, contents) => {
  location.params = new URLSearchParams(query);
  const html = renderToStaticMarkup(createElement(IndustryWorkspaceTabs, {
    profiles: 'Profile workspace contents',
    plans: 'Saved plans contents',
    jobs: 'Active jobs contents',
  }));
  const active = html.match(/<button[^>]*aria-selected="true"[^>]*>([\s\S]*?)<\/button>/);
  expect(active?.[1]).toBe(selected);
  expect(html.match(/role="tab"/g)).toHaveLength(3);
  expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
  for (const panel of ['Profile workspace contents', 'Saved plans contents', 'Active jobs contents']) {
    if (panel === contents) expect(html).toContain(panel);
    else expect(html).not.toContain(panel);
  }
  expect(html).not.toContain('<a ');
});
