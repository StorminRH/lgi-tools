import type { DotTone } from '@/components/ui/dot';
import type { StatusLevel } from '@/data/telemetry/health-metrics';

export const LEVEL_DOT_TONE: Record<StatusLevel, DotTone> = {
  green: 'green',
  amber: 'orange',
  red: 'red',
  neutral: 'neutral',
};

// Healthy values stay neutral so only problems draw the eye.
export const LEVEL_VALUE_CLASS: Record<StatusLevel, string> = {
  green: 'text-name',
  amber: 'text-tone-orange',
  red: 'text-tone-red',
  neutral: 'text-muted',
};
