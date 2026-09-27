import { EmptyState } from '@/components/ui/empty-state';
import type { ActivityChartData } from './activity-view';
import { AdminDailyChart } from './charts';
import { DeltaBadge } from './DeltaBadge';

export function ActivityChart({ activity }: { activity: ActivityChartData }) {
  if (!activity.hasData) return <EmptyState>No events in this range.</EmptyState>;
  return (
    <>
      <div className="flex items-baseline gap-2 px-3.5 pt-3">
        <span className="font-data text-lead text-name tabular-nums">
          {activity.endValue.toLocaleString()}
        </span>
        <span className="text-micro uppercase tracking-wide text-muted">events latest day</span>
        {activity.endDelta && <DeltaBadge delta={activity.endDelta} />}
      </div>
      <div className="overflow-x-auto px-3.5 py-3">
        <AdminDailyChart
          points={activity.points}
          average={activity.average}
          labels={activity.labels}
          weekend={activity.weekend}
          referenceLine={activity.referenceLine}
          eventMarkers={activity.eventMarkers}
          endValue={activity.endValue}
          endDelta={activity.endDelta}
          unit="count"
          ariaLabel="Events per day with a 7-day average and prior-period reference"
        />
      </div>
    </>
  );
}
