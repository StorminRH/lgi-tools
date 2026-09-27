import { Skeleton } from '@/components/ui/skeleton';

const PILOT_KEYS = ['b', 'c', 'd'] as const;
const CARD_KEYS = ['attention', 'training', 'wealth', 'industry'] as const;

/** The pilot rail and the overview cards, in outline. */
export function BoardSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-x-10" aria-busy="true">
      <div className="flex gap-4 lg:flex-col lg:gap-3">
        <Skeleton label="Loading overview control" className="h-8 w-24 rounded-full max-lg:hidden" />
        <Skeleton label="Loading your characters" className="size-12 shrink-0 rounded-full lg:size-28" />
        <Skeleton label="Loading main pilot name" className="h-5 w-36 max-lg:hidden" />
        {PILOT_KEYS.map((key) => (
          <div key={key} className="flex shrink-0 items-center gap-3">
            <Skeleton label="Loading pilot" className="size-12 shrink-0 rounded-full lg:size-16" />
            <Skeleton label="Loading pilot name" className="h-4 w-28 max-lg:hidden" />
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CARD_KEYS.map((key) => (
            <Skeleton key={key} label="Loading total" className="h-[74px] rounded-card" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {CARD_KEYS.map((key) => (
            <Skeleton key={key} label="Loading card" className="h-[180px] rounded-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
