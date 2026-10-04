import { cn } from '@/components/ui/cn';

/** The inputs a fee counts as nothing, for want of CCP's adjusted price. */
export function UnpricedInputs({ names, className }: { names: readonly string[]; className?: string }) {
  if (names.length === 0) return null;
  return (
    <span className={cn('truncate text-label text-dps-mid', className)}>
      Price Unavailable · {names.join(', ')}
    </span>
  );
}
