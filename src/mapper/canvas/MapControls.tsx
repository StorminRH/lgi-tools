'use client';

import { Panel } from '@xyflow/react';
import { memo, type ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { Collapsible, CollapsibleChevron } from '@/components/ui/collapsible';
import { SegmentedControl } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Stepper } from '@/components/ui/stepper';
import { mapFrostedSurface } from '../map-frosted-surface';
import type { FogConfig } from '../fog/fog-model';
import type { HaloLimits } from '../halo/halo-model';
import type { LayoutConfig } from '../layout/layout-contract';
import { commitStepDial, type ChoiceDial, type StepDial } from '../lib/step-dial';
import type { MotionConfig } from '../motion/motion-contract';
import { MOTION_CHOICE_DIALS, MOTION_STEP_DIALS } from '../motion/motion-controls-model';
import {
  FOG_CHOICE_DIALS,
  FOG_STEP_DIALS,
  HALO_STEP_DIALS,
  LAYOUT_CHOICE_DIALS,
  LAYOUT_STEP_DIALS,
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

  return (
    <Panel
      data-map-dev-dials
      position="bottom-right"
      className={cn(
        'nopan nodrag nowheel mb-2! ml-2! mr-64! mt-2! flex max-h-[calc(100dvh-2rem)] w-56 flex-col gap-2 overflow-y-auto p-2 text-ui',
        mapFrostedSurface,
      )}
    >
      <DialGroup
        title="Layout dials"
        value={config}
        onChange={onConfigChange}
        steps={LAYOUT_STEP_DIALS}
        choices={LAYOUT_CHOICE_DIALS}
      />
      <DialGroup
        title="Motion dials"
        value={motion}
        onChange={onMotionChange}
        steps={MOTION_STEP_DIALS}
        choices={MOTION_CHOICE_DIALS}
      />
      <DialGroup title="Halo dials" value={halo} onChange={onHaloChange} steps={HALO_STEP_DIALS} />
      <DialGroup
        title="Fog dials"
        value={fog}
        onChange={onFogChange}
        steps={FOG_STEP_DIALS}
        choices={FOG_CHOICE_DIALS}
      />
    </Panel>
  );
}

export const MapControls = memo(MapControlsComponent);

/** One collapsed group of dials: its steppers first, then its choices. */
function DialGroup<C>({
  title,
  value,
  onChange,
  steps,
  choices = [],
}: {
  readonly title: string;
  readonly value: C;
  readonly onChange: (value: C) => void;
  readonly steps: readonly StepDial<C>[];
  readonly choices?: readonly ChoiceDial<C>[];
}) {
  return (
    <Collapsible
      defaultOpen={false}
      header={<DialGroupHeader label={title} />}
      className="border-border-soft"
      headerClassName="px-0 py-1"
    >
      <div className="flex flex-col gap-2 px-0 pb-1 pt-1">
        {steps.map((dial) => (
          <DialRow key={dial.ariaLabel} label={dial.label}>
            <Stepper
              value={dial.read(value)}
              min={dial.range.min}
              max={dial.range.max}
              step={dial.range.step}
              ariaLabel={dial.ariaLabel}
              variant="inline"
              valueClassName={dial.valueClassName}
              onChange={(next) => onChange(commitStepDial(dial, value, next))}
            />
          </DialRow>
        ))}
        {choices.map((dial) => (
          <div key={dial.label} className="flex flex-col gap-1">
            <DialLabel>{dial.label}</DialLabel>
            {dial.control === 'select' ? (
              <Select
                ariaLabel={dial.label}
                value={dial.read(value)}
                items={dial.options}
                onValueChange={(next) => onChange(dial.write(value, next))}
              />
            ) : (
              <SegmentedControl
                label={dial.label}
                density="compact"
                value={dial.read(value)}
                options={dial.options}
                onChange={(next) => onChange(dial.write(value, next))}
              />
            )}
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

function DialGroupHeader({ label }: { readonly label: string }) {
  return (
    <span className="flex w-full items-center gap-2">
      <DialLabel>{label}</DialLabel>
      <CollapsibleChevron className="ml-auto" />
    </span>
  );
}

function DialRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <DialLabel>{label}</DialLabel>
      {children}
    </div>
  );
}

function DialLabel({ children }: { readonly children: string }) {
  return <span className="text-label uppercase tracking-label text-muted">{children}</span>;
}
