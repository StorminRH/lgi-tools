import { parseRange, rangeFor } from '@/composition/admin-period';
import { AdminPageFrame, AdminSlot } from '../AdminFrame';
import type { RangeSearchParams } from '../RangeControl';
import { CodexBlobCard } from './CodexBlobCard';
import { EventLogCard, ServiceLevelsCard } from './HealthCards';
import { ScheduledTasks } from './ScheduledTasks';

async function HealthContent({ searchParams }: { searchParams: RangeSearchParams }) {
  const range = rangeFor(parseRange((await searchParams).range));
  return (
    <>
      <AdminSlot label="Service levels" rows={5} reveal={1}>
        <ServiceLevelsCard range={range} />
      </AdminSlot>
      <AdminSlot label="Scheduled tasks" reveal={2}>
        <ScheduledTasks range={range} />
      </AdminSlot>
      <AdminSlot label="Event log" rows={6} reveal={3}>
        <EventLogCard />
      </AdminSlot>
      <AdminSlot label="Codex images" rows={1} reveal={4}>
        <CodexBlobCard />
      </AdminSlot>
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
