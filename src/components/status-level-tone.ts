import type { DotTone } from '@/components/ui/dot';
import { type ReadoutLineProps, type ValueTone, valueToneClass } from '@/components/ui/readout';
import type { StatusLevel } from '@/data/telemetry/health-metrics';

const LEVEL_DOT_TONE: Record<StatusLevel, DotTone> = {
  green: 'green',
  amber: 'orange',
  red: 'red',
  neutral: 'neutral',
};

// Healthy values keep the surface's plain colour so only problems draw the eye.
const LEVEL_VALUE_TONE: Record<StatusLevel, ValueTone> = {
  green: 'default',
  amber: 'orange',
  red: 'red',
  neutral: 'muted',
};

// The dot is decorative, so screen readers hear the verdict its colour stands for.
const LEVEL_STATUS: Record<StatusLevel, string> = {
  green: 'Healthy',
  amber: 'Warning',
  red: 'Critical',
  neutral: 'No verdict',
};

/** A status row's dot, spoken verdict and value colour at this level. */
export function levelReadout(level: StatusLevel): Required<Pick<ReadoutLineProps, 'tone' | 'status' | 'valueTone'>> {
  return { tone: LEVEL_DOT_TONE[level], status: LEVEL_STATUS[level], valueTone: LEVEL_VALUE_TONE[level] };
}

/**
 * A status value's colour class outside a readout row. A healthy value takes
 * `plain`, the surface's own value colour; leave it out to inherit one.
 */
export function levelValueClass(level: StatusLevel, plain?: string): string | undefined {
  return valueToneClass(LEVEL_VALUE_TONE[level], plain);
}
