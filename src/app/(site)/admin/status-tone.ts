import type { DotTone } from '@/components/ui/dot';
import type { ReadoutLineProps } from '@/components/ui/readout';
import type { StatusLevel } from '@/data/telemetry/health-metrics';

const LEVEL_DOT_TONE: Record<StatusLevel, DotTone> = {
  green: 'green',
  amber: 'orange',
  red: 'red',
  neutral: 'neutral',
};

// Healthy values keep the default colour so only problems draw the eye.
const LEVEL_VALUE_TONE: Record<StatusLevel, NonNullable<ReadoutLineProps['valueTone']>> = {
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
