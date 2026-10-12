import { haltOf, inDowntimeWindow, isHalted, STATUS_KEY } from './downtime';
import { readStoredRows } from './rows';
import type { EsiStoreKey } from './types';

/**
 * Whether the daily-downtime halt stops a call right now. Outside the
 * window nothing can be halted, so no row is read; inside it the halt is
 * whatever the shared `/status/` row says, so every instance stops and
 * resumes together. The status probe itself is never halted.
 */
export async function esiHalted(key: EsiStoreKey, now: number): Promise<boolean> {
  if (key.route === STATUS_KEY.route || !inDowntimeWindow(now)) return false;
  const [row] = await readStoredRows([STATUS_KEY]);
  return isHalted(haltOf(row?.body), now);
}
