import { deriveDeltaBadge } from './delta-badge-view';
import { cn } from '@/components/ui/cn';
import type { Delta } from '@/composition/admin-period';

export function DeltaBadge({ delta, invert = false }: { delta: Delta; invert?: boolean }) {
  const view = deriveDeltaBadge(delta, invert);
  if (view.kind === 'new') {
    return <span className="font-data text-ui text-isk">new</span>;
  }
  if (view.kind === 'none') {
    return <span className="font-data text-ui text-muted">—</span>;
  }
  if (view.kind === 'flat') {
    return <span className="font-data text-ui text-muted tabular-nums">±0%</span>;
  }
  return (
    <span className={cn('font-data text-ui tabular-nums', view.cls)}>
      {view.arrow} {view.pct}%
    </span>
  );
}
