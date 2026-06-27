// Shared cold-payload helper for the owned-blueprints datasets (3.7.5.1) — used
// by both the character (convex/characterBlueprints.ts) and corp
// (convex/corpBlueprints.ts) applies. Convex-local (Infer off the schema
// validator, no zod) so the query/mutation bundles stay lean.
import type { Infer } from 'convex/values';
import type { ownedBlueprintValidator } from '../schema';

export type OwnedBlueprint = Infer<typeof ownedBlueprintValidator>;

// Element-wise equality for the canonically-sorted owned-blueprint projection.
// Lets the apply skip rewriting the cold doc — and so re-firing the reactive
// forViewer read — when an hourly sync returns the same set (the multi-page path
// always reassembles a fresh body, so without this it would rewrite every run).
// Order matches because parseBlueprintsBody sorts canonically before storage.
export function sameBlueprints(a: OwnedBlueprint[], b: OwnedBlueprint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.type_id !== y.type_id ||
      x.material_efficiency !== y.material_efficiency ||
      x.time_efficiency !== y.time_efficiency ||
      x.runs !== y.runs ||
      x.quantity !== y.quantity ||
      x.location_id !== y.location_id ||
      x.location_flag !== y.location_flag
    ) {
      return false;
    }
  }
  return true;
}
