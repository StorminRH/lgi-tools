import type { ReactNode } from 'react';
import { prerender } from 'react-dom/static';
import { expect, test, vi } from 'vitest';
import { adminSessionFixture } from '@/composition/__tests__/session-fixture';

vi.mock('@/composition/route-guards', () => ({ requireAdminPage: async () => adminSessionFixture() }));
vi.mock('next/navigation', () => ({
  unstable_rethrow: () => undefined,
  usePathname: () => '/admin/traffic',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('../load-activity', () => ({ loadActivityView: async () => ({ hasData: false }) }));
vi.mock('./TrafficCards', () => ({
  loadTrafficRankings: async () => ({
    lists: { topPages: [], topEntryPages: [], topReferrers: [] },
    totals: { views: 0, entries: 0, referrals: 0 },
  }),
  loadVisitors: async () => ({}),
  VisitorsBody: () => null,
}));

import AdminTrafficPage from './page';

async function render(element: ReactNode): Promise<string> {
  const { prelude } = await prerender(element, { onError: () => undefined });
  return new Response(prelude).text();
}

function page(range: string | undefined): Promise<string> {
  return render(AdminTrafficPage({ searchParams: Promise.resolve({ range }) }));
}

test('links the referrers card to search at the range on show, and visitors to users', async () => {
  const html = await page('7d');

  expect(html).toContain('>Traffic</h2>');
  expect(html).toContain('Reporting range');
  expect(html).toContain('No external referrers in this range.');
  expect(html).toContain('href="/admin/search?range=7d">Search console');
  expect(html).toContain('href="/admin/users">Users &amp; roles');

  // The default range stays off the URL, as in the rail.
  const byDefault = await page(undefined);
  expect(byDefault).toContain('href="/admin/search">Search console');
});
