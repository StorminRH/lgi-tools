import { parseRange, rangeFor } from '@/composition/admin-period';
import { getAccountTotals } from '@/platform/auth/admin-users';
import { AccountTotals } from './AccountsCard';
import { ActionsCard } from './ActionsCard';
import { AdminPageFrame, AdminSlot } from './AdminFrame';
import { AudienceCard } from './AudienceCard';
import { AttentionCard, StatusCards } from './AdminOverviewCards';
import { AdminSection } from './AdminSection';
import { CardLink } from './CardLink';
import type { RangeSearchParams } from './RangeControl';

async function OverviewContent({ searchParams }: { searchParams: RangeSearchParams }) {
  const rangeKey = parseRange((await searchParams).range);
  const range = rangeFor(rangeKey);
  return (
    <>
      <AdminSlot label="Needs attention" reveal={1}>
        <AttentionCard rangeKey={rangeKey} />
      </AdminSlot>
      <AdminSection
        title="Registered users"
        name="accounts"
        rows={2}
        reveal={2}
        hint={<CardLink href="/admin/users">Users &amp; roles</CardLink>}
        load={getAccountTotals}
      >
        {(totals) => <AccountTotals totals={totals} />}
      </AdminSection>
      <AdminSlot label="Actions" rows={2} reveal={3}>
        <ActionsCard />
      </AdminSlot>
      <AdminSlot label="System status" rows={4} reveal={4}>
        <StatusCards rangeKey={rangeKey} />
      </AdminSlot>
      <AdminSlot label="Audience" rows={5} reveal={5}>
        <AudienceCard rangeKey={rangeKey} range={range} />
      </AdminSlot>
    </>
  );
}

export default function AdminOverviewPage({ searchParams }: { searchParams: RangeSearchParams }) {
  return (
    <AdminPageFrame
      title="Overview"
      rangeBasePath="/admin"
      fallbackLabel="Needs attention"
    >
      <OverviewContent searchParams={searchParams} />
    </AdminPageFrame>
  );
}
