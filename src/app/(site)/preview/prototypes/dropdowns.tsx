'use client';

import { useState } from 'react';
import { Select, type SelectItems } from '@/components/ui/select';
import { CheckIcon, ChevronDownIcon, CloseIcon, SearchIcon } from './icons';
import { PrototypeGroup, StateLabel, VariantCard } from './gallery';

type Hub = { value: string; label: string; detail: string; meta: string; group: 'Main hubs' | 'Secondary hubs' };

const HUBS: readonly Hub[] = [
  { value: 'jita', label: 'Jita IV - Moon 4', detail: 'Caldari Navy Assembly Plant', meta: '1.0', group: 'Main hubs' },
  { value: 'amarr', label: 'Amarr VIII (Oris)', detail: 'Emperor Family Academy', meta: '1.0', group: 'Main hubs' },
  { value: 'dodixie', label: 'Dodixie IX - Moon 20', detail: 'Federation Navy Assembly Plant', meta: '0.9', group: 'Secondary hubs' },
  { value: 'rens', label: 'Rens VI - Moon 8', detail: 'Brutor Tribe Treasury', meta: '0.9', group: 'Secondary hubs' },
];

const SELECT_ITEMS: SelectItems = [
  { value: 'jita', label: 'Jita IV - Moon 4' },
  { value: 'amarr', label: 'Amarr VIII (Oris)' },
  { group: 'Secondary hubs', options: [{ value: 'dodixie', label: 'Dodixie IX - Moon 20' }, { value: 'rens', label: 'Rens VI - Moon 8' }] },
];

const SYSTEMS = [
  { name: 'J115405', meta: 'C3 · Pulsar', tone: 'purple' },
  { name: 'J104809', meta: 'C2 · Wolf-Rayet', tone: 'teal' },
  { name: 'Jita', meta: 'The Forge · 1.0', tone: 'green' },
  { name: 'Jan', meta: 'Placid · 0.4', tone: 'orange' },
] as const;

const SITE_TYPES = [
  { value: 'gas', label: 'Gas', tone: 'orange' },
  { value: 'ore', label: 'Ore', tone: 'blue' },
  { value: 'relic', label: 'Relic', tone: 'green' },
  { value: 'data', label: 'Data', tone: 'teal' },
  { value: 'combat', label: 'Combat', tone: 'red' },
] as const;

function hubLabel(value: string) {
  return HUBS.find((hub) => hub.value === value)?.label ?? value;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}

function CapsuleSelect() {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState('jita');
  return (
    <div className="pt-dd-a relative">
      <button type="button" className="pt-dd-a-trigger pt-glass" data-open={open || undefined} onClick={() => setOpen((current) => !current)}>
        <span className="flex-1 text-left">{hubLabel(value)}</span>
        <ChevronDownIcon className="pt-chevron" />
      </button>
      {open ? (
        <div className="pt-panel pt-glass-dense" role="listbox" aria-label="Trade hub">
          {(['Main hubs', 'Secondary hubs'] as const).map((group) => (
            <div key={group}>
              <div className="pt-group-label">{group}</div>
              {HUBS.filter((hub) => hub.group === group).map((hub) => (
                <button
                  key={hub.value}
                  type="button"
                  role="option"
                  aria-selected={hub.value === value}
                  className="pt-option"
                  onClick={() => {
                    setValue(hub.value);
                    setOpen(false);
                  }}
                >
                  {hub.label}
                  <span className="pt-opt-check ml-auto">{hub.value === value ? <CheckIcon size={15} /> : null}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SpotlightCombobox() {
  const [query, setQuery] = useState('j1');
  const [active, setActive] = useState(0);
  const matches = SYSTEMS.filter((system) => system.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="pt-dd-b">
      <div className="pt-dd-b-panel pt-glass-dense">
        <div className="pt-dd-b-search">
          <SearchIcon />
          <input
            className="pt-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder="Search systems, sites, items…"
            aria-label="Search systems"
          />
        </div>
        <div className="pt-dd-b-list" role="listbox" aria-label="Systems">
          <div className="pt-group-label">Systems</div>
          {matches.map((system, index) => (
            <div
              key={system.name}
              role="option"
              aria-selected={index === active}
              tabIndex={-1}
              data-highlighted={index === active || undefined}
              data-tone={system.tone}
              className="pt-option"
              onMouseEnter={() => setActive(index)}
            >
              <span className="pt-option-icon">{system.name.slice(0, 2)}</span>
              <span className="flex flex-col">
                <span className="text-name"><Highlight text={system.name} query={query} /></span>
                <span className="text-label text-muted">{system.meta}</span>
              </span>
              <span className="pt-option-meta">↵</span>
            </div>
          ))}
          {matches.length === 0 ? <div className="px-3 py-4 font-ui text-ui text-muted">No systems match “{query}”.</div> : null}
        </div>
        <div className="pt-dd-b-foot">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span className="ml-auto">esc to close</span>
        </div>
      </div>
    </div>
  );
}

function SheetSelect() {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState('amarr');
  return (
    <div className="pt-dd-c relative">
      <button type="button" className="pt-dd-c-trigger pt-glass" data-open={open || undefined} onClick={() => setOpen((current) => !current)}>
        <span className="min-w-0 flex-1">
          <small>Trade hub</small>
          <strong>{hubLabel(value)}</strong>
        </span>
        <ChevronDownIcon className="pt-chevron" />
      </button>
      {open ? (
        <div className="pt-panel pt-glass-dense flex flex-col gap-1" role="listbox" aria-label="Trade hub">
          {HUBS.slice(0, 3).map((hub) => (
            <button
              key={hub.value}
              type="button"
              role="option"
              aria-selected={hub.value === value}
              className="pt-option"
              onClick={() => {
                setValue(hub.value);
                setOpen(false);
              }}
            >
              <span className="pt-radio-dot" />
              <span className="flex flex-col">
                <span className="text-name">{hub.label}</span>
                <span className="text-label text-muted">{hub.detail}</span>
              </span>
              <span className="pt-option-meta">{hub.meta}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChipMultiSelect() {
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<string[]>(['gas', 'relic']);
  const toggle = (value: string) =>
    setPicked((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  return (
    <div className="relative">
      <div className="pt-dd-d-field pt-glass" data-open={open || undefined}>
        {SITE_TYPES.filter((type) => picked.includes(type.value)).map((type) => (
          <span key={type.value} className="pt-token" data-tone={type.tone}>
            {type.label}
            <button type="button" className="pt-token-x" aria-label={`Remove ${type.label}`} onClick={() => toggle(type.value)}>
              <CloseIcon size={11} />
            </button>
          </span>
        ))}
        <button type="button" className="ml-auto flex items-center gap-1 px-1 font-ui text-ui text-muted" onClick={() => setOpen((current) => !current)}>
          {picked.length === 0 ? 'Any site type' : null}
          <ChevronDownIcon className="pt-chevron" />
        </button>
      </div>
      {open ? (
        <div className="pt-panel pt-glass-dense" role="listbox" aria-multiselectable aria-label="Site types">
          {SITE_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              role="option"
              aria-selected={picked.includes(type.value)}
              className="pt-option"
              onClick={() => toggle(type.value)}
            >
              <span className="pt-checkmark"><CheckIcon size={12} /></span>
              <span className="pt-pill-dot" data-tone={type.tone} />
              {type.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InlineExpand() {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState('dodixie');
  return (
    <div className="pt-dd-e pt-glass" data-open={open || undefined}>
      <button type="button" className="pt-dd-e-head" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className="flex-1">
          <span className="block font-ui text-label text-muted">Trade hub</span>
          {hubLabel(value)}
        </span>
        <ChevronDownIcon className="pt-chevron" />
      </button>
      <div className="pt-dd-e-body">
        <div>
          <div className="pt-dd-e-list" role="listbox" aria-label="Trade hub">
            {HUBS.map((hub) => (
              <button
                key={hub.value}
                type="button"
                role="option"
                aria-selected={hub.value === value}
                className="pt-option"
                onClick={() => {
                  setValue(hub.value);
                  setOpen(false);
                }}
              >
                {hub.label}
                {hub.value === value ? <CheckIcon size={15} className="ml-auto" /> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrentSelect() {
  const [value, setValue] = useState('jita');
  return (
    <div className="flex flex-col gap-2">
      <StateLabel>closed · open it to compare the panel</StateLabel>
      <Select ariaLabel="Trade hub (current)" value={value} onValueChange={setValue} items={SELECT_ITEMS} />
    </div>
  );
}

export function DropdownsGroup() {
  return (
    <PrototypeGroup
      id="dropdowns"
      title="Dropdowns + comboboxes"
      today="Today: a field-styled trigger with a ▾ glyph, monospace options, and a solid green selected row."
    >
      <VariantCard letter="Now" name="Field trigger" pitch="The shipping Select. The panel is already glass; the trigger and rows are the dated parts.">
        <CurrentSelect />
      </VariantCard>
      <VariantCard letter="A" name="Glass capsule" pitch="A pill trigger with a spring chevron, rounded rows, and a soft aurora tint plus check for the selected row.">
        <div className="min-h-[290px]"><CapsuleSelect /></div>
      </VariantCard>
      <VariantCard letter="B" name="Spotlight combobox" pitch="Command-palette search: icon tiles, highlighted matches, a glowing active rail, and keyboard hints.">
        <SpotlightCombobox />
      </VariantCard>
      <VariantCard letter="C" name="Two-line sheet" pitch="The trigger shows its label and value; options carry a description and a raised selected bezel with a radio light.">
        <div className="min-h-[300px]"><SheetSelect /></div>
      </VariantCard>
      <VariantCard letter="D" name="Chip multi-select" pitch="For filters: chosen values become removable tone chips inside the field, with checkbox rows below.">
        <div className="min-h-[300px]"><ChipMultiSelect /></div>
      </VariantCard>
      <VariantCard letter="E" name="Inline expand" pitch="No floating layer: the field opens in place with a smooth height spring. Best inside drawers and on phones.">
        <InlineExpand />
      </VariantCard>
    </PrototypeGroup>
  );
}
