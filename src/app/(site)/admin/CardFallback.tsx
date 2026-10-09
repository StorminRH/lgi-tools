import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';

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
    <Card className={cn('overflow-hidden', className)}>
      <SectionHeader size="md" label={label} />
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex items-center justify-between gap-3 border-b border-border-soft px-3.5 py-3 last:border-b-0"
        >
          <Skeleton className={row % 2 === 1 ? 'h-3 w-3/5' : 'h-3 w-2/5'} />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </Card>
  );
}
