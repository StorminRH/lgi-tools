import { parseRange, rangeFor } from '@/composition/admin-period';
import { ActionsCard } from './ActionsCard';
import { AdminPageFrame, AdminSlot } from './AdminFrame';
import { AudienceCard } from './AudienceCard';
import { AttentionCard, StatusCards } from './AdminOverviewCards';
import type { RangeSearchParams } from './RangeControl';

async function OverviewContent({ searchParams }: { searchParams: RangeSearchParams }) {
  const rangeKey = parseRange((await searchParams).range);
  const range = rangeFor(rangeKey);
  return (
    <>
      <AdminSlot label="Needs attention" reveal={1}>
        <AttentionCard rangeKey={rangeKey} />
      </AdminSlot>
      <AdminSlot label="Actions" rows={2} reveal={2}>
        <ActionsCard />
      </AdminSlot>
      <AdminSlot label="System status" rows={4} reveal={3}>
        <StatusCards rangeKey={rangeKey} />
      </AdminSlot>
      <AdminSlot label="Audience" rows={5} reveal={4}>
        <AudienceCard rangeKey={rangeKey} range={range} />
      </AdminSlot>
    </>
  );
}

export default function AdminOverviewPage({ searchParams }: { searchParams: RangeSearchParams }) {
  return (
    <AdminPageFrame
      title="Overview"
      description="What needs you now, how each system is doing, and who is using the app."
      rangeBasePath="/admin"
      fallbackLabel="Needs attention"
    >
      <OverviewContent searchParams={searchParams} />
    </AdminPageFrame>
  );
}
