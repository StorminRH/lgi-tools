'use client';

import { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/components/ui/cn';
import { ProgressBar } from '@/components/ui/progress-bar';
import { RadioGroup } from '@/components/ui/radio-group';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { Stepper } from '@/components/ui/stepper';
import { Switch } from '@/components/ui/switch';
import { ChevronDownIcon, MinusIcon, PlusIcon } from './icons';
import { PrototypeGroup, StateCell, StateGrid, VariantCard } from './gallery';

/* ── Checkbox, switch, radio ─────────────────────────────────────────────
 * Every card: three checkboxes (gas on, ore off, shattered on), two switches
 * (auto sync on, show prices off), and a two-option radio (Jita sell).      */

const CHECKS = [
  { key: 'gas', label: 'Include gas sites' },
  { key: 'ore', label: 'Include ore sites' },
  { key: 'shattered', label: 'Show shattered systems' },
] as const;
const SWITCHES = [
  { key: 'sync', label: 'Auto sync' },
  { key: 'prices', label: 'Show prices' },
] as const;
const BASES = [
  { value: 'sell', label: 'Jita sell' },
  { value: 'buy', label: 'Jita buy' },
] as const;

const INITIAL = { gas: true, ore: false, shattered: true, sync: true, prices: false };

function useToggles() {
  const [on, setOn] = useState<Record<string, boolean>>(INITIAL);
  const [basis, setBasis] = useState('sell');
  const flip = (key: string) => setOn((current) => ({ ...current, [key]: !current[key] }));
  return { on, flip, basis, setBasis };
}

const CHECK_MARK = (
  <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

function ToggleSet({ look }: { look: string }) {
  const { on, flip, basis, setBasis } = useToggles();
  return (
    <div className={cn('grid gap-6 sm:grid-cols-[1.3fr_1fr]', look)}>
      <div className="flex flex-col gap-3">
        {CHECKS.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-center gap-3 font-ui text-ui text-text">
            <button type="button" role="checkbox" aria-checked={on[item.key] ?? false} aria-label={item.label} className="pt-cbx" onClick={() => flip(item.key)}>
              {CHECK_MARK}
            </button>
            {item.label}
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {SWITCHES.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-center gap-3 font-ui text-ui text-text">
            <button type="button" role="switch" aria-checked={on[item.key] ?? false} aria-label={item.label} className="pt-sw" onClick={() => flip(item.key)} />
            {item.label}
          </label>
        ))}
        <div role="radiogroup" aria-label="Price basis" className="mt-1 flex flex-col gap-3">
          {BASES.map((base) => (
            <label key={base.value} className="flex cursor-pointer items-center gap-3 font-ui text-ui text-text">
              <button type="button" role="radio" aria-checked={basis === base.value} aria-label={base.label} className="pt-rd" onClick={() => setBasis(base.value)} />
              {base.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function CurrentToggles() {
  const { on, flip, basis, setBasis } = useToggles();
  return (
    <div className="grid gap-6 sm:grid-cols-[1.3fr_1fr]">
      <div className="flex flex-col gap-3">
        {CHECKS.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-center gap-3 font-ui text-ui text-text">
            <Checkbox checked={on[item.key] ?? false} onCheckedChange={() => flip(item.key)} label={item.label} />
            {item.label}
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {SWITCHES.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-center gap-3 font-ui text-ui text-text">
            <Switch checked={on[item.key] ?? false} onCheckedChange={() => flip(item.key)} label={item.label} />
            {item.label}
          </label>
        ))}
        <RadioGroup className="mt-1" label="Price basis (current)" value={basis} onValueChange={setBasis} options={BASES} />
      </div>
    </div>
  );
}

export function TogglesGroup() {
  return (
    <PrototypeGroup
      id="toggles"
      title="Checkbox, switch, radio"
      today="Every card shows the same three checkboxes, two switches, and price-basis radio. Only the look changes."
    >
      <VariantCard letter="Now" name="Square fills" pitch="The shipping Checkbox, Switch, and RadioGroup: a 16px square with a tiny square fill, an 18px switch, and inset radio wells.">
        <CurrentToggles />
      </VariantCard>
      <VariantCard letter="A" name="Gradient fill" pitch="20px rounded box that fills with the brand gradient and draws its check; matching gradient switch track and glowing radio light.">
        <ToggleSet look="pt-tg-a" />
      </VariantCard>
      <VariantCard letter="B" name="Glass outline" pitch="No solid fills: checked controls get an aurora outline, an aurora check, and a glowing aurora switch thumb.">
        <ToggleSet look="pt-tg-b" />
      </VariantCard>
      <VariantCard letter="C" name="Round" pitch="Circular checkboxes and radios with a gradient fill, plus the gradient switch. Softest silhouette.">
        <ToggleSet look="pt-tg-c" />
      </VariantCard>
      <VariantCard letter="D" name="Soft tint" pitch="Checked controls take a translucent green tint with a green check and thumb, matching the glass pills.">
        <ToggleSet look="pt-tg-d" />
      </VariantCard>
      <VariantCard letter="E" name="Monochrome glass" pitch="White-on-glass: checked boxes fill frosted white with a dark check; the switch goes white with a dark thumb.">
        <ToggleSet look="pt-tg-e" />
      </VariantCard>
    </PrototypeGroup>
  );
}

/* ── Progress ────────────────────────────────────────────────────────────
 * Every card: the default bar and the EVE-blue job bar, same values, with
 * an Advance button to watch the width change.                            */

function Bar({ pct, tone }: { pct: number; tone: 'default' | 'evb' }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty('--pct', `${pct}%`);
  }, [pct]);
  return (
    <div className="pt-pb" data-bar={tone} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <i ref={ref} />
    </div>
  );
}

function useAdvance() {
  const [pct, setPct] = useState(64);
  return { pct, evb: Math.max(10, pct - 26), advance: () => setPct((current) => (current >= 90 ? 18 : current + 24)) };
}

function AdvanceButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="pt-ghost-btn -ml-3 self-start" onClick={onClick}>
      Advance
    </button>
  );
}

function ProgressSet({ look }: { look: string }) {
  const { pct, evb, advance } = useAdvance();
  return (
    <div className={cn('flex flex-col gap-4', look)}>
      <StateCell label={`default · ${pct}%`}><Bar pct={pct} tone="default" /></StateCell>
      <StateCell label={`evb · ${evb}%`}><Bar pct={evb} tone="evb" /></StateCell>
      <AdvanceButton onClick={advance} />
    </div>
  );
}

function CurrentProgress() {
  const { pct, evb, advance } = useAdvance();
  return (
    <div className="flex flex-col gap-4">
      <StateCell label={`default · ${pct}%`}><ProgressBar pct={pct} /></StateCell>
      <StateCell label={`evb · ${evb}%`}><ProgressBar pct={evb} tone="evb" /></StateCell>
      <AdvanceButton onClick={advance} />
    </div>
  );
}

export function ProgressGroup() {
  return (
    <PrototypeGroup
      id="progress"
      title="Progress"
      today="Every card shows the same two ProgressBars (default and evb) at the same values. Only the look changes."
    >
      <VariantCard letter="Now" name="Flat track" pitch="The shipping ProgressBar: a 4px square-cornered track with a flat dark-blue fill, and the EVE-blue job bar.">
        <CurrentProgress />
      </VariantCard>
      <VariantCard letter="A" name="Gradient capsule" pitch="8px rounded track, brand-gradient fill with a soft glow and a slow shine; the job bar keeps EVE blue.">
        <ProgressSet look="pt-pb-a" />
      </VariantCard>
      <VariantCard letter="B" name="Frosted well" pitch="A 10px frosted glass track with an inset shadow; the fill is a rounded lit pill sitting inside it.">
        <ProgressSet look="pt-pb-b" />
      </VariantCard>
      <VariantCard letter="C" name="Hairline glow" pitch="Same 4px weight as today, but rounded with a gradient fill and a soft glow. Least change to dense rows.">
        <ProgressSet look="pt-pb-c" />
      </VariantCard>
      <VariantCard letter="D" name="Soft solid" pitch="6px rounded bar with a flat translucent tone fill, no gradient or glow. Quiet and readable.">
        <ProgressSet look="pt-pb-d" />
      </VariantCard>
      <VariantCard letter="E" name="Glowing head" pitch="6px gradient bar whose leading edge carries a bright glowing dot, so movement is easy to spot.">
        <ProgressSet look="pt-pb-e" />
      </VariantCard>
    </PrototypeGroup>
  );
}

/* ── Tables + steppers ───────────────────────────────────────────────────
 * Every card: the same Material / Quantity table and the Runs stepper.     */

type Material = { name: string; qty: number };
const MATERIALS: Material[] = [
  { name: 'Tritanium', qty: 124000 },
  { name: 'Mexallon', qty: 8400 },
  { name: 'Isogen', qty: 2100 },
];
const COLUMNS = [
  { key: 'name', label: 'Material', render: (row) => row.name },
  { key: 'qty', label: 'Quantity', align: 'right', render: (row) => row.qty.toLocaleString('en-US') },
] satisfies readonly StaticTableColumn<Material>[];

function MaterialTable({ className }: { className: string }) {
  return (
    <table className={cn('pt-table', className)}>
      <thead>
        <tr><th>Material</th><th className="pt-num">Quantity</th></tr>
      </thead>
      <tbody>
        {MATERIALS.map((row) => (
          <tr key={row.name}>
            <td className="text-name">{row.name}</td>
            <td className="pt-num">{row.qty.toLocaleString('en-US')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useRuns() {
  const [runs, setRuns] = useState(3);
  return { runs, down: () => setRuns((current) => Math.max(1, current - 1)), up: () => setRuns((current) => current + 1) };
}

function PillStepper() {
  const { runs, down, up } = useRuns();
  return (
    <span className="pt-stepper pt-glass">
      <button type="button" aria-label="Fewer runs" onClick={down}><MinusIcon size={14} /></button>
      <output className="pt-stepper-value">{runs}</output>
      <button type="button" aria-label="More runs" onClick={up}><PlusIcon size={14} /></button>
    </span>
  );
}

function ChevronStepper() {
  const { runs, down, up } = useRuns();
  return (
    <span className="inline-flex items-center gap-1 font-ui text-nav text-name">
      <button type="button" className="pt-clear" aria-label="Fewer runs" onClick={down}><ChevronDownIcon size={13} /></button>
      <span className="w-8 text-center pt-tabular">{runs}</span>
      <button type="button" className="pt-clear rotate-180" aria-label="More runs" onClick={up}><ChevronDownIcon size={13} /></button>
    </span>
  );
}

function BoxStepper() {
  const { runs, down, up } = useRuns();
  return (
    <span className="pt-stepper pt-stepper-box">
      <button type="button" aria-label="Fewer runs" onClick={down}><MinusIcon size={14} /></button>
      <output className="pt-stepper-value">{runs}</output>
      <button type="button" aria-label="More runs" onClick={up}><PlusIcon size={14} /></button>
    </span>
  );
}

function CurrentTable() {
  const [runs, setRuns] = useState(3);
  return (
    <div className="flex flex-col gap-4">
      <StaticTable ariaLabel="Materials (current)" columns={COLUMNS} rows={MATERIALS} getRowKey={(row) => row.name} />
      <StateCell label="stepper · runs">
        <Stepper ariaLabel="Runs (current)" value={runs} onChange={setRuns} min={1} />
      </StateCell>
    </div>
  );
}

export function TablesGroup() {
  return (
    <PrototypeGroup
      id="tables"
      title="Tables + steppers"
      today="Every card shows the same StaticTable rows and Runs Stepper. Only the look changes."
    >
      <VariantCard letter="Now" name="Mono grid" pitch="The shipping StaticTable and Stepper: monospace cells, uppercase tracked headers, and a boxed –/+ stepper.">
        <CurrentTable />
      </VariantCard>
      <VariantCard letter="A" name="Glass table" pitch="A rounded glass container, sentence-case headers, tabular Geist numbers, and a pill stepper with round buttons.">
        <StateGrid columns={1}>
          <div className="pt-glass overflow-hidden rounded-card"><MaterialTable className="" /></div>
          <StateCell label="stepper · runs"><PillStepper /></StateCell>
        </StateGrid>
      </VariantCard>
      <VariantCard letter="B" name="Floating rows" pitch="Each row is its own rounded glass strip with no rules between; a minimal chevron stepper.">
        <StateGrid columns={1}>
          <MaterialTable className="pt-table-rows" />
          <StateCell label="stepper · runs"><ChevronStepper /></StateCell>
        </StateGrid>
      </VariantCard>
      <VariantCard letter="C" name="Soft zebra" pitch="No rules at all: alternate rows carry a faint tint, the header sits on a green hairline, and the stepper is a rounded glass box.">
        <StateGrid columns={1}>
          <MaterialTable className="pt-table-zebra" />
          <StateCell label="stepper · runs"><BoxStepper /></StateCell>
        </StateGrid>
      </VariantCard>
    </PrototypeGroup>
  );
}
