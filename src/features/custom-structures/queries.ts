import { and, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { customStructures } from './schema';
import type { CustomStructureRow } from './types';

export async function listCustomStructures(userId: string): Promise<CustomStructureRow[]> {
  const rows = await db
    .select({
      id: customStructures.id,
      name: customStructures.name,
      structureTypeId: customStructures.structureTypeId,
      rigTypeIds: customStructures.rigTypeIds,
      systemId: customStructures.systemId,
      taxPct: customStructures.taxPct,
    })
    .from(customStructures)
    .where(eq(customStructures.userId, userId))
    .orderBy(customStructures.createdAt);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    structureTypeId: r.structureTypeId,
    rigTypeIds: r.rigTypeIds ?? [],
    systemId: r.systemId,
    taxPct: r.taxPct,
  }));
}

export async function countCustomStructures(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(customStructures)
    .where(eq(customStructures.userId, userId));
  return Number(row?.n ?? 0);
}

export async function createCustomStructure(
  userId: string,
  input: {
    id: string;
    name: string;
    structureTypeId: number;
    rigTypeIds: number[];
    systemId: number | null;
    taxPct: number | null;
  },
): Promise<void> {
  await db.insert(customStructures).values({
    id: input.id,
    userId,
    name: input.name,
    structureTypeId: input.structureTypeId,
    rigTypeIds: input.rigTypeIds,
    systemId: input.systemId,
    taxPct: input.taxPct,
  });
}

export async function deleteCustomStructure(userId: string, id: string): Promise<void> {
  await db
    .delete(customStructures)
    .where(and(eq(customStructures.userId, userId), eq(customStructures.id, id)));
}

export async function setCustomStructurePin(
  userId: string,
  id: string,
  systemId: number | null,
): Promise<void> {
  await db
    .update(customStructures)
    .set({ systemId })
    .where(and(eq(customStructures.userId, userId), eq(customStructures.id, id)));
}

export async function setCustomStructureTax(
  userId: string,
  id: string,
  taxPct: number | null,
): Promise<void> {
  await db
    .update(customStructures)
    .set({ taxPct })
    .where(and(eq(customStructures.userId, userId), eq(customStructures.id, id)));
}
