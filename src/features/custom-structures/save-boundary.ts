import { getStructureRigs, getStructureTypes, solarSystemExists } from '@/data/eve-data/queries';
import { validationFailure, type AppFailure } from '@/lib/failure';
import { validateCustomStructureSelection, type CustomStructureSelection } from './validation';

type InputCheck = { ok: true } | { ok: false; failure: AppFailure };

async function rejectUnknownSystemPin(systemId: number | null): Promise<InputCheck> {
  if (systemId !== null && !(await solarSystemExists(systemId))) {
    return {
      ok: false,
      failure: validationFailure('unknown_system', 'unknown system'),
    };
  }
  return { ok: true };
}

/** The save boundary shared by create and update: a known hull, rigs that fit it, a real system. */
export async function rejectInvalidCustomStructure(
  input: CustomStructureSelection & { systemId: number | null },
): Promise<{ ok: true } | { ok: false; failure: AppFailure }> {
  const [types, rigs] = await Promise.all([getStructureTypes(), getStructureRigs()]);
  const check = validateCustomStructureSelection(input, types, rigs);
  if (!check.ok) return { ok: false, failure: validationFailure('invalid_structure', check.reason) };
  return rejectUnknownSystemPin(input.systemId);
}
