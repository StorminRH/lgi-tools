import { z } from 'zod';

const corpStructureSchema = z.object({
  structure_id: z.number().int(),
  type_id: z.number().int(),
  system_id: z.number().int(),
  name: z.string().optional(),
});
const corpStructuresBodySchema = z.array(corpStructureSchema);

export type ParsedCorpStructure = z.infer<typeof corpStructureSchema>;

export function parseCorpStructuresBody(items: unknown[]): ParsedCorpStructure[] | null {
  const parsed = corpStructuresBodySchema.safeParse(items);
  if (!parsed.success) return null;
  return [...parsed.data].sort((a, b) => a.structure_id - b.structure_id);
}
