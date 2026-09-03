import { blueprintImage } from '@/data/eve-data/type-images';
import type { RecentBlueprint } from '../recent-blueprints';
import { IndustryRow } from './IndustryRow';

export function RecentBlueprintRows({ recent }: { recent: RecentBlueprint[] }) {
  return (
    <>
      {recent.map((r) => (
        <IndustryRow
          key={r.typeId}
          name={r.name}
          href={`/industry/${r.typeId}`}
          icon={blueprintImage(r.typeId)}
        />
      ))}
    </>
  );
}
