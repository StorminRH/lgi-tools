'use client';

import { useState } from 'react';
import {
  type DashboardSectionId,
  PREFERRED_SECTION_ORDER,
  type SectionStatus,
  settledSectionOrder,
} from './dashboard-sections';

// Holds the preferred order until every section has settled, then locks the
// sorted order for the life of the grid so a painted dashboard never reshuffles.
export function useSettledSectionOrder(
  status: Readonly<Record<DashboardSectionId, SectionStatus>>,
): readonly DashboardSectionId[] {
  const [locked, setLocked] = useState<DashboardSectionId[] | null>(null);
  const order = locked ?? settledSectionOrder(status);
  if (order !== locked) setLocked(order);
  return order ?? PREFERRED_SECTION_ORDER;
}
