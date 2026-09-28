import { parseRange, rangeFor } from '@/composition/admin-period';
import { AdminPageFrame, AdminSlot } from '../AdminFrame';
import type { RangeSearchParams } from '../RangeControl';
import { BudgetCard, CostCards, PressureCard, PriceSourceCard } from './EsiCards';

async function EsiContent({ searchParams }: { searchParams: RangeSearchParams }) {
  const range = rangeFor(parseRange((await searchParams).range));
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminSlot label="Error budget" rows={4} reveal={1}>
          <BudgetCard />
        </AdminSlot>
        <AdminSlot label="Rate-limit pressure" rows={5} reveal={2}>
          <PressureCard range={range} />
        </AdminSlot>
      </div>
      <AdminSlot label="Price-source health" rows={4} reveal={3}>
        <PriceSourceCard range={range} />
      </AdminSlot>
      <AdminSlot label="ESI cost" rows={6} reveal={4}>
        <CostCards range={range} />
      </AdminSlot>
    </>
  );
}

export default function AdminEsiPage({ searchParams }: { searchParams: RangeSearchParams }) {
  return (
    <AdminPageFrame
      title="ESI & rate limits"
      description="CCP's shared error budget, how often we run into it, and what our ESI traffic costs."
      rangeBasePath="/admin/esi"
      fallbackLabel="Error budget"
    >
      <EsiContent searchParams={searchParams} />
    </AdminPageFrame>
  );
}
