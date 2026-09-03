import { solarSystemExists } from '@/data/eve-data/queries';
import { validationFailure, type AppFailure } from '@/lib/failure';

export async function rejectUnknownSystemPin(
  systemId: number | null,
): Promise<{ ok: true } | { ok: false; failure: AppFailure }> {
  if (systemId !== null && !(await solarSystemExists(systemId))) {
    return {
      ok: false,
      failure: validationFailure('unknown_system', 'unknown system'),
    };
  }
  return { ok: true };
}
