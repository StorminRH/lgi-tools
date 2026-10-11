import { expect, test, vi } from 'vitest';
import { buildBreadcrumbList } from './structured-data';

vi.mock('@/config/site-url', () => ({ SITE_URL: 'https://lgi.tools' }));

test('buildBreadcrumbList roots the trail at Home and numbers absolute crumbs from one', () => {
  expect(
    buildBreadcrumbList([
      { name: 'Industry Planner', path: '/industry' },
      { name: 'Rifter', path: '/industry/587' },
    ]),
  ).toEqual({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://lgi.tools/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Industry Planner',
        item: 'https://lgi.tools/industry',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Rifter',
        item: 'https://lgi.tools/industry/587',
      },
    ],
  });
});
