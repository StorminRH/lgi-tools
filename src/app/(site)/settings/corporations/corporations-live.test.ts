import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import type { CorpStructurePageView } from '@/features/owned-structures/types';

const live = vi.hoisted(() => ({ corps: null as CorpStructurePageView[] | null }));
vi.mock('@/features/owned-structures/use-corp-structures-live', () => ({
  useCorpStructuresLive: (initial: CorpStructurePageView[]) => ({ corporations: live.corps ?? initial, failed: false, retry: vi.fn() }),
}));
vi.mock('./corp-sharing-card', () => ({
  CorpSharingCard: ({ directorCorps }: { directorCorps: { corporationName: string }[] }) =>
    createElement('div', null, `Sharing: ${directorCorps.map((corp) => corp.corporationName).join(', ')}`),
}));

import { CorporationsLive } from './corporations-live';

const corp = (corporationId: number, over: Partial<CorpStructurePageView> = {}): CorpStructurePageView => ({
  corporationId,
  corporationName: `Corp ${corporationId}`,
  structureAccess: 'manage',
  canManageSharing: true,
  sharing: 'on',
  structures: [],
  lastRefreshedAt: null,
  ...over,
});

const render = (initial: CorpStructurePageView[]) => renderToStaticMarkup(createElement(CorporationsLive, { initial }));

beforeEach(() => {
  live.corps = null;
});

test('draws the server render until the live read lands, then the newer memberships', () => {
  expect(render([])).toContain('No corporation memberships known yet');
  const first = render([corp(1)]);
  expect(first).toContain('Corp 1');
  expect(first).toContain('Sharing: Corp 1');
  expect(first).toContain('Director');

  live.corps = [corp(1, { canManageSharing: false, structureAccess: 'use', sharing: 'off' }), corp(2)];
  const streamed = render([corp(1)]);
  expect(streamed).toContain('Corp 2');
  expect(streamed).toContain('Sharing: Corp 2');
  expect(streamed).toContain('sharing off');
});
