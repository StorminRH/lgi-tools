import { sameItems } from '@/lib/array';
import type { FogConfig } from '../fog/fog-model';
import type { HaloLimits } from '../halo/halo-model';
import {
  DIRECTION_PRESETS,
  type DirectionPresetId,
  type LayoutConfig,
  type WedgePolicy,
} from '../layout/layout-contract';
import { choiceDial, type ChoiceDial, type StepDial } from '../lib/step-dial';

/** Ring spacing and separation push each other so spacing never drops below separation. */
export const LAYOUT_STEP_DIALS: readonly StepDial<LayoutConfig>[] = [
  {
    label: 'Ring spacing',
    ariaLabel: 'Ring spacing',
    range: { min: 140, max: 480, step: 10 },
    valueClassName: 'w-8',
    read: (config) => config.ringSpacing,
    write: (config, ringSpacing) => ({
      ...config,
      ringSpacing,
      minSeparation: Math.min(config.minSeparation, ringSpacing),
    }),
  },
  {
    label: 'Separation',
    ariaLabel: 'Minimum separation',
    range: { min: 80, max: 240, step: 10 },
    valueClassName: 'w-8',
    read: (config) => config.minSeparation,
    write: (config, minSeparation) => ({
      ...config,
      ringSpacing: Math.max(config.ringSpacing, minSeparation),
      minSeparation,
    }),
  },
  {
    label: 'Sibling fan',
    ariaLabel: 'Sibling fan',
    range: { min: 1, max: 6, step: 1 },
    read: (config) => config.siblingSpread,
    write: (config, siblingSpread) => ({ ...config, siblingSpread }),
  },
];

export const LAYOUT_CHOICE_DIALS: readonly ChoiceDial<LayoutConfig>[] = [
  choiceDial<LayoutConfig, WedgePolicy>({
    label: 'Wedge posture',
    control: 'segmented',
    options: [
      { value: 'fixed-slot', label: 'Fixed' },
      { value: 'proportional', label: 'Proportional' },
    ],
    read: (config) => config.wedgePolicy,
    write: (config, wedgePolicy) => ({ ...config, wedgePolicy }),
  }),
  choiceDial<LayoutConfig, DirectionPresetId>({
    label: 'Direction order',
    control: 'select',
    options: [
      { value: 'compass-8', label: 'Compass 8' },
      { value: 'cardinal-4', label: 'Cardinal 4' },
      { value: 'diagonals-first-8', label: 'Diagonals first' },
      { value: 'rotated-45', label: 'Rotated 45°' },
    ],
    read: (config) => directionPresetOf(config) ?? 'compass-8',
    write: (config, preset) => ({ ...config, directionSequence: DIRECTION_PRESETS[preset] }),
  }),
];

export const HALO_STEP_DIALS: readonly StepDial<HaloLimits>[] = [
  {
    label: 'Drawn rings',
    ariaLabel: 'Drawn halo rings',
    range: { min: 0, max: 4, step: 1 },
    valueClassName: 'w-8',
    read: (limits) => limits.drawnRings,
    write: (limits, drawnRings) => ({ ...limits, drawnRings }),
  },
  {
    label: 'Fogged rings',
    ariaLabel: 'Fogged halo rings',
    range: { min: 0, max: 2, step: 1 },
    valueClassName: 'w-8',
    read: (limits) => limits.foggedRings,
    write: (limits, foggedRings) => ({ ...limits, foggedRings }),
  },
  {
    label: 'Per exit',
    ariaLabel: 'Halo systems per exit',
    range: { min: 10, max: 120, step: 10 },
    valueClassName: 'w-10',
    read: (limits) => limits.maxSystemsPerExit,
    write: (limits, maxSystemsPerExit) => ({ ...limits, maxSystemsPerExit }),
  },
  {
    label: 'Total cap',
    ariaLabel: 'Halo total system cap',
    range: { min: 30, max: 300, step: 30 },
    valueClassName: 'w-10',
    read: (limits) => limits.maxSystemsTotal,
    write: (limits, maxSystemsTotal) => ({ ...limits, maxSystemsTotal }),
  },
];

/** Density is dialled in whole percent and stored as the 0..1 opacity fraction. */
export const FOG_STEP_DIALS: readonly StepDial<FogConfig>[] = [
  {
    label: 'Reveal',
    ariaLabel: 'Fog reveal radius',
    range: { min: 80, max: 320, step: 10 },
    valueClassName: 'w-10',
    read: (config) => config.revealRadius,
    write: (config, revealRadius) => ({ ...config, revealRadius }),
  },
  {
    label: 'Corridor',
    ariaLabel: 'Fog corridor radius',
    range: { min: 20, max: 120, step: 4 },
    valueClassName: 'w-10',
    read: (config) => config.strokeRadius,
    write: (config, strokeRadius) => ({ ...config, strokeRadius }),
  },
  {
    label: 'Density %',
    ariaLabel: 'Fog density percent',
    range: { min: 40, max: 100, step: 5 },
    valueClassName: 'w-10',
    read: (config) => Math.round(config.opacity * 100),
    write: (config, percent) => ({ ...config, opacity: percent / 100 }),
  },
];

export const FOG_CHOICE_DIALS: readonly ChoiceDial<FogConfig>[] = [
  choiceDial<FogConfig, FogConfig['tier']>({
    label: 'Smoke tier',
    control: 'segmented',
    options: [
      { value: 'dynamic', label: 'Dynamic' },
      { value: 'static', label: 'Static' },
    ],
    read: (config) => config.tier,
    write: (config, tier) => ({ ...config, tier }),
  }),
];

function directionPresetOf(config: LayoutConfig): DirectionPresetId | null {
  for (const [id, sequence] of Object.entries(DIRECTION_PRESETS) as [
    DirectionPresetId,
    readonly number[],
  ][]) {
    if (sameItems(sequence, config.directionSequence)) return id;
  }
  return null;
}
