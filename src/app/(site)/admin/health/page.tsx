import { parseRange, rangeFor } from '@/composition/admin-period';
import { listRecentDomainEvents } from '@/data/domain-events/queries';
import { AdminPageFrame } from '../AdminFrame';
import { AdminSection } from '../AdminSection';
import type { RangeSearchParams } from '../RangeControl';
import { EventLog, loadServiceLevels } from './HealthCards';
import { loadScheduledTasks, ScheduledTaskRows } from './ScheduledTasks';
import { ServiceLevelRows } from './ServiceLevelRows';

const EVENT_LOG_LENGTH = 30;

async function HealthContent({ searchParams }: { searchParams: RangeSearchParams }) {
  const range = rangeFor(parseRange((await searchParams).range));
  return (
    <>
      <AdminSection
        title="Service levels"
        name="service-levels"
        rows={5}
        reveal={1}
        load={() => loadServiceLevels(range)}
      >
        {(levels) => <ServiceLevelRows rows={levels.rows} details={levels.details} />}
      </AdminSection>
      {/* The overview's Jobs card and attention items link here as #scheduled. */}
      <AdminSection
        title="Scheduled tasks"
        name="scheduled-tasks"
        anchor="scheduled"
        rows={4}
        reveal={2}
        load={() => loadScheduledTasks(range)}
      >
        {(tasks) => <ScheduledTaskRows tasks={tasks} />}
      </AdminSection>
      <AdminSection
        title="Event log"
        name="event-log"
        rows={6}
        reveal={3}
        load={() => listRecentDomainEvents(EVENT_LOG_LENGTH)}
      >
        {(events) => <EventLog events={events} />}
      </AdminSection>
    </>
  );
}

export default function AdminHealthPage({ searchParams }: { searchParams: RangeSearchParams }) {
  return (
    <AdminPageFrame
      title="Health"
      rangeBasePath="/admin/health"
      fallbackLabel="Service levels"
    >
      <HealthContent searchParams={searchParams} />
    </AdminPageFrame>
  );
}
