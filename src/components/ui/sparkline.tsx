import { type Tone } from './tones';

export type SparklineTone = Extract<
  Tone,
  'green' | 'orange' | 'red' | 'blue' | 'purple' | 'teal'
>;

export { extent, paddedDomain, nearestIndex } from './chart/chart-geometry';
