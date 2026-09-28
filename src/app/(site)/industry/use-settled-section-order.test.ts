import { expect, test, vi } from 'vitest';

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

test('holds the preferred order while pending, then locks the first settled order', () => {
  h.locked = null;
  h.setLocked.mockReset();

  expect(useSettledSectionOrder(status({ saved: 'empty', corp: 'pending' }))).toBe(
    PREFERRED_SECTION_ORDER,
  );
  expect(h.setLocked).not.toHaveBeenCalled();

  const order = useSettledSectionOrder(status({ saved: 'empty' }));
  expect(order).toEqual(['recents', 'active', 'corp', 'saved']);
  expect(h.setLocked).toHaveBeenCalledWith(order);

  h.locked = order;
  h.setLocked.mockReset();
  expect(useSettledSectionOrder(status())).toBe(order);
  expect(h.setLocked).not.toHaveBeenCalled();
});
