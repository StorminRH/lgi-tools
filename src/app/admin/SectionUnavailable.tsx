import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';

/**
 * Rendered in place of an admin section whose data failed to load, so one broken
 * query degrades to a contained panel instead of 500-ing the whole dashboard.
 */
export function SectionUnavailable({ label }: { label: string }) {
  return (
    <Card>
      <SectionHeader size="md" label={label} hint="unavailable" />
      <EmptyState>
        This section couldn’t load — the rest of the dashboard is unaffected.
        Reload to try again.
      </EmptyState>
    </Card>
  );
}
