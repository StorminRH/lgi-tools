// The dashboard's Saved-builds rows (3.7.24): each saved template as an
// IndustryRow linking to its own planner page with ?plan= — the ONE template
// load mechanism (TemplateLoader on the target page replays it; a tile carries
// zero loader logic). The list arrives pre-cut and server-ordered (favorites
// first, then recency) — no sorting here.
import type { SavedPlanRow } from '../api-contract';
import { IndustryRow } from './IndustryRow';

export function SavedBuildTiles({ plans }: { plans: SavedPlanRow[] }) {
  return (
    <>
      {plans.map((row) => (
        <IndustryRow
          key={row.id}
          name={row.name}
          group={row.productName}
          fav={row.favorite}
          href={`/industry/${row.blueprintTypeId}?plan=${row.id}`}
        />
      ))}
    </>
  );
}
