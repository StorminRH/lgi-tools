import { SectionPanel } from '@/components/ui/section-panel';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';

export function CardFallback({
  label,
  rows = 3,
  className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <SectionPanel title={label} className={className}>
      <SkeletonGroup label={`Loading ${label}`}>
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            className="flex items-center justify-between gap-3 border-b border-border-soft px-3.5 py-3 last:border-b-0"
          >
            <Skeleton className={row % 2 === 1 ? 'h-3 w-3/5' : 'h-3 w-2/5'} />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </SkeletonGroup>
    </SectionPanel>
  );
}
