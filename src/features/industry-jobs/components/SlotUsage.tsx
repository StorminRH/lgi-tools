import { ProgressBar } from '@/components/ui/progress-bar';
import { readoutSurface } from '@/components/ui/readout';
import { cn } from '@/components/ui/cn';
import { eyebrow } from '@/components/ui/type-roles';
import { type SlotMetaModel, slotRows } from '../slots';

/** Slots in use across the linked pilots, one bar per job kind. */
export function SlotUsage({ slots }: { slots: SlotMetaModel }) {
  return (
    <div className={cn(readoutSurface, 'flex flex-col gap-2.5 px-3.5 py-3')}>
      <span className={eyebrow({ size: 'micro' })}>Slots in use</span>
      <dl className="flex flex-col gap-2.5">
        {slotRows(slots).map(({ category, label, usage }) => (
          <div key={category} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-ui">
              <dt className="text-muted">{label}</dt>
              <dd className="font-data tabular-nums text-name">
                {usage.used}
                <span className="text-faint">/{usage.total}</span>
              </dd>
            </div>
            <ProgressBar pct={usage.total > 0 ? (usage.used / usage.total) * 100 : 0} tone="evb" />
          </div>
        ))}
      </dl>
    </div>
  );
}
