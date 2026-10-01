'use client';

import { useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { ChipToggle, ChipToggleGroup } from '@/components/ui/chip-toggle';
import { Pill } from '@/components/ui/pill';
import { cn } from '@/components/ui/cn';
import { CloseIcon } from './icons';
import { PrototypeGroup, StateCell, VariantCard } from './gallery';

const TONES = ['green', 'teal', 'blue', 'purple', 'magenta', 'yellow', 'orange', 'red', 'neutral'] as const;
const LABELS: Record<(typeof TONES)[number], string> = {
  green: 'Profitable',
  teal: 'Synced',
  blue: 'Manufacturing',
  purple: 'Reaction',
  magenta: 'Invention',
  yellow: 'Pending',
  orange: 'Low margin',
  red: 'Loss',
  neutral: 'Archived',
};
const STATUSES = [
  { label: 'Online', tone: 'green', live: true },
  { label: 'Syncing', tone: 'teal', live: true },
  { label: 'Degraded', tone: 'orange', live: false },
  { label: 'Offline', tone: 'neutral', live: false },
] as const;
const EWAR = [
  { label: 'Web', tone: 'blue' },
  { label: 'Scram', tone: 'red' },
  { label: 'Neut', tone: 'purple' },
  { label: 'Damp', tone: 'green' },
] as const;
const FILTERS = [
  { value: 'gas', label: 'Gas', tone: 'orange' },
  { value: 'ore', label: 'Ore', tone: 'blue' },
  { value: 'relic', label: 'Relic', tone: 'green' },
  { value: 'data', label: 'Data', tone: 'teal' },
] as const;

function FilterChips({ className }: { className: string }) {
  const [on, setOn] = useState<string[]>(['gas', 'relic']);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Site filters">
      {FILTERS.map((filter) => {
        const pressed = on.includes(filter.value);
        return (
          <button
            key={filter.value}
            type="button"
            aria-pressed={pressed}
            data-tone={filter.tone}
            className={className}
            onClick={() =>
              setOn((current) => (pressed ? current.filter((item) => item !== filter.value) : [...current, filter.value]))
            }
          >
            <span className="pt-pill-dot" />
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

/** The four rows every candidate fills: tones, statuses, combat chips, and pressable filters. */
function PillSet({ pill, filter = 'pt-toggle-chip' }: { pill: string; filter?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <StateCell label="tones">
        <div className="flex flex-wrap gap-2">
          {TONES.map((tone) => (
            <span key={tone} className={cn('pt-pill', pill)} data-tone={tone}>{LABELS[tone]}</span>
          ))}
        </div>
      </StateCell>
      <StateCell label="status">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <span key={status.label} className={cn('pt-pill', pill)} data-tone={status.tone} data-live={status.live || undefined}>
              <span className="pt-pill-dot" />
              {status.label}
            </span>
          ))}
        </div>
      </StateCell>
      <StateCell label="combat chips">
        <div className="flex flex-wrap gap-2">
          {EWAR.map((chip) => (
            <span key={chip.label} className={cn('pt-pill', pill)} data-tone={chip.tone}>{chip.label}</span>
          ))}
        </div>
      </StateCell>
      <StateCell label="filters · pressable">
        <FilterChips className={filter} />
      </StateCell>
    </div>
  );
}

function DuoSet() {
  const [filters, setFilters] = useState(['C3', 'Pulsar', 'Gas']);
  return (
    <div className="flex flex-col gap-4">
      <StateCell label="key · value">
        <div className="flex flex-wrap gap-2">
          <span className="pt-pill pt-pill-e" data-tone="green"><span>ME</span><span>10</span></span>
          <span className="pt-pill pt-pill-e" data-tone="blue"><span>TE</span><span>20</span></span>
          <span className="pt-pill pt-pill-e" data-tone="purple"><span>Class</span><span>C3</span></span>
          <span className="pt-pill pt-pill-e" data-tone="orange"><span>Margin</span><span>4.2%</span></span>
        </div>
      </StateCell>
      <StateCell label="with count">
        <div className="flex flex-wrap gap-2">
          <span className="pt-pill pt-pill-a" data-tone="teal">Jobs ready <span className="pt-count">3</span></span>
          <span className="pt-pill pt-pill-a" data-tone="red">Expiring <span className="pt-count">12</span></span>
        </div>
      </StateCell>
      <StateCell label="removable filters">
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <span key={filter} className="pt-token" data-tone="neutral">
              {filter}
              <button type="button" className="pt-token-x" aria-label={`Remove ${filter}`} onClick={() => setFilters((current) => current.filter((item) => item !== filter))}>
                <CloseIcon size={11} />
              </button>
            </span>
          ))}
          {filters.length === 0 ? (
            <button type="button" className="pt-ghost-btn" onClick={() => setFilters(['C3', 'Pulsar', 'Gas'])}>Reset filters</button>
          ) : null}
        </div>
      </StateCell>
    </div>
  );
}

function CurrentPills() {
  const [types, setTypes] = useState(['gas']);
  return (
    <div className="flex flex-col gap-4">
      <StateCell label="pill">
        <div className="flex flex-wrap gap-2">
          <Pill tone="green">Profitable</Pill>
          <Pill tone="blue">Manufacturing</Pill>
          <Pill tone="orange">Low margin</Pill>
          <Pill tone="red">Loss</Pill>
        </div>
      </StateCell>
      <StateCell label="chip">
        <div className="flex flex-wrap gap-2">
          <Chip tone="blue">Web</Chip>
          <Chip tone="red">Scram</Chip>
          <Chip tone="purple">Neut</Chip>
        </div>
      </StateCell>
      <StateCell label="chip toggle">
        <ChipToggleGroup value={types} onValueChange={setTypes} label="Site types (current)">
          <ChipToggle value="gas" tone="orange">Gas</ChipToggle>
          <ChipToggle value="ore" tone="blue">Ore</ChipToggle>
        </ChipToggleGroup>
      </StateCell>
    </div>
  );
}

export function PillsGroup() {
  return (
    <PrototypeGroup
      id="pills"
      title="Pills + chips"
      today="Today: monospace semibold pills on dark solid tone slabs, and uppercase tracked EWAR chips."
    >
      <VariantCard letter="Now" name="Mono slabs" pitch="The shipping Pill, Chip, and ChipToggle.">
        <CurrentPills />
      </VariantCard>
      <VariantCard letter="A" name="Glass tint" pitch="Translucent tone tint with a matching hairline, Geist medium, sentence case. The closest drop-in.">
        <PillSet pill="pt-pill-a" />
      </VariantCard>
      <VariantCard letter="B" name="Soft solid" pitch="No border; a stronger tint with a lit top edge, like a tiny glass button. Reads well at small sizes.">
        <PillSet pill="pt-pill-b" />
      </VariantCard>
      <VariantCard letter="C" name="Outline glow" pitch="Transparent body, tone outline with a faint neon bloom. Filters use the same chip and fill when pressed.">
        <PillSet pill="pt-pill-c" filter="pt-pill pt-pill-c" />
      </VariantCard>
      <VariantCard letter="D" name="Gradient edge" pitch="Neutral glass body with a tone-to-clear gradient border; live statuses get a radar ping on the dot.">
        <PillSet pill="pt-pill-d" />
      </VariantCard>
      <VariantCard letter="E" name="Key/value duo" pitch="Split pills for attributes (ME 10, Class C3), count badges, and removable filter tokens.">
        <DuoSet />
      </VariantCard>
    </PrototypeGroup>
  );
}
