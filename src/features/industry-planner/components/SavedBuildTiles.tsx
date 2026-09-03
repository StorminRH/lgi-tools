import { blueprintImage } from '@/data/eve-data/type-images';
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
          icon={blueprintImage(row.blueprintTypeId)}
          fav={row.favorite}
          href={`/industry/${row.blueprintTypeId}?plan=${row.id}`}
        />
      ))}
    </>

  );
}
