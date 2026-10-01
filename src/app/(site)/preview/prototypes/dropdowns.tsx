import { cn } from '@/components/ui/cn';
import { dropdownGroupLabel, dropdownItem, dropdownPanel } from '@/components/ui/dropdown-panel';
import { fieldText, fieldVariants } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { CheckIcon, ChevronDownIcon, SearchIcon } from './icons';
import { PrototypeGroup, StateCell, StateGrid, VariantCard } from './gallery';

/*
 * Every card renders the same two open states, so the only difference between
 * cards is the look:
 *   Select   — the trade-hub picker, open, grouped, with a selected, a
 *              highlighted, and a disabled option.
 *   Combobox — the system search with "J1" typed and three suggestions.
 */

type Option = { label: string; state?: 'selected' | 'highlighted' | 'disabled' };

const HUB_GROUPS: readonly { group: string | null; options: readonly Option[] }[] = [
  { group: null, options: [{ label: 'Jita IV - Moon 4', state: 'selected' }, { label: 'Amarr VIII (Oris)', state: 'highlighted' }] },
  {
    group: 'Secondary hubs',
    options: [{ label: 'Dodixie IX - Moon 20' }, { label: 'Rens VI - Moon 8' }, { label: 'Hek VIII - Moon 12', state: 'disabled' }],
  },
];

const SUGGESTIONS: readonly Option[] = [
  { label: 'J115405', state: 'highlighted' },
  { label: 'J104809' },
  { label: 'J160941' },
];

/** Class recipe for one look; "Now" uses the shipping primitive classes. */
type Look = {
  trigger: string;
  value: string;
  caret: 'glyph' | 'chevron';
  panel: string;
  group: string;
  option: string;
  check: 'glyph' | 'icon';
  combo: string;
  prompt: 'terminal' | 'icon';
};

const NOW: Look = {
  trigger: cn(fieldVariants(), 'flex w-full items-center gap-1.5 border-isk-sub shadow-field-focus'),
  value: cn(fieldText, 'flex-1 truncate'),
  caret: 'glyph',
  panel: cn(dropdownPanel, 'mt-1'),
  group: dropdownGroupLabel,
  option: dropdownItem,
  check: 'glyph',
  combo: cn(fieldVariants(), 'flex items-center gap-1.5 border-hairline-accent shadow-field-focus'),
  prompt: 'terminal',
};

function lookFor(variant: string): Look {
  return {
    trigger: `pt-dd-trigger pt-dd-${variant}-trigger`,
    value: 'flex-1 truncate',
    caret: 'chevron',
    panel: `pt-dd-panel pt-glass-dense pt-dd-${variant}-panel`,
    group: 'pt-group-label',
    option: `pt-option pt-dd-${variant}-option`,
    check: 'icon',
    combo: `pt-dd-trigger pt-dd-${variant}-trigger pt-dd-combo`,
    prompt: 'icon',
  };
}

function OptionRow({ option, look }: { option: Option; look: Look }) {
  const selected = option.state === 'selected';
  return (
    <div
      role="option"
      aria-selected={selected}
      aria-disabled={option.state === 'disabled' || undefined}
      data-selected={selected || undefined}
      data-highlighted={option.state === 'highlighted' || undefined}
      data-disabled={option.state === 'disabled' || undefined}
      className={cn(look.option, option.state === 'disabled' && 'opacity-40')}
    >
      <span className="truncate">{option.label}</span>
      {selected ? (look.check === 'glyph' ? <span className="shrink-0 text-isk">✓</span> : <CheckIcon size={15} className="pt-opt-check ml-auto" />) : null}
    </div>
  );
}

function SelectOpen({ look }: { look: Look }) {
  return (
    <div>
      <div className={look.trigger} data-open>
        <span className={look.value}>Jita IV - Moon 4</span>
        {look.caret === 'glyph' ? <span className="shrink-0 text-muted">▾</span> : <ChevronDownIcon className="pt-chevron" />}
      </div>
      <div className={look.panel} role="listbox" aria-label="Trade hub">
        {HUB_GROUPS.map((group) => (
          <div key={group.group ?? 'top'}>
            {group.group ? <div className={look.group}>{group.group}</div> : null}
            {group.options.map((option) => <OptionRow key={option.label} option={option} look={look} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function ComboboxOpen({ look }: { look: Look }) {
  return (
    <div>
      <div className={look.combo} data-open>
        {look.prompt === 'terminal' ? (
          <span className="shrink-0 font-data text-ui font-bold text-isk">&gt;</span>
        ) : (
          <SearchIcon className="pt-combo-icon" />
        )}
        <span className={cn(look.value, look.prompt === 'terminal' && fieldText)}>J1</span>
        <Kbd>esc</Kbd>
      </div>
      <div className={look.panel} role="listbox" aria-label="Systems">
        <div className={look.group}>Wormholes</div>
        {SUGGESTIONS.map((option) => <OptionRow key={option.label} option={option} look={look} />)}
      </div>
    </div>
  );
}

function Pair({ look }: { look: Look }) {
  return (
    <StateGrid>
      <StateCell label="select · open">
        <SelectOpen look={look} />
      </StateCell>
      <StateCell label="combobox · typing">
        <ComboboxOpen look={look} />
      </StateCell>
    </StateGrid>
  );
}

export function DropdownsGroup() {
  return (
    <PrototypeGroup
      id="dropdowns"
      title="Dropdowns + comboboxes"
      today="Every card shows the same Select (open) and Combobox (typing). Only the look changes."
    >
      <VariantCard letter="Now" name="Field trigger" pitch="The shipping Select and Combobox: an engraved field, a ▾ glyph, monospace rows, and a solid green selected row.">
        <Pair look={NOW} />
      </VariantCard>
      <VariantCard letter="A" name="Glass capsule" pitch="Pill-shaped trigger and field, rounded glass list, a soft aurora tint plus check for the selected row.">
        <Pair look={lookFor('a')} />
      </VariantCard>
      <VariantCard letter="B" name="Glow rail" pitch="Rounded frosted trigger; the highlighted row gets a gradient wash and a glowing rail on its left edge.">
        <Pair look={lookFor('b')} />
      </VariantCard>
      <VariantCard letter="C" name="Raised bezel" pitch="The selected row lifts out of the list as a small glass bezel, echoing the segmented control.">
        <Pair look={lookFor('c')} />
      </VariantCard>
      <VariantCard letter="D" name="Hairline" pitch="Lightest touch: transparent trigger with a hairline, no fills in the list, a hairline ring on the highlighted row.">
        <Pair look={lookFor('d')} />
      </VariantCard>
      <VariantCard letter="E" name="Accent edge" pitch="Dense frosted panel with a brand-gradient top edge; the selected row carries a green bar.">
        <Pair look={lookFor('e')} />
      </VariantCard>
    </PrototypeGroup>
  );
}
