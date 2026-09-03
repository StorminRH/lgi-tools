import type { ChainPosition } from '../chain/intents';

export interface LayoutEdge {
  readonly fromSystemId: number;
  readonly toSystemId: number;
}

export interface LayoutFacts {
  readonly systems: readonly { readonly systemId: number }[];
  readonly connections: readonly LayoutEdge[];
  readonly rootSystemId?: number;
}

export type WedgePolicy = 'fixed-slot' | 'proportional';

export const SEPARATION_MARGIN = 1.05;

export interface LayoutConfig {
  readonly ringSpacing: number;
  readonly minSeparation: number;
  readonly wedgePolicy: WedgePolicy;
  readonly siblingSpread: number;
  readonly directionSequence: readonly number[];
}

const COMPASS_HEADINGS: readonly number[] = [
  0,
  Math.PI / 2,
  Math.PI,
  (3 * Math.PI) / 2,
  Math.PI / 4,
  (3 * Math.PI) / 4,
  (5 * Math.PI) / 4,
  (7 * Math.PI) / 4,
];

const CARDINAL_HEADINGS: readonly number[] = [
  0,
  Math.PI / 2,
  Math.PI,
  (3 * Math.PI) / 2,
];

const DIAGONALS_FIRST_HEADINGS: readonly number[] = [
  Math.PI / 4,
  (3 * Math.PI) / 4,
  (5 * Math.PI) / 4,
  (7 * Math.PI) / 4,
  0,
  Math.PI / 2,
  Math.PI,
  (3 * Math.PI) / 2,
];

const ROTATED_45_HEADINGS: readonly number[] = [
  Math.PI / 4,
  (3 * Math.PI) / 4,
  (5 * Math.PI) / 4,
  (7 * Math.PI) / 4,
  Math.PI / 2,
  Math.PI,
  (3 * Math.PI) / 2,
  0,
];

export const DIRECTION_PRESETS = {
  'compass-8': COMPASS_HEADINGS,
  'cardinal-4': CARDINAL_HEADINGS,
  'diagonals-first-8': DIAGONALS_FIRST_HEADINGS,
  'rotated-45': ROTATED_45_HEADINGS,
} as const;

export type DirectionPresetId = keyof typeof DIRECTION_PRESETS;

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  ringSpacing: 170,
  minSeparation: 120,
  wedgePolicy: 'fixed-slot',
  siblingSpread: 1,
  directionSequence: COMPASS_HEADINGS,
};

export type LayoutKernel = (
  facts: LayoutFacts,
  config?: LayoutConfig,
) => Promise<ReadonlyMap<number, ChainPosition>>;
