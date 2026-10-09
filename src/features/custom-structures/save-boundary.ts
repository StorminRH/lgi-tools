import { getStructureRigs, getStructureTypes, solarSystemExists } from '@/data/eve-data/queries';
import { validationFailure, type CheckResult } from '@/lib/failure';
import { validateCustomStructureSelection, type CustomStructureSelection } from './validation';

async function rejectUnknownSystemPin(systemId: number | null): Promise<CheckResult> {
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
): Promise<CheckResult> {
  const [types, rigs] = await Promise.all([getStructureTypes(), getStructureRigs()]);
  const check = validateCustomStructureSelection(input, types, rigs);
  if (!check.ok) return { ok: false, failure: validationFailure('invalid_structure', check.reason) };
  return rejectUnknownSystemPin(input.systemId);
}
