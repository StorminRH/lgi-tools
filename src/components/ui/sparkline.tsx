import { type Tone } from './tones';

/**
 * Shared vocabulary for the compact line charts (sparkline / trend / bar): the
 * blessed viz tones, the point shape, and the pure geometry helpers. The chart
 * primitives themselves live in ./chart; this module is the small shared surface
 * they and their consumers import.
 */

/**
 * The viz tones the compact charts bless. A curated subset of the shared
 * vocabulary — saturated families that read as a single line on the dark
 * surface. The hexes come from the canonical `toneHex` map (tones.ts); this
 * only narrows which tones a chart accepts.
 */
export type SparklineTone = Extract<
  Tone,
  'green' | 'orange' | 'red' | 'blue' | 'purple' | 'teal'
>;

export type SparklinePoint = { x: number; y: number };

// Pure geometry helpers live in ./chart/chart-geometry; re-exported here so the
// existing `sparkline.test.ts` pin keeps importing them from './sparkline'.
export { extent, paddedDomain, nearestIndex } from './chart/chart-geometry';
