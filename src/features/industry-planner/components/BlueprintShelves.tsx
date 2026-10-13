'use client';

import { IntentPrefetchLink } from '@/components/intent-prefetch-link';
import { TypeIcon } from '@/components/type-icon';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { EntityRow } from '@/components/ui/row';
import { SectionLabel } from '@/components/ui/section-label';
import { Skeleton } from '@/components/ui/skeleton';
import { blueprintImage } from '@/data/eve-data/type-images';
import { useFavoriteBlueprints } from '../favorite-blueprints';
import { useRecentBlueprints } from '../recent-blueprints';

type ShelfBlueprint = { typeId: number; name: string };

function Shelf({ label, empty, blueprints }: { label: string; empty: string; blueprints: readonly ShelfBlueprint[] | null }) {
  return (
    <section aria-label={label}>
      <SectionLabel className="mb-cluster">{label}</SectionLabel>
      <Card className="overflow-hidden">
        {blueprints === null && <Skeleton label={`Loading ${label.toLowerCase()}`} className="mx-3.5 my-[15px] h-4 w-3/5 rounded-ctl" />}
        {blueprints?.length === 0 && <EmptyState>{empty}</EmptyState>}
        {blueprints?.map((blueprint) => (
          <IntentPrefetchLink
            key={blueprint.typeId}
            href={`/industry/${blueprint.typeId}`}
            transitionTypes={['industry-tab']}
            className="block border-l-2 border-l-transparent no-underline transition-colors first:[&>div]:border-t-0 hover:border-l-isk hover:bg-isk-hover"
          >
            <EntityRow
              colsClass="grid-cols-[26px_minmax(0,1fr)]"
              className="py-[11px]"
              leading={<TypeIcon {...blueprintImage(blueprint.typeId)} size={26} mono={blueprint.name} />}
              name={<span className="font-semibold">{blueprint.name}</span>}
            />
          </IntentPrefetchLink>
        ))}
      </Card>
    </section>
  );
}

/** The blueprints this device opened last beside the ones starred, each a way back into the planner. */
export function BlueprintShelves() {
  const recent = useRecentBlueprints();
  const { favorites } = useFavoriteBlueprints();
  return (
    <div className="grid grid-cols-1 items-start gap-4 split:grid-cols-2">
      <Shelf label="Recents" empty="No recent blueprints" blueprints={recent} />
      <Shelf label="Favorites" empty="No favorite blueprints" blueprints={favorites} />
    </div>
  );
}
