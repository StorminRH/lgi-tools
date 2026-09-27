import { beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ locked: null as unknown, setLocked: vi.fn() }));

vi.mock('react', () => ({
  useState: () => [h.locked, h.setLocked],
}));

import { PREFERRED_SECTION_ORDER, type DashboardSectionId, type SectionStatus } from './dashboard-sections';
import { useSettledSectionOrder } from './use-settled-section-order';

function status(
  overrides: Partial<Record<DashboardSectionId, SectionStatus>> = {},
): Record<DashboardSectionId, SectionStatus> {
  return { recents: 'populated', saved: 'populated', active: 'populated', corp: 'populated', ...overrides };
}

beforeEach(() => {
  h.locked = null;
  h.setLocked.mockReset();
});

test('keeps the preferred order while a section is pending', () => {
  expect(useSettledSectionOrder(status({ saved: 'empty', corp: 'pending' }))).toBe(PREFERRED_SECTION_ORDER);
  expect(h.setLocked).not.toHaveBeenCalled();
});

test('locks the sorted order once every section settles', () => {
  const order = useSettledSectionOrder(status({ saved: 'empty' }));
  expect(order).toEqual(['recents', 'active', 'corp', 'saved']);
  expect(h.setLocked).toHaveBeenCalledWith(order);
});

test('keeps a locked order when statuses change later', () => {
  const locked: DashboardSectionId[] = ['recents', 'active', 'corp', 'saved'];
  h.locked = locked;
  expect(useSettledSectionOrder(status())).toBe(locked);
  expect(h.setLocked).not.toHaveBeenCalled();
});
