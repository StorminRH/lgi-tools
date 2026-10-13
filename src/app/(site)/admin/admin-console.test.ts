import { createElement, type ReactNode } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { adminSessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';
import { AdminPageFrame } from './AdminFrame';
import AdminLayout from './layout';

const mocks = vi.hoisted(() => ({
  requireAdminPage: vi.fn<() => Promise<BetterAuthSession>>(),
}));

vi.mock('@/composition/route-guards', () => ({
  requireAdminPage: () => mocks.requireAdminPage(),
}));

vi.mock('next/navigation', () => ({
  unstable_rethrow: () => undefined,
  usePathname: () => '/admin/statics',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('./shared-reads', () => ({
  getStaticsSummaryShared: async () => {
    throw new Error('offline');
  },
}));

function staticsFrame() {
  return AdminPageFrame({
    section: 'statics',
    actions: createElement('button', { type: 'submit' }, 'Check feed now'),
    fallbackLabel: 'Serving copy',
    children: createElement('p', null, 'Pending feed v42'),
  });
}

async function render(element: ReactNode): Promise<string> {
  const { prelude } = await prerender(element, { onError: () => undefined });
  return new Response(prelude).text();
}

function renderConsole(): Promise<string> {
  return render(AdminLayout({ children: staticsFrame() }));
}

describe('admin console gate', () => {
  beforeEach(() => {
    mocks.requireAdminPage.mockReset();
    silenceConsolePrefixes('error', ['[admin] admin-nav-badges section unavailable']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders only a neutral loading label for a non-admin', async () => {
    mocks.requireAdminPage.mockRejectedValue(new Error('NEXT_REDIRECT'));

    const markup = await renderConsole();

    expect(markup).toContain('Loading…');
    for (const adminText of [
      'Admin sections',
      'data-admin-layout',
      'data-admin-nav-item',
      '>Admin</h1>',
      'Overview',
      'Wormhole statics',
      'Check feed now',
      'Serving copy',
      'Pending feed v42',
    ]) {
      expect(markup).not.toContain(adminText);
    }
  });

  it('keeps a page segment neutral for a non-admin without the layout', async () => {
    mocks.requireAdminPage.mockRejectedValue(new Error('NEXT_REDIRECT'));

    const markup = await render(staticsFrame());

    expect(markup).toContain('Loading…');
    for (const adminText of ['Wormhole statics', 'Check feed now', 'Serving copy', 'Pending feed v42']) {
      expect(markup).not.toContain(adminText);
    }
  });

  it('renders the console chrome and page for an admin', async () => {
    mocks.requireAdminPage.mockResolvedValue(adminSessionFixture({ user: { id: 'admin-1' } }));

    const markup = await renderConsole();

    for (const adminText of [
      'Admin sections',
      'data-admin-layout',
      '>Admin</h1>',
      'Overview',
      'Wormhole statics',
      'Check feed now',
      'Pending feed v42',
    ]) {
      expect(markup).toContain(adminText);
    }
    // Statics reads no range, so its head offers none.
    expect(markup).not.toContain('Reporting range');
  });

  it('heads a ranged section with its title and a range control linked to its own page', async () => {
    mocks.requireAdminPage.mockResolvedValue(adminSessionFixture({ user: { id: 'admin-1' } }));

    const ranged = await render(
      AdminPageFrame({ section: 'traffic', fallbackLabel: 'Activity', children: createElement('p', null, 'Body') }),
    );
    expect(ranged).toContain('>Traffic</h2>');
    expect(ranged).toContain('Reporting range');
    expect(ranged).toContain('href="/admin/traffic?range=7d"');

    const named = await render(
      AdminPageFrame({ title: 'User', fallbackLabel: 'Account', children: createElement('p', null, 'Body') }),
    );
    expect(named).toContain('>User</h2>');
    expect(named).not.toContain('Reporting range');
  });
});
