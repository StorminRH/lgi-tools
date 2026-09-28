import { Card } from '@/components/ui/card';
import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { SectionHeader } from '@/components/ui/section-header';
import { getAccountTotals } from '@/platform/auth/admin-users';
import { CardLink } from './CardLink';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { SectionUnavailable } from './SectionUnavailable';

export async function AccountsCard() {
  const totals = await loadSection('accounts', getAccountTotals);
  if (totals === SECTION_LOAD_FAILED) return <SectionUnavailable label="Registered users" />;
  return (
    <Card data-admin-accounts>
      <SectionHeader
        size="md"
        label="Registered users"
        hint={
          <span className="flex items-center gap-3">
            <span className="hidden sm:inline">right now</span>
            <CardLink href="/settings/access">Users &amp; roles</CardLink>
          </span>
        }
      />
      <MultiplesGrid columns={2}>
        <MultiplesCell title="User accounts" value={totals.users.toLocaleString()}>
          {null}
        </MultiplesCell>
        <MultiplesCell
          title="Unique characters"
          value={totals.characters.toLocaleString()}
          note="linked across all accounts"
        >
          {null}
        </MultiplesCell>
      </MultiplesGrid>
    </Card>
  );
}
