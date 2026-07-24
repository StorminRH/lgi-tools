import { solarSystemExists } from '@/data/eve-data/queries';
import { validationFailure, type AppFailure } from '@/lib/failure';

/**
 * Shared trust-boundary check for the create + set-pin routes: an optional
 * system pin must reference a real solar system (the column is FK-less on
 * purpose — the SDE tables are truncate-rebuilt on re-ingest). Returns a typed
 * validation failure to short-circuit the handler, or null to proceed.
 */
export async function rejectUnknownSystemPin(
  systemId: number | null,
): Promise<AppFailure | null> {
  if (systemId !== null && !(await solarSystemExists(systemId))) {
    return validationFailure('unknown_system', 'unknown system');
  }
  return null;
}
