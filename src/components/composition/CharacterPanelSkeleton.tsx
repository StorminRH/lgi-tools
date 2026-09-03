import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function CharacterPanelSkeleton({
  rows = 2,
  label = 'Loading characters',
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <Card className="w-full overflow-hidden" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[36px_minmax(0,1fr)_96px] items-center gap-3 border-b border-border-soft px-3.5 py-3 last:border-b-0"
        >
          <Skeleton aria-hidden="true" className="size-9 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton aria-hidden="true" className="h-3 w-36 max-w-full" />
            <Skeleton aria-hidden="true" className="h-2.5 w-24 max-w-full" />
          </div>

          <Skeleton aria-hidden="true" className="h-6 w-24" />
        </div>

      ))}
    </Card>

  );
}
