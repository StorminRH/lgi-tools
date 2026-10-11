import { expect, test, vi } from 'vitest';
import type { DateRange } from '@/data/telemetry/types';

const m = vi.hoisted(() => ({ pageViews: vi.fn(), markers: vi.fn() }));

vi.mock('./shared-reads', () => ({ getPageViewStatsShared: m.pageViews }));
vi.mock('./deploy-markers', () => ({ loadDeployMarkers: m.markers }));

import { loadActivityView } from './load-activity';

const range: DateRange = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-03T00:00:00Z') };
const previous: DateRange = { from: new Date('2026-09-29T00:00:00Z'), to: range.from };
const views = (day: string, count: number) => ({ day, views: count, entries: 0, referrals: 0 });

test('charts the page-view days against the period before, with each release marked', async () => {
  m.pageViews.mockResolvedValue({
    current: [views('2026-10-01', 6), views('2026-10-02', 4)],
    previous: [views('2026-09-30', 5)],
  });
  m.markers.mockResolvedValue([{ date: '2026-10-02', label: 'v4.2.0' }]);

  const activity = await loadActivityView(range, previous);

  expect(m.pageViews).toHaveBeenLastCalledWith(range, previous);
  expect(activity.points.map((point) => point.y)).toEqual([6, 4]);
  expect(activity.totalValue).toBe(10);
  expect(activity.referenceLine).toEqual({ value: 2.5, label: 'prior avg' });
  expect(activity.endDelta).toEqual({ pct: 100, direction: 'up' });
  expect(activity.eventMarkers).toEqual([{ x: 1, label: 'v4.2.0' }]);
});

test('draws no prior line or change when the range has no period before it', async () => {
  m.pageViews.mockResolvedValue({ current: [views('2026-10-01', 6)], previous: null });
  m.markers.mockResolvedValue([]);

  const activity = await loadActivityView(range, null);

  expect(m.pageViews).toHaveBeenLastCalledWith(range, null);
  expect(activity.totalValue).toBe(6);
  expect(activity.referenceLine).toBeNull();
  expect(activity.endDelta).toBeNull();
});
