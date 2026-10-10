import { and, count, eq } from 'drizzle-orm';
import { db } from '@/db';
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

export async function countCustomStructures(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(customStructures)
    .where(eq(customStructures.userId, userId));
  return Number(row?.n ?? 0);
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

export async function createCustomStructure(
  userId: string,
  input: CustomStructureRow,
): Promise<void> {
  await db.insert(customStructures).values({ id: input.id, userId, ...rowValues(input) });
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
