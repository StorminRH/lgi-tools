import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';

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
