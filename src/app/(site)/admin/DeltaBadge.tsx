import { deriveDeltaBadge, type DeltaBadgeView } from './delta-badge-view';
import { cn } from '@/components/ui/cn';
import type { Delta } from '@/composition/admin-period';

const TONE_CLASS = {
  green: 'text-isk',
  red: 'text-tone-red',
  neutral: 'text-muted',
} satisfies Record<DeltaBadgeView['tone'], string>;

export function DeltaBadge({ delta, invert = false }: { delta: Delta; invert?: boolean }) {
  const view = deriveDeltaBadge(delta, invert);
  return (
    <span className={cn('font-data text-ui tabular-nums', TONE_CLASS[view.tone])}>
      <span aria-hidden="true">{view.text}</span>
      <span className="sr-only">{view.spoken}</span>
    </span>
  );
}
