import { Skeleton } from '@/components/ui/skeleton';

const TILE_KEYS = ['a', 'b', 'c'] as const;

export function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton label="Loading your characters" className="h-4 w-64 max-w-full" />
      <div className="grid gap-3 md:grid-cols-3">
        {TILE_KEYS.map((key) => (
          <Skeleton key={key} label="Loading character" className="h-[148px]" />
        ))}
      </div>
      <Skeleton label="Loading character sheet" className="h-[220px]" />
    </div>
  );
}
