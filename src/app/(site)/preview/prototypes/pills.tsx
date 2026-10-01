'use client';

import { useState } from 'react';
import { Chip, type ChipTone } from '@/components/ui/chip';
import { ChipToggle, ChipToggleGroup } from '@/components/ui/chip-toggle';
import { cn } from '@/components/ui/cn';
import { Pill, type PillTone } from '@/components/ui/pill';
import { PrototypeGroup, StateCell, VariantCard } from './gallery';

/*
 * Every card renders the same three rows with the same labels:
 *   Pill        — one pill per tone the Pill primitive ships.
 *   Chip        — the five EWAR/combat chips.
 *   Chip toggle — the pressable site-type filter (Gas and Relic pressed).
 */

const PILLS: readonly { tone: PillTone; label: string }[] = [
  { tone: 'green', label: 'Profitable' },
  { tone: 'green-strong', label: 'Best margin' },
  { tone: 'teal', label: 'Synced' },
  { tone: 'blue', label: 'Manufacturing' },
  { tone: 'purple', label: 'Reaction' },
  { tone: 'magenta', label: 'Invention' },
  { tone: 'yellow', label: 'Pending' },
  { tone: 'orange', label: 'Low margin' },
  { tone: 'orange-soft', label: 'Thin market' },
  { tone: 'red', label: 'Loss' },
  { tone: 'red-soft', label: 'Stale price' },
  { tone: 'neutral', label: 'Archived' },
];

const CHIPS: readonly { tone: ChipTone; label: string }[] = [
  { tone: 'blue', label: 'Web' },
  { tone: 'red', label: 'Scram' },
  { tone: 'purple', label: 'Neut' },
  { tone: 'green', label: 'Damp' },
  { tone: 'orange', label: 'Paint' },
];

const TOGGLES: readonly { value: string; label: string; tone: ChipTone }[] = [
  { value: 'gas', label: 'Gas', tone: 'orange' },
  { value: 'ore', label: 'Ore', tone: 'blue' },
  { value: 'relic', label: 'Relic', tone: 'green' },
];

/** Prototype CSS has one hue per family; the soft/strong Pill tones map onto it. */
const TONE_HUE: Record<PillTone, string> = {
  neutral: 'neutral',
  green: 'green',
  'green-strong': 'green',
  teal: 'teal',
  blue: 'blue',
  purple: 'purple',
  magenta: 'magenta',
  yellow: 'yellow',
  orange: 'orange',
  'orange-soft': 'orange',
  red: 'red',
  'red-soft': 'red',
};

function ToggleRow({ chip }: { chip: string }) {
  const [on, setOn] = useState<string[]>(['gas', 'relic']);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Site types">
      {TOGGLES.map((toggle) => {
        const pressed = on.includes(toggle.value);
        return (
          <button
            key={toggle.value}
            type="button"
            aria-pressed={pressed}
            data-tone={toggle.tone}
            className={cn('pt-pill pt-pill-toggle', chip)}
            onClick={() => setOn((current) => (pressed ? current.filter((item) => item !== toggle.value) : [...current, toggle.value]))}
          >
            {toggle.label}
          </button>
        );
      })}
    </div>
  );
}

function PillSet({ pill }: { pill: string }) {
  return (
    <div className="flex flex-col gap-4">
      <StateCell label="pill">
        <div className="flex flex-wrap gap-2">
          {PILLS.map((item) => (
            <span key={item.tone} className={cn('pt-pill', pill)} data-tone={TONE_HUE[item.tone]}>{item.label}</span>
          ))}
        </div>
      </StateCell>
      <StateCell label="chip">
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((item) => (
            <span key={item.tone} className={cn('pt-pill', pill)} data-tone={item.tone}>{item.label}</span>
          ))}
        </div>
      </StateCell>
      <StateCell label="chip toggle · Gas and Relic pressed">
        <ToggleRow chip={pill} />
      </StateCell>
    </div>
  );
}

function CurrentPills() {
  const [types, setTypes] = useState(['gas', 'relic']);
  return (
    <div className="flex flex-col gap-4">
      <StateCell label="pill">
        <div className="flex flex-wrap gap-2">
          {PILLS.map((item) => <Pill key={item.tone} tone={item.tone}>{item.label}</Pill>)}
        </div>
      </StateCell>
      <StateCell label="chip">
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((item) => <Chip key={item.tone} tone={item.tone}>{item.label}</Chip>)}
        </div>
      </StateCell>
      <StateCell label="chip toggle · Gas and Relic pressed">
        <ChipToggleGroup value={types} onValueChange={setTypes} label="Site types (current)">
          {TOGGLES.map((toggle) => (
            <ChipToggle key={toggle.value} value={toggle.value} tone={toggle.tone}>{toggle.label}</ChipToggle>
          ))}
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
      today="Every card shows the same Pill tones, combat Chips, and ChipToggle filter. Only the look changes."
    >
      <VariantCard letter="Now" name="Mono slabs" pitch="The shipping Pill, Chip, and ChipToggle: monospace semibold text on dark solid slabs; chips uppercase and tracked.">
        <CurrentPills />
      </VariantCard>
      <VariantCard letter="A" name="Glass tint" pitch="Translucent tone tint with a matching hairline, Geist medium, sentence case. The closest drop-in.">
        <PillSet pill="pt-pill-a" />
      </VariantCard>
      <VariantCard letter="B" name="Soft solid" pitch="No border; a stronger tint with a lit top edge, like a tiny glass button. Reads well at small sizes.">
        <PillSet pill="pt-pill-b" />
      </VariantCard>
      <VariantCard letter="C" name="Outline glow" pitch="Transparent body with a tone outline and a faint neon bloom; pressed toggles fill in.">
        <PillSet pill="pt-pill-c" />
      </VariantCard>
      <VariantCard letter="D" name="Gradient edge" pitch="Neutral glass body with a tone-to-clear gradient border; the text stays white so long rows stay calm.">
        <PillSet pill="pt-pill-d" />
      </VariantCard>
      <VariantCard letter="E" name="Dot-led glass" pitch="Neutral frosted pill; the tone lives only in a glowing leading dot. Quietest option for dense tables.">
        <PillSet pill="pt-pill-f" />
      </VariantCard>
    </PrototypeGroup>
  );
}
