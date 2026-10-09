import { toneHex } from '@/components/ui/tones';
import { deriveDeltaBadge } from './delta-badge-view';
import type { Delta } from '@/composition/admin-period';

export interface EndLabelDisplay {
  valueText: string;
  deltaText: string | null;
  deltaHex: string | null;
}

export function endLabelFor(
  valueText: string,
  delta: Delta | null,
  invert: boolean,
): EndLabelDisplay {
  if (!delta) return { valueText, deltaText: null, deltaHex: null };
  const view = deriveDeltaBadge(delta, invert);
  if (view.kind === 'none') return { valueText, deltaText: null, deltaHex: null };
  return { valueText, deltaText: view.text, deltaHex: toneHex[view.tone] };
}
