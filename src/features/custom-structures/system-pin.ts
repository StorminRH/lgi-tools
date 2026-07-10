import { solarSystemExists } from '@/data/eve-data/queries';

// Shared trust-boundary check for the create + set-pin routes: an optional
// system pin must reference a real solar system (the column is FK-less on
// purpose — the SDE tables are truncate-rebuilt on re-ingest). Returns the 400
// Response to short-circuit the handler, or null to proceed.
export async function rejectUnknownSystemPin(systemId: number | null): Promise<Response | null> {
  if (systemId !== null && !(await solarSystemExists(systemId))) {
    return new Response('unknown system', { status: 400 });
  }
  return null;
}
