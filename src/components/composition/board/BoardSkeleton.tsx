import { Skeleton } from '@/components/ui/skeleton';

const PILOT_KEYS = ['a', 'b', 'c'] as const;

export function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <Skeleton label="Loading your characters" className="h-4 w-64 max-w-full" />
      <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {PILOT_KEYS.map((key) => (
          <div key={key} className="flex items-center gap-4 p-2">
            <Skeleton label="Loading character" className="size-20 shrink-0 rounded-full sm:size-28" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton label="Loading character name" className="h-5 w-32" />
              <Skeleton label="Loading character totals" className="h-3 w-24" />
              <Skeleton label="Loading skill in training" className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
