import { z } from 'zod';
import { MAX_ME } from './me-overrides';
import { MAX_TE } from './te-overrides';

// The saved-plan snapshot (3.7.23.1) — the planner's complete CONFIGURATION,
// inputs only, versioned. Derived values (prices, times, costs, the ledger) are
// NEVER stored: loading replays these inputs through the provider's public
// setters and the live engine recomputes fresh. References are stored by stable
// id (+ a display name where the "what fell away" note needs one) and resolved
// against live data at load time; a reference that no longer resolves degrades
// ITS field to the unset default — per-field, fail-open, never an error.
//
// The wire contract validates only { v: 1 } plus a byte cap: deep per-field
// validation happens at LOAD (template-manifest.ts), field by field, because
// references go stale AFTER a valid save and a malformed field must degrade
// alone rather than void the template.

// A picked system: the identifier triple the planner.buildLocation preference
// already persists — live stations/indices/prices are re-fetched on restore.
const systemRefSchema = z.object({
  systemId: z.number().int().positive(),
  systemName: z.string().min(1),
  security: z.number().nullable(),
});

// A picked structure: `id` is the AvailableStructure id ('corp:<structureId>'
// or a custom-structure UUID); `name` exists solely so a degrade note can say
// which structure fell away.
const structureRefSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
});

// One schema per template field, exported individually so the manifest
// (template-manifest.ts) validates each field alone at load time. Adding a
// field here without a manifest entry (or vice versa) fails tsc — the two are
// tied by TemplateFieldKey.
export const snapshotFieldSchemas = {
  runs: z.number().int().min(1),
  buildSystem: systemRefSchema.nullable(),
  station: z.object({ id: z.number().int().positive(), name: z.string() }).nullable(),
  buildCharacterId: z.number().int().positive().nullable(),
  buildStructure: structureRefSchema.nullable(),
  reactionSystem: systemRefSchema.nullable(),
  reactionStructure: structureRefSchema.nullable(),
  // Keyed by PRODUCING blueprint type id (the me-overrides/te-overrides model);
  // a key absent from the loaded tree is inert by construction.
  meOverrides: z.array(z.tuple([z.number().int().positive(), z.number().int().min(0).max(MAX_ME)])),
  teOverrides: z.array(z.tuple([z.number().int().positive(), z.number().int().min(0).max(MAX_TE)])),
  costBasis: z.enum(['batched', 'marginal']),
  marginMode: z.enum(['gross', 'net']),
  multibuyMode: z.enum(['Total', 'Remaining']),
  // Tier DEPTHS the user unchecked (the inverted multibuy set); depths the
  // recomputed tier cut doesn't produce are inert.
  multibuyUncheckedTiers: z.array(z.number().int().min(1)),
} as const;

export const planSnapshotV1Schema = z.object({
  v: z.literal(1),
  blueprintTypeId: z.number().int().positive(),
  ...snapshotFieldSchemas,
});

export type PlanSnapshotV1 = z.infer<typeof planSnapshotV1Schema>;

// Every configurable field (identity fields v/blueprintTypeId excluded).
export type TemplateFieldKey = keyof typeof snapshotFieldSchemas;
