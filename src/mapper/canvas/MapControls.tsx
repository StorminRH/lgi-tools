'use client';

// Canvas panel: map lock, camera follow, and the collapsible dial group.
//
// Controlled and domain-stateless — commit handlers apply `map-controls-model`
// clamping so invalid configs cannot leave the panel. Composed from existing
// `@/components/ui` primitives inside a React Flow `Panel`.
import { Panel } from '@xyflow/react';
import { memo, type ReactNode } from 'react';
import { Collapsible } from '@/components/ui/collapsible';
import { SegmentedControl } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Stepper } from '@/components/ui/stepper';
import { Switch } from '@/components/ui/switch';
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
  MIN_SEPARATION_RANGE,
  RING_SPACING_RANGE,
  SIBLING_SPREAD_RANGE,
  WEDGE_POLICY_OPTIONS,
  commitDirectionPreset,
  commitMinSeparation,
  commitRingSpacing,
  commitSiblingSpread,
  commitWedgePolicy,
  directionPresetOf,
} from './map-controls-model';

/** Controlled props for the map lock, camera, and layout/motion dials. */
export interface MapControlsProps {
  readonly locked: boolean;
  readonly onLockedChange: (locked: boolean) => void;
  readonly follow: boolean;
  readonly onFollowChange: (follow: boolean) => void;
  /** Click-to-focus: a shipped user setting, deliberately not a motion dial. */
  readonly focusOnClick: boolean;
  readonly onFocusOnClickChange: (focusOnClick: boolean) => void;
  readonly config: LayoutConfig;
  readonly onConfigChange: (config: LayoutConfig) => void;
  readonly motion: MotionConfig;
  readonly onMotionChange: (motion: MotionConfig) => void;
}

/**
 * Map lock, camera-follow, and layout dials for the live chain surface.
 *
 * Must mount inside `<ReactFlow>` (via `ChainSurface`'s children slot).
 */
function MapControlsComponent({
  locked,
  onLockedChange,
  follow,
  onFollowChange,
  focusOnClick,
  onFocusOnClickChange,
  config,
  onConfigChange,
  motion,
  onMotionChange,
}: MapControlsProps) {
  const preset = directionPresetOf(config) ?? 'compass-8';

  return (
    <Panel
      position="top-right"
      className="nopan nodrag nowheel mx-2! mb-2! mt-16! flex max-h-[calc(100dvh-6rem)] w-56 flex-col gap-2 overflow-y-auto rounded-ctl border border-border bg-bg/95 p-2 text-ui"
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-label uppercase tracking-label text-muted">Map lock</span>
          <Switch
            checked={locked}
            onCheckedChange={onLockedChange}
            label="Map lock"
            tone="neutral"
          />
        </div>
        <span className="font-data text-micro text-muted">
          re-locking restores the computed layout
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-label uppercase tracking-label text-muted">Camera follow</span>
        <Switch
          checked={follow}
          onCheckedChange={onFollowChange}
          label="Camera follow"
          tone="neutral"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-label uppercase tracking-label text-muted">Click focus</span>
        <Switch
          checked={focusOnClick}
          onCheckedChange={onFocusOnClickChange}
          label="Click focus"
          tone="neutral"
        />
      </div>

      <Collapsible
        defaultOpen={false}
        header={
          <span className="flex w-full items-center gap-2">
            <span className="text-label uppercase tracking-label text-muted">Layout dials</span>
            <span
              data-chevron
              className="ml-auto inline-block shrink-0 text-micro text-muted transition-transform"
            >
              ▾
            </span>
          </span>
        }
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
        header={
          <span className="flex w-full items-center gap-2">
            <span className="text-label uppercase tracking-label text-muted">Motion dials</span>
            <span
              data-chevron
              className="ml-auto inline-block shrink-0 text-micro text-muted transition-transform"
            >
              ▾
            </span>
          </span>
        }
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
    </Panel>
  );
}

/**
 * Memoized (drag hardening, IS-5): the panel's props are identity-stable
 * across a drag's per-frame renders, so the whole dial tree skips them.
 */
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
