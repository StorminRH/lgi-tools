import { z } from 'zod';

const ownedBlueprintSchema = z.object({
  type_id: z.number().int(),
  material_efficiency: z.number().int(),
  time_efficiency: z.number().int(),
  runs: z.number().int(),
  quantity: z.number().int(),
  location_id: z.number().int(),
  location_flag: z.string(),
});
const ownedBlueprintsBodySchema = z.array(ownedBlueprintSchema);

export type OwnedBlueprint = z.infer<typeof ownedBlueprintSchema>;

function compareBlueprints(a: OwnedBlueprint, b: OwnedBlueprint): number {
  return (
    a.type_id - b.type_id ||
    a.material_efficiency - b.material_efficiency ||
    a.time_efficiency - b.time_efficiency ||
    a.runs - b.runs ||
    a.quantity - b.quantity ||
    a.location_id - b.location_id ||
    (a.location_flag < b.location_flag ? -1 : a.location_flag > b.location_flag ? 1 : 0)
  );
}

export function parseBlueprintsBody(body: unknown): OwnedBlueprint[] | null {
  const parsed = ownedBlueprintsBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return [...parsed.data].sort(compareBlueprints);
}
