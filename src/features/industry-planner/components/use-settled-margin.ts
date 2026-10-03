'use client';

import { useState } from 'react';
import type { CockpitMarginView } from '../cockpit-kpis-view';

/**
 * While a new profile's fees are read, the net margin settled before stays
 * up, marked as updating, rather than flipping to gross and back. `live`
 * must keep its identity while its inputs do.
 */
export function useSettledMargin(live: CockpitMarginView, feesPending: boolean): { view: CockpitMarginView; held: boolean } {
  const [settled, setSettled] = useState(live);
  if (!feesPending && settled !== live) setSettled(live);
  const held = feesPending && settled.showNet;
  return { view: held ? settled : live, held };
}
