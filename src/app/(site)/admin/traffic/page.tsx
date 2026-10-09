import { parseRange, rangeFor } from '@/composition/admin-period';
import { AdminPageFrame, AdminSlot } from '../AdminFrame';
import type { RangeSearchParams } from '../RangeControl';
import { ActivityCard, PilotsCard, TrafficLists } from './TrafficCards';

async function TrafficContent({ searchParams }: { searchParams: RangeSearchParams }) {
  const rangeKey = parseRange((await searchParams).range);
  const range = rangeFor(rangeKey);
  return (
    <>
      <AdminSlot label="Activity" rows={4} reveal={1}>
        <ActivityCard rangeKey={rangeKey} range={range} />
      </AdminSlot>
      <AdminSlot label="Top pages" rows={8} reveal={2}>
        <TrafficLists rangeKey={rangeKey} range={range} />
      </AdminSlot>
      <AdminSlot label="Visitors & pilots" rows={4} reveal={3}>
        <PilotsCard rangeKey={rangeKey} range={range} />
      </AdminSlot>
    </>
  );
}

export default function AdminTrafficPage({ searchParams }: { searchParams: RangeSearchParams }) {
  return (
    <AdminPageFrame
      title="Traffic"
      rangeBasePath="/admin/traffic"
      fallbackLabel="Activity"
    >
      <TrafficContent searchParams={searchParams} />
    </AdminPageFrame>
  );
}
