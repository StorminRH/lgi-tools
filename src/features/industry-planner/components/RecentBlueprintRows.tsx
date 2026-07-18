// The dashboard's recently-viewed rows, presentational since 3.7.24: the
// coordinator reads localStorage through useRecentBlueprints (null = not read
// yet) and owns the loading/empty states; this renders the settled list.
import { blueprintImage } from '@/data/eve-data/type-images';
import type { RecentBlueprint } from '../recent-blueprints';
import { IndustryRow } from './IndustryRow';

/** Renders the browser-local recent blueprint list and forwards planner navigation. */
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
