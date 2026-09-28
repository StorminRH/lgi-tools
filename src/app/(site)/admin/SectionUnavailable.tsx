import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';

export function SectionUnavailable({ label }: { label: string }) {
  return (
    <Card>
      <SectionHeader size="md" label={label} />
      <EmptyState>
        Unable to load this section.
      </EmptyState>
    </Card>
  );
}
