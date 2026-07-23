import { deriveDeltaBadge } from './delta-badge-view';
import type { Delta } from '@/composition/admin-period';

/**
 * The period-over-period delta badge, shared by the MetricTable rows and the
 * GSC small-multiples headers. Delta colours are the one place (besides the
 * status strip) where green/red appear — the charts themselves stay on the
 * single blue accent. Pass `invert` for metrics where lower is better.
 */
export function DeltaBadge({ delta, invert = false }: { delta: Delta; invert?: boolean }) {
  const view = deriveDeltaBadge(delta, invert);
  if (view.kind === 'new') {
    return <span className="font-mono text-ui text-isk">new</span>;
  }
  if (view.kind === 'none') {
    return <span className="font-mono text-ui text-muted">—</span>;
  }
  if (view.kind === 'flat') {
    return <span className="font-mono text-ui text-muted tabular-nums">±0%</span>;
  }
  return (
    <span className={`font-mono text-ui tabular-nums ${view.cls}`}>
      {view.arrow} {view.pct}%
    </span>
  );
}
