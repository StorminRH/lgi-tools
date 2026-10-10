import { CardLink } from '@/components/ui/text-link';
import { parseRange, rangeFor } from '@/composition/admin-period';
import { getAccountTotals } from '@/platform/auth/admin-users';
import { AccountTotals } from './AccountsCard';
import { ActionTiles, loadActionRows } from './ActionsCard';
import { AdminPageFrame } from './AdminFrame';
import { AttentionList, STATUS_CARDS } from './AdminOverviewCards';
import { AdminSection } from './AdminSection';
import { AudienceBody, AudienceLinks, loadAudience } from './AudienceCard';
import { LevelRows } from './LevelRows';
import { loadAdminSignals } from './load-signals';
import type { RangeSearchParams } from './RangeControl';
import { deriveStatusLines } from './signals';

async function OverviewContent({ searchParams }: { searchParams: RangeSearchParams }) {
  const rangeKey = parseRange((await searchParams).range);
  const range = rangeFor(rangeKey);
  // Request-cached: the attention list and the three status cards share one read.
  const signals = () => loadAdminSignals(rangeKey);
  return (
    <>
      <AdminSection title="Needs attention" name="attention" reveal={1} load={signals}>
        {(loaded) => <AttentionList signals={loaded} />}
      </AdminSection>
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
      <AdminSection title="Actions" name="actions" rows={2} reveal={3} load={loadActionRows}>
        {(rows) => <ActionTiles rows={rows} />}
      </AdminSection>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STATUS_CARDS.map((card) => (
          <AdminSection
            key={card.id}
            title={card.title}
            name={`status-${card.id}`}
            rows={card.rows}
            reveal={4}
            slotClassName="h-full"
            className="h-full"
            hint={<CardLink href={card.href}>{card.linkLabel}</CardLink>}
            load={signals}
          >
            {(loaded) => <LevelRows lines={deriveStatusLines(loaded, card.id)} />}
          </AdminSection>
        ))}
      </div>
      <AdminSection
        title="Audience"
        name="audience"
        rows={5}
        reveal={5}
        hint={<AudienceLinks />}
        load={() => loadAudience(rangeKey, range)}
      >
        {(audience) => <AudienceBody audience={audience} />}
      </AdminSection>
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
