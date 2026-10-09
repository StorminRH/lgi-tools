import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { formatQuantity } from '@/lib/format/number';
import type { AccountTotals as Totals } from '@/platform/auth/admin-users';

export function AccountTotals({ totals }: { totals: Totals }) {
  return (
    <MultiplesGrid columns={2}>
      <MultiplesCell title="User accounts" value={formatQuantity(totals.users)} />
      <MultiplesCell title="Unique characters" value={formatQuantity(totals.characters)} />
    </MultiplesGrid>
  );
}
