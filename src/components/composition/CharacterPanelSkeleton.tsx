import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Reserves portrait, identity, and readout geometry while a character-backed panel resolves. */
export function CharacterPanelSkeleton({
  rows = 2,
  label = 'Loading characters',
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <Card className="w-full overflow-hidden" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[36px_minmax(0,1fr)_96px] items-center gap-3 border-b border-border-soft px-3.5 py-3 last:border-b-0"
        >
          <Skeleton label={label} className="size-9 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton label={label} className="h-3 w-36 max-w-full" />
            <Skeleton label={label} className="h-2.5 w-24 max-w-full" />
          </div>
          <Skeleton label={label} className="h-6 w-24" />
        </div>
      ))}
    </Card>
  );
}
