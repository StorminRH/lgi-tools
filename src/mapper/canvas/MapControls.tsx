'use client';

import { Panel } from '@xyflow/react';
import { memo, type ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { Collapsible } from '@/components/ui/collapsible';
import { SegmentedControl } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Stepper } from '@/components/ui/stepper';
import { mapFrostedSurface } from '../map-frosted-surface';
import type { FogConfig } from '../fog/fog-model';
import type { HaloLimits } from '../halo/halo-model';
import type {
  DirectionPresetId,
  LayoutConfig,
  WedgePolicy,
} from '../layout/layout-contract';
import type {
  CollapseWeight,
  EdgeFlavor,
  MotionConfig,
} from '../motion/motion-contract';
import {
  COLLAPSE_WEIGHT_OPTIONS,
  EDGE_FLAVOR_OPTIONS,
  FAST_TEMPO_RANGE,
  MID_TEMPO_RANGE,
  OVERSHOOT_RANGE,
  SLOW_TEMPO_RANGE,
  commitCollapseWeight,
  commitEdgeFlavor,
  commitFastTempo,
  commitMidTempo,
  commitOvershoot,
  commitSlowTempo,
} from '../motion/motion-controls-model';
import {
  DIRECTION_PRESET_OPTIONS,
  FOG_OPACITY_PCT_RANGE,
  FOG_REVEAL_RADIUS_RANGE,
  FOG_STROKE_RADIUS_RANGE,
  FOG_TIER_OPTIONS,
  HALO_DRAWN_RINGS_RANGE,
  HALO_FOGGED_RINGS_RANGE,
  HALO_PER_EXIT_RANGE,
  HALO_TOTAL_RANGE,
  MIN_SEPARATION_RANGE,
  RING_SPACING_RANGE,
  SIBLING_SPREAD_RANGE,
  WEDGE_POLICY_OPTIONS,
  commitDirectionPreset,
  commitFogOpacityPct,
  commitFogRevealRadius,
  commitFogStrokeRadius,
  commitFogTier,
  commitHaloDrawnRings,
  commitHaloFoggedRings,
  commitHaloPerExitCap,
  commitHaloTotalCap,
  commitMinSeparation,
  commitRingSpacing,
  commitSiblingSpread,
  commitWedgePolicy,
  directionPresetOf,
} from './map-controls-model';

export interface MapControlsProps {
  readonly config: LayoutConfig;
  readonly onConfigChange: (config: LayoutConfig) => void;
  readonly motion: MotionConfig;
  readonly onMotionChange: (motion: MotionConfig) => void;
  readonly halo: HaloLimits;
  readonly onHaloChange: (halo: HaloLimits) => void;
  readonly fog: FogConfig;
  readonly onFogChange: (fog: FogConfig) => void;
}

function MapControlsComponent({
  config,
  onConfigChange,
  motion,
  onMotionChange,
  halo,
  onHaloChange,
  fog,
  onFogChange,
}: MapControlsProps) {
  if (process.env.NODE_ENV !== 'development') return null;

  const preset = directionPresetOf(config) ?? 'compass-8';

  return (
    <Panel
      data-map-dev-dials
      position="bottom-right"
      className={cn(
        'nopan nodrag nowheel mb-2! ml-2! mr-64! mt-2! flex max-h-[calc(100dvh-2rem)] w-56 flex-col gap-2 overflow-y-auto rounded-card p-2 text-ui',
        mapFrostedSurface,
      )}
    >
      <Collapsible
        defaultOpen={false}
        header={<DialGroupHeader label="Layout dials" />}
        className="border-border-soft"
        headerClassName="px-0 py-1"
      >
        <div className="flex flex-col gap-2 px-0 pb-1 pt-1">
          <DialRow label="Ring spacing">
            <Stepper
              value={config.ringSpacing}
              min={RING_SPACING_RANGE.min}
              max={RING_SPACING_RANGE.max}
              step={RING_SPACING_RANGE.step}
              ariaLabel="Ring spacing"
              variant="inline"
              valueClassName="w-8"
              onChange={(next) => onConfigChange(commitRingSpacing(config, next))}
            />
          </DialRow>
          <DialRow label="Separation">
            <Stepper
              value={config.minSeparation}
              min={MIN_SEPARATION_RANGE.min}
              max={MIN_SEPARATION_RANGE.max}
              step={MIN_SEPARATION_RANGE.step}
              ariaLabel="Minimum separation"
              variant="inline"
              valueClassName="w-8"
              onChange={(next) => onConfigChange(commitMinSeparation(config, next))}
            />
          </DialRow>
          <DialRow label="Sibling fan">
            <Stepper
              value={config.siblingSpread}
              min={SIBLING_SPREAD_RANGE.min}
              max={SIBLING_SPREAD_RANGE.max}
              step={SIBLING_SPREAD_RANGE.step}
              ariaLabel="Sibling fan"
              variant="inline"
              onChange={(next) => onConfigChange(commitSiblingSpread(config, next))}
            />
          </DialRow>
          <div className="flex flex-col gap-1">
            <span className="text-label uppercase tracking-label text-muted">Wedge posture</span>
            <SegmentedControl
              label="Wedge posture"
              density="compact"
              value={config.wedgePolicy}
              options={WEDGE_POLICY_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onChange={(value) =>
                onConfigChange(commitWedgePolicy(config, value as WedgePolicy))
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-label uppercase tracking-label text-muted">Direction order</span>
            <Select
              ariaLabel="Direction order"
              value={preset}
              items={DIRECTION_PRESET_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onValueChange={(value) =>
                onConfigChange(
                  commitDirectionPreset(config, value as DirectionPresetId),
                )
              }
            />
          </div>
        </div>
      </Collapsible>

      <Collapsible
        defaultOpen={false}
        header={<DialGroupHeader label="Motion dials" />}
        className="border-border-soft"
        headerClassName="px-0 py-1"
      >
        <div className="flex flex-col gap-2 px-0 pb-1 pt-1">
          <DialRow label="Fast">
            <Stepper
              value={motion.tempo.fast}
              min={FAST_TEMPO_RANGE.min}
              max={FAST_TEMPO_RANGE.max}
              step={FAST_TEMPO_RANGE.step}
              ariaLabel="Fast tempo"
              variant="inline"
              valueClassName="w-12"
              onChange={(next) => onMotionChange(commitFastTempo(motion, next))}
            />
          </DialRow>
          <DialRow label="Mid">
            <Stepper
              value={motion.tempo.mid}
              min={MID_TEMPO_RANGE.min}
              max={MID_TEMPO_RANGE.max}
              step={MID_TEMPO_RANGE.step}
              ariaLabel="Mid tempo"
              variant="inline"
              valueClassName="w-12"
              onChange={(next) => onMotionChange(commitMidTempo(motion, next))}
            />
          </DialRow>
          <DialRow label="Slow">
            <Stepper
              value={motion.tempo.slow}
              min={SLOW_TEMPO_RANGE.min}
              max={SLOW_TEMPO_RANGE.max}
              step={SLOW_TEMPO_RANGE.step}
              ariaLabel="Slow tempo"
              variant="inline"
              valueClassName="w-12"
              onChange={(next) => onMotionChange(commitSlowTempo(motion, next))}
            />
          </DialRow>
          <DialRow label="Overshoot">
            <Stepper
              value={motion.overshootPct}
              min={OVERSHOOT_RANGE.min}
              max={OVERSHOOT_RANGE.max}
              step={OVERSHOOT_RANGE.step}
              ariaLabel="Overshoot percent"
              variant="inline"
              valueClassName="w-8"
              onChange={(next) => onMotionChange(commitOvershoot(motion, next))}
            />
          </DialRow>
          <div className="flex flex-col gap-1">
            <span className="text-label uppercase tracking-label text-muted">Edge flavor</span>
            <SegmentedControl
              label="Edge flavor"
              density="compact"
              value={motion.edgeFlavor}
              options={EDGE_FLAVOR_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onChange={(value) =>
                onMotionChange(commitEdgeFlavor(motion, value as EdgeFlavor))
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-label uppercase tracking-label text-muted">Collapse exit</span>
            <SegmentedControl
              label="Collapse exit"
              density="compact"
              value={motion.collapseWeight}
              options={COLLAPSE_WEIGHT_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onChange={(value) =>
                onMotionChange(
                  commitCollapseWeight(motion, value as CollapseWeight),
                )
              }
            />
          </div>
        </div>
      </Collapsible>

      <Collapsible
        defaultOpen={false}
        header={<DialGroupHeader label="Halo dials" />}
        className="border-border-soft"
        headerClassName="px-0 py-1"
      >
        <div className="flex flex-col gap-2 px-0 pb-1 pt-1">
          <DialRow label="Drawn rings">
            <Stepper
              value={halo.drawnRings}
              min={HALO_DRAWN_RINGS_RANGE.min}
              max={HALO_DRAWN_RINGS_RANGE.max}
              step={HALO_DRAWN_RINGS_RANGE.step}
              ariaLabel="Drawn halo rings"
              variant="inline"
              valueClassName="w-8"
              onChange={(next) => onHaloChange(commitHaloDrawnRings(halo, next))}
            />
          </DialRow>
          <DialRow label="Fogged rings">
            <Stepper
              value={halo.foggedRings}
              min={HALO_FOGGED_RINGS_RANGE.min}
              max={HALO_FOGGED_RINGS_RANGE.max}
              step={HALO_FOGGED_RINGS_RANGE.step}
              ariaLabel="Fogged halo rings"
              variant="inline"
              valueClassName="w-8"
              onChange={(next) => onHaloChange(commitHaloFoggedRings(halo, next))}
            />
          </DialRow>
          <DialRow label="Per exit">
            <Stepper
              value={halo.maxSystemsPerExit}
              min={HALO_PER_EXIT_RANGE.min}
              max={HALO_PER_EXIT_RANGE.max}
              step={HALO_PER_EXIT_RANGE.step}
              ariaLabel="Halo systems per exit"
              variant="inline"
              valueClassName="w-10"
              onChange={(next) => onHaloChange(commitHaloPerExitCap(halo, next))}
            />
          </DialRow>
          <DialRow label="Total cap">
            <Stepper
              value={halo.maxSystemsTotal}
              min={HALO_TOTAL_RANGE.min}
              max={HALO_TOTAL_RANGE.max}
              step={HALO_TOTAL_RANGE.step}
              ariaLabel="Halo total system cap"
              variant="inline"
              valueClassName="w-10"
              onChange={(next) => onHaloChange(commitHaloTotalCap(halo, next))}
            />
          </DialRow>
        </div>
      </Collapsible>

      <Collapsible
        defaultOpen={false}
        header={<DialGroupHeader label="Fog dials" />}
        className="border-border-soft"
        headerClassName="px-0 py-1"
      >
        <div className="flex flex-col gap-2 px-0 pb-1 pt-1">
          <DialRow label="Reveal">
            <Stepper
              value={fog.revealRadius}
              min={FOG_REVEAL_RADIUS_RANGE.min}
              max={FOG_REVEAL_RADIUS_RANGE.max}
              step={FOG_REVEAL_RADIUS_RANGE.step}
              ariaLabel="Fog reveal radius"
              variant="inline"
              valueClassName="w-10"
              onChange={(next) => onFogChange(commitFogRevealRadius(fog, next))}
            />
          </DialRow>
          <DialRow label="Corridor">
            <Stepper
              value={fog.strokeRadius}
              min={FOG_STROKE_RADIUS_RANGE.min}
              max={FOG_STROKE_RADIUS_RANGE.max}
              step={FOG_STROKE_RADIUS_RANGE.step}
              ariaLabel="Fog corridor radius"
              variant="inline"
              valueClassName="w-10"
              onChange={(next) => onFogChange(commitFogStrokeRadius(fog, next))}
            />
          </DialRow>
          <DialRow label="Density %">
            <Stepper
              value={Math.round(fog.opacity * 100)}
              min={FOG_OPACITY_PCT_RANGE.min}
              max={FOG_OPACITY_PCT_RANGE.max}
              step={FOG_OPACITY_PCT_RANGE.step}
              ariaLabel="Fog density percent"
              variant="inline"
              valueClassName="w-10"
              onChange={(next) => onFogChange(commitFogOpacityPct(fog, next))}
            />
          </DialRow>
          <div className="flex flex-col gap-1">
            <span className="text-label uppercase tracking-label text-muted">Smoke tier</span>
            <SegmentedControl
              label="Smoke tier"
              density="compact"
              value={fog.tier}
              options={FOG_TIER_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onChange={(value) =>
                onFogChange(commitFogTier(fog, value as FogConfig['tier']))
              }
            />
          </div>
        </div>
      </Collapsible>
    </Panel>
  );
}

function DialGroupHeader({ label }: { readonly label: string }) {
  return (
    <span className="flex w-full items-center gap-2">
      <span className="text-label uppercase tracking-label text-muted">{label}</span>
      <span
        data-chevron
        className="ml-auto inline-block shrink-0 text-micro text-muted transition-transform"
      >
        ▾
      </span>
    </span>
  );
}

export const MapControls = memo(MapControlsComponent);

function DialRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-label uppercase tracking-label text-muted">{label}</span>
      {children}
    </div>
  );
}
