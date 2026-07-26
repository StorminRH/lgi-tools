import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteDetail } from '../types';

const { useSearchParams } = vi.hoisted(() => ({
  useSearchParams: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useSearchParams }));

import { SitesTableFromUrl } from './SitesTableFromUrl';

const sites: SiteDetail[] = [];

describe('SitesTableFromUrl', () => {
  beforeEach(() => {
    useSearchParams.mockReset();
  });

  it('forwards a valid URL sort to the cached catalogue table', () => {
    useSearchParams.mockReturnValue(new URLSearchParams('sort=name&dir=asc'));

    const result = SitesTableFromUrl({ sites });

    expect(result.props).toMatchObject({
      sites,
      sortKey: 'name',
      sortDir: 'asc',
      currentParams: { sort: 'name', dir: 'asc' },
    });
  });

  it('normalizes invalid URL state to the unsorted catalogue default', () => {
    useSearchParams.mockReturnValue(new URLSearchParams('sort=unknown&dir=sideways'));

    const result = SitesTableFromUrl({ sites });

    expect(result.props).toMatchObject({
      sites,
      sortKey: null,
      sortDir: 'desc',
      currentParams: { sort: undefined, dir: undefined },
    });
  });
});
