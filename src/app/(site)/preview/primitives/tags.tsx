'use client';

import { Chip, type ChipTone } from '@/components/ui/chip';
import { Dot, type DotTone } from '@/components/ui/dot';
import { Pill, type PillTone } from '@/components/ui/pill';
import { PriceConfidence, type ConfidenceLevel } from '@/components/ui/price-confidence';
import { QtyRing } from '@/components/ui/qty-ring';
import { StatusDot, type StatusDotState } from '@/components/ui/status-dot';
import { ReferenceGroup, Specimen, Variant } from './specimen';

const PILL_TONES: readonly PillTone[] = [
  'neutral',
  'green',
  'green-strong',
  'teal',
  'blue',
  'purple',
  'magenta',
  'yellow',
  'orange',
  'orange-soft',
  'red',
  'red-soft',
];
const CHIP_TONES: readonly ChipTone[] = ['green', 'blue', 'purple', 'orange', 'red'];
const DOT_TONES: readonly DotTone[] = ['green', 'blue', 'orange', 'red', 'neutral'];
const DOT_SIZES = ['sm', 'md', 'lg'] as const;
const STATUS_STATES: readonly StatusDotState[] = ['online', 'vip', 'offline'];
const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = ['high', 'medium', 'low', 'unknown'];
const RING_STEPS = [0, 0.35, 0.7, 1] as const;

export function TagsGroup() {
  return (
    <ReferenceGroup
      id="tags"
      title="Tags & status"
      intro="Compact labels and indicators that annotate a row, a value, or an entity."
    >
      <Specimen
        name="Pill"
        source="pill"
        note="Rounded tone labels for categories and states, in twelve tones and two sizes."
        wide
      >
        <div className="flex flex-col gap-4">
          <Variant label="sm">
            <div className="flex flex-wrap gap-2">
              {PILL_TONES.map((tone) => (
                <Pill key={tone} tone={tone}>{tone}</Pill>
              ))}
            </div>
          </Variant>
          <Variant label="md">
            <div className="flex flex-wrap gap-2">
              <Pill tone="green" size="md">Profitable</Pill>
              <Pill tone="orange" size="md">Low margin</Pill>
              <Pill tone="red" size="md">Loss</Pill>
            </div>
          </Variant>
        </div>
      </Specimen>

      <Specimen
        name="Chip"
        source="chip"
        note="Soft tinted chips for EWAR and combat status."
      >
        <div className="flex flex-wrap gap-2">
          {CHIP_TONES.map((tone) => (
            <Chip key={tone} tone={tone}>{tone}</Chip>
          ))}
        </div>
      </Specimen>

      <Specimen
        name="Dot + StatusDot"
        source="dot · status-dot"
        note="Dot marks a category inline; StatusDot is the presence light for characters and services."
      >
        <div className="grid grid-cols-2 gap-6">
          <Variant label="dot · sm md lg">
            <div className="flex flex-col gap-2">
              {DOT_TONES.map((tone) => (
                <span key={tone} className="flex items-center gap-2 font-ui text-ui text-muted">
                  {DOT_SIZES.map((size) => (
                    <Dot key={size} tone={tone} size={size} />
                  ))}
                  {tone}
                </span>
              ))}
            </div>
          </Variant>
          <Variant label="status dot">
            <div className="flex flex-col gap-2">
              {STATUS_STATES.map((state) => (
                <span key={state} className="flex items-center gap-2 font-ui text-ui text-muted">
                  <StatusDot state={state} />
                  {state}
                </span>
              ))}
            </div>
          </Variant>
        </div>
      </Specimen>

      <Specimen
        name="PriceConfidence"
        source="price-confidence"
        note="A ring glyph for how trustworthy a price is. With reasons, it opens a hover popover."
      >
        <div className="flex flex-wrap items-center gap-5">
          {CONFIDENCE_LEVELS.map((level) => (
            <span key={level} className="flex items-center gap-2 font-ui text-ui text-muted">
              <PriceConfidence
                level={level}
                reasons={level === 'unknown' ? undefined : [`Snapshot is ${level} confidence`, 'Jita depth: 42 orders']}
              />
              {level}
            </span>
          ))}
        </div>
      </Specimen>

      <Specimen
        name="QtyRing"
        source="qty-ring"
        note="A progress ring around a count, used for stock against a target."
      >
        <div className="flex flex-wrap items-center gap-4">
          {RING_STEPS.map((progress) => (
            <QtyRing
              key={progress}
              progress={progress}
              tone={progress === 1 ? 'isk' : 'neutral'}
              label={`${Math.round(progress * 100)}% stocked`}
              className="size-10"
            >
              <span className="font-data text-micro text-name">{Math.round(progress * 100)}</span>
            </QtyRing>
          ))}
        </div>
      </Specimen>
    </ReferenceGroup>
  );
}
