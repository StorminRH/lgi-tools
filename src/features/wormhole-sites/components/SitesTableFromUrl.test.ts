import { describe, expect, it } from 'vitest';
import type { SiteDetail } from '../types';

import { SitesTableFromUrl } from './SitesTableFromUrl';

const sites: SiteDetail[] = [];

describe('SitesTableFromUrl', () => {
  it('forwards a valid URL sort to the cached catalogue table', async () => {
    const result = await SitesTableFromUrl({
      sites,
      searchParams: Promise.resolve({ sort: 'name', dir: 'asc' }),
    });

    expect(result.props).toMatchObject({
      sites,
      sortKey: 'name',
      sortDir: 'asc',
      currentParams: { sort: 'name', dir: 'asc' },
    });
  });

  it('normalizes invalid or repeated URL state to the unsorted catalogue default', async () => {
    const result = await SitesTableFromUrl({
      sites,
      searchParams: Promise.resolve({ sort: ['name', 'isk'], dir: 'sideways' }),
    });

    expect(result.props).toMatchObject({
      sites,
      sortKey: null,
      sortDir: 'desc',
      currentParams: { sort: undefined, dir: undefined },
    });
  });
});
