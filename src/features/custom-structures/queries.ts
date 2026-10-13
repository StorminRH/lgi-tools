import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { insertWithinCap } from '@/db/capped-insert';
import { MAX_CUSTOM_STRUCTURES_PER_USER } from './api-contract';
import { customStructures } from './schema';
import type { CustomStructureRow } from './types';

export async function listCustomStructures(userId: string): Promise<CustomStructureRow[]> {
  return db
    .select({
      id: customStructures.id,
      name: customStructures.name,
      structureTypeId: customStructures.structureTypeId,
      rigTypeIds: customStructures.rigTypeIds,
      systemId: customStructures.systemId,
      taxPct: customStructures.taxPct,
      bonuses: customStructures.bonuses,
    })
    .from(customStructures)
    .where(eq(customStructures.userId, userId))
    .orderBy(customStructures.createdAt);
}

function rowValues(input: Omit<CustomStructureRow, 'id'>) {
  return {
    name: input.name,
    structureTypeId: input.structureTypeId,
    rigTypeIds: input.rigTypeIds,
    systemId: input.systemId,
    taxPct: input.taxPct,
    bonuses: input.bonuses,
  };
}

/** Saves a new structure unless the account already holds the most it may. Returns whether it landed. */
export function createCustomStructure(
  userId: string,
  input: CustomStructureRow,
): Promise<boolean> {
  return insertWithinCap({
    table: customStructures,
    values: { id: input.id, userId, ...rowValues(input) },
    scope: eq(customStructures.userId, userId),
    cap: MAX_CUSTOM_STRUCTURES_PER_USER,
  });
}

export async function deleteCustomStructure(userId: string, id: string): Promise<void> {
  await db
    .delete(customStructures)
    .where(and(eq(customStructures.userId, userId), eq(customStructures.id, id)));
}

export async function updateCustomStructure(
  userId: string,
  id: string,
  input: Omit<CustomStructureRow, 'id'>,
): Promise<void> {
  await db
    .update(customStructures)
    .set(rowValues(input))
    .where(and(eq(customStructures.userId, userId), eq(customStructures.id, id)));
}
