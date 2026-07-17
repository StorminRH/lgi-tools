import { toneHex } from '@/components/ui/tones';
import { deriveDeltaBadge } from './delta-badge-view';
import type { Delta } from './period';

/**
 * Public App Router data contract for end label display; fields are owned here so callers do not
 * depend on the module's internal representation.
 */
export interface EndLabelDisplay {
  valueText: string;
  deltaText: string | null;
  /** Pre-resolved delta colour (an SVG fill can't take a text-colour utility). */
  deltaHex: string | null;
}

/**
 * Resolve a period-over-period delta into a chart end-label's text + colour.
 * Reuses deriveDeltaBadge (so `invert` — lower-is-better — is honoured) and maps
 * its text class to a tones hex for the SVG fill.
 */
export function endLabelFor(
  valueText: string,
  delta: Delta | null,
  invert: boolean,
): EndLabelDisplay {
  if (!delta) return { valueText, deltaText: null, deltaHex: null };
  const view = deriveDeltaBadge(delta, invert);
  if (view.kind === 'new') return { valueText, deltaText: 'new', deltaHex: toneHex.green };
  if (view.kind === 'none') return { valueText, deltaText: null, deltaHex: null };
  if (view.kind === 'flat') return { valueText, deltaText: '±0%', deltaHex: toneHex.neutral };
  return {
    valueText,
    deltaText: `${view.arrow} ${view.pct}%`,
    deltaHex: view.cls === 'text-isk' ? toneHex.green : toneHex.red,
  };
}
