import { createElement, type ReactNode } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPageFrame } from './AdminFrame';
import AdminLayout from './layout';

const mocks = vi.hoisted(() => ({
  requireAdminPage: vi.fn(),
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

vi.mock('./queue-stats-shared', () => ({
  getEsiRefreshQueueStatsShared: async () => {
    throw new Error('offline');
  },
}));

vi.mock('./statics-review-shared', () => ({
  getStaticsReviewShared: async () => null,
}));

vi.mock('./codex-pending-shared', () => ({
  getCodexPendingShared: async () => 0,
}));

function staticsFrame() {
  return AdminPageFrame({
    title: 'Wormhole statics',
    rangeBasePath: '/admin/statics',
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
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
    mocks.requireAdminPage.mockResolvedValue({ user: { id: 'admin-1' }, isAdmin: true });

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
  });
});
