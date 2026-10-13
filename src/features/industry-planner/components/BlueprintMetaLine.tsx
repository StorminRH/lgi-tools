import { formatQuantity } from '@/lib/format/number';

function Separator() {
  return <span aria-hidden className="text-faint">·</span>;
}

/**
 * A blueprint's kind under its name: its group, its activity, and what one run
 * makes. A missing group or activity drops out, and so does an activity that
 * only repeats the group (a reaction filed under Reaction).
 */
export function BlueprintMetaLine({
  group,
  activity,
  perRun,
}: {
  group: string;
  activity: string | null;
  perRun: number;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-data text-micro uppercase tracking-label text-muted">
      {group && (
        <>
          <span>{group}</span>
          <Separator />
        </>
      )}
      {activity !== null && activity !== group && (
        <>
          <span className="text-tone-blue">{activity}</span>
          <Separator />
        </>
      )}
      <span>{formatQuantity(perRun)} per run</span>
    </p>
  );
}
