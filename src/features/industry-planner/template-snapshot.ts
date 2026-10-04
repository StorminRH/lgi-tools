import { z } from 'zod';

export const planSnapshotWireSchema = z.looseObject({
  v: z.literal(1),
  blueprintTypeId: z.number().int().positive(),
});
export type PlanSnapshotWire = z.infer<typeof planSnapshotWireSchema>;
