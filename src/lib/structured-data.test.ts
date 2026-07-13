import { describe, expect, it } from 'vitest';
import { buildBreadcrumbList } from './structured-data';

describe('buildBreadcrumbList', () => {
  it('numbers canonical breadcrumb items from one in source order', () => {
    expect(
      buildBreadcrumbList([
        { name: 'Home', url: 'https://lgi.tools/' },
        { name: 'Industry Planner', url: 'https://lgi.tools/industry' },
        { name: 'Rifter', url: 'https://lgi.tools/industry/587' },
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
});
