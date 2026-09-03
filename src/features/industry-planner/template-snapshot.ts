import { z } from 'zod';
import { MAX_ME } from './me-overrides';
import { MAX_TE } from './te-overrides';

const systemRefSchema = z.object({
  systemId: z.number().int().positive(),
  systemName: z.string().min(1),
  security: z.number().nullable(),
});

const structureRefSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
});

export const snapshotFieldSchemas = {
  runs: z.number().int().min(1),
  buildSystem: systemRefSchema.nullable(),
  station: z.object({ id: z.number().int().positive(), name: z.string() }).nullable(),
  buildCharacterId: z.number().int().positive().nullable(),
  buildStructure: structureRefSchema.nullable(),
  reactionSystem: systemRefSchema.nullable(),
  reactionStructure: structureRefSchema.nullable(),

  meOverrides: z.array(z.tuple([z.number().int().positive(), z.number().int().min(0).max(MAX_ME)])),
  teOverrides: z.array(z.tuple([z.number().int().positive(), z.number().int().min(0).max(MAX_TE)])),
  costBasis: z.enum(['batched', 'marginal']),
  marginMode: z.enum(['gross', 'net']),
  multibuyMode: z.enum(['Total', 'Remaining']),

  multibuyUncheckedTiers: z.array(z.number().int().min(1)),
} as const;

export const planSnapshotV1Schema = z.object({
  v: z.literal(1),
  blueprintTypeId: z.number().int().positive(),
  ...snapshotFieldSchemas,
});

export type PlanSnapshotV1 = z.infer<typeof planSnapshotV1Schema>;

export type TemplateFieldKey = keyof typeof snapshotFieldSchemas;

export const planSnapshotWireSchema = z.looseObject({
  v: z.literal(1),
  blueprintTypeId: z.number().int().positive(),
});

export type PlanSnapshotWire = z.infer<typeof planSnapshotWireSchema>;
