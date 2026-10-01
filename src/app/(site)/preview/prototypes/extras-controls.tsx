'use client';

import { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/components/ui/cn';
import { ProgressBar } from '@/components/ui/progress-bar';
import { RadioGroup } from '@/components/ui/radio-group';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { Stepper } from '@/components/ui/stepper';
import { Switch } from '@/components/ui/switch';
import { CheckIcon, ChevronDownIcon, MinusIcon, PlusIcon, SortIcon } from './icons';
import { PrototypeGroup, StateCell, StateGrid, VariantCard } from './gallery';

/* ── Toggles ─────────────────────────────────────────────────────────── */

const OPTIONS = [
  { key: 'gas', label: 'Include gas sites' },
  { key: 'ore', label: 'Include ore sites' },
  { key: 'shattered', label: 'Show shattered systems' },
] as const;

function useChecks() {
  return useState<Record<string, boolean>>({ gas: true, ore: false, shattered: true });
}

function CheckList({ round = false }: { round?: boolean }) {
  const [checks, setChecks] = useChecks();
  return (
    <div className="flex flex-col gap-3">
      {OPTIONS.map((option) => (
        <label key={option.key} className="flex cursor-pointer items-center gap-3 font-ui text-nav text-text">
          <button
            type="button"
            role="checkbox"
            aria-checked={checks[option.key] ?? false}
            aria-label={option.label}
            className={cn('pt-check', round && 'pt-check-round')}
            onClick={() => setChecks((current) => ({ ...current, [option.key]: !current[option.key] }))}
          >
            <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </button>
          {option.label}
        </label>
      ))}
    </div>
  );
}

function SwitchList() {
  const [checks, setChecks] = useChecks();
  return (
    <div className="flex flex-col gap-3">
      {OPTIONS.map((option) => (
        <label key={option.key} className="flex cursor-pointer items-center justify-between gap-3 font-ui text-nav text-text">
          {option.label}
          <button
            type="button"
            role="switch"
            aria-checked={checks[option.key] ?? false}
            aria-label={option.label}
            className="pt-switch"
            onClick={() => setChecks((current) => ({ ...current, [option.key]: !current[option.key] }))}
          />
        </label>
      ))}
    </div>
  );
}

const BASES = [
  { value: 'sell', label: 'Jita sell', detail: 'Lowest sell order' },
  { value: 'buy', label: 'Jita buy', detail: 'Highest buy order' },
  { value: 'avg', label: '5-day average', detail: 'Smooths thin markets' },
] as const;

function SelectTiles() {
  const [basis, setBasis] = useState('sell');
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Price basis">
      {BASES.map((base) => (
        <button
          key={base.value}
          type="button"
          role="radio"
          aria-checked={basis === base.value}
          className="pt-select-tile pt-glass"
          onClick={() => setBasis(base.value)}
        >
          <span className="pt-radio-dot" aria-hidden />
          <span className="flex flex-col">
            <span className="font-ui text-nav text-name">{base.label}</span>
            <span className="font-ui text-label text-muted">{base.detail}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function ChipSwitches() {
  const [checks, setChecks] = useChecks();
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={checks[option.key] ?? false}
          data-tone="green"
          className="pt-toggle-chip"
          onClick={() => setChecks((current) => ({ ...current, [option.key]: !current[option.key] }))}
        >
          {checks[option.key] ? <CheckIcon size={13} /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CurrentToggles() {
  const [gas, setGas] = useState(true);
  const [sync, setSync] = useState(true);
  const [basis, setBasis] = useState('sell');
  return (
    <StateGrid>
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2.5 font-ui text-ui text-text">
          <Checkbox checked={gas} onCheckedChange={setGas} label="Include gas sites" /> Include gas sites
        </label>
        <label className="flex items-center gap-2.5 font-ui text-ui text-text">
          <Switch checked={sync} onCheckedChange={setSync} label="Auto sync" /> Auto sync
        </label>
      </div>
      <RadioGroup label="Price basis (current)" value={basis} onValueChange={setBasis} options={[{ value: 'sell', label: 'Jita sell' }, { value: 'buy', label: 'Jita buy' }]} />
    </StateGrid>
  );
}

export function TogglesGroup() {
  return (
    <PrototypeGroup
      id="toggles"
      title="Checkbox, switch, radio"
      today="Today: a 16px square checkbox with a tiny square fill, an 18px switch, and inset radio wells. Sharp next to the glass."
    >
      <VariantCard letter="Now" name="Square fills" pitch="The shipping Checkbox, Switch, and RadioGroup.">
        <CurrentToggles />
      </VariantCard>
      <VariantCard letter="A" name="Gradient check" pitch="A 20px rounded box that fills with the brand gradient and draws its check.">
        <CheckList />
      </VariantCard>
      <VariantCard letter="B" name="Round check" pitch="Circular checks, for lists where a checkbox marks done-ness (sites cleared, jobs delivered).">
        <CheckList round />
      </VariantCard>
      <VariantCard letter="C" name="Glow switch" pitch="A larger switch with a spring thumb that stretches on press and a glowing gradient track.">
        <SwitchList />
      </VariantCard>
      <VariantCard letter="D" name="Selectable tiles" pitch="One-of-many as glass tiles with a radio light and a description. For settings that deserve a choice.">
        <SelectTiles />
      </VariantCard>
      <VariantCard letter="E" name="Chip switches" pitch="Booleans as pressable chips that gain a check. For filter bars where a row of checkboxes is too heavy.">
        <ChipSwitches />
      </VariantCard>
    </PrototypeGroup>
  );
}

/* ── Progress ────────────────────────────────────────────────────────── */

function Bar({ pct, className }: { pct: number; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty('--pct', `${pct}%`);
  }, [pct]);
  return (
    <div className={cn('pt-progress', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <i ref={ref} />
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const circumference = 2 * Math.PI * 20;
  return (
    <div className="relative inline-flex size-16 items-center justify-center">
      <svg aria-hidden viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id="pt-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-isk)" />
            <stop offset="100%" stopColor="var(--color-aurora)" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="20" fill="none" strokeWidth={4} className="stroke-border" />
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="url(#pt-ring-gradient)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
        />
      </svg>
      <span className="font-ui text-ui font-semibold text-name pt-tabular">{pct}%</span>
    </div>
  );
}

function ProgressSample({ render }: { render: (pct: number) => React.ReactNode }) {
  const [pct, setPct] = useState(64);
  return (
    <div className="flex flex-col gap-4">
      {render(pct)}
      <button type="button" className="pt-ghost-btn self-start" onClick={() => setPct((current) => (current >= 90 ? 18 : current + 24))}>
        Advance
      </button>
    </div>
  );
}

function Steps({ pct }: { pct: number }) {
  const on = Math.round((pct / 100) * 8);
  return (
    <div className="pt-steps" aria-label={`${on} of 8 runs done`}>
      {Array.from({ length: 8 }, (_, index) => <i key={index} data-on={index < on || undefined} />)}
    </div>
  );
}

export function ProgressGroup() {
  return (
    <PrototypeGroup
      id="progress"
      title="Progress"
      today="Today: a 4px square-cornered track with a flat dark-blue fill, plus the EVE-blue job bar."
    >
      <VariantCard letter="Now" name="Flat track" pitch="The shipping ProgressBar, default and evb tones.">
        <div className="flex flex-col gap-4">
          <ProgressBar pct={64} />
          <ProgressBar pct={38} tone="evb" />
        </div>
      </VariantCard>
      <VariantCard letter="A" name="Gradient capsule" pitch="An 8px rounded track with a brand-gradient fill, a soft glow, and a slow shine. Eased width changes.">
        <ProgressSample render={(pct) => <><Bar pct={pct} /><Bar pct={Math.max(10, pct - 26)} className="pt-progress-blue" /></>} />
      </VariantCard>
      <VariantCard letter="B" name="Segmented runs" pitch="One rounded pill per run, for batches where the count matters more than the percentage.">
        <ProgressSample render={(pct) => <Steps pct={pct} />} />
      </VariantCard>
      <VariantCard letter="C" name="Hairline glow" pitch="A 4px bar for dense rows and distribution lists; same gradient, less weight.">
        <ProgressSample render={(pct) => (
          <div className="flex flex-col gap-3">
            {['Gas', 'Ore', 'Relic'].map((label, index) => (
              <div key={label} className="flex flex-col gap-1.5">
                <div className="flex justify-between font-ui text-ui"><span className="text-text">{label}</span><span className="text-muted pt-tabular">{Math.max(5, pct - index * 22)}%</span></div>
                <Bar pct={Math.max(5, pct - index * 22)} className="pt-progress-thin" />
              </div>
            ))}
          </div>
        )} />
      </VariantCard>
      <VariantCard letter="D" name="Gradient ring" pitch="A circular gauge for stat tiles and slot usage.">
        <ProgressSample render={(pct) => <div className="flex gap-4"><Ring pct={pct} /><Ring pct={Math.max(8, pct - 40)} /></div>} />
      </VariantCard>
      <VariantCard letter="E" name="Labelled job bar" pitch="A job card: name, remaining time, and the capsule bar in EVE blue, kept for queue chrome.">
        <ProgressSample render={(pct) => (
          <div className="pt-glass flex flex-col gap-2 rounded-card p-3.5">
            <div className="flex items-baseline justify-between font-ui text-ui">
              <span className="text-name">Praxis · run 3 of 5</span>
              <span className="text-muted pt-tabular">{Math.round((100 - pct) * 0.6)}m left</span>
            </div>
            <Bar pct={pct} className="pt-progress-blue" />
          </div>
        )} />
      </VariantCard>
    </PrototypeGroup>
  );
}

/* ── Tables + steppers ───────────────────────────────────────────────── */

type Material = { name: string; qty: number; price: string };
const MATERIALS: Material[] = [
  { name: 'Tritanium', qty: 124000, price: '0.9M' },
  { name: 'Mexallon', qty: 8400, price: '0.6M' },
  { name: 'Isogen', qty: 2100, price: '0.3M' },
];
const COLUMNS = [
  { key: 'name', label: 'Material', render: (row) => row.name },
  { key: 'qty', label: 'Quantity', align: 'right', render: (row) => row.qty.toLocaleString('en-US') },
] satisfies readonly StaticTableColumn<Material>[];

function PillStepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const [rise, setRise] = useState<'up' | 'down'>('up');
  return (
    <span className="pt-stepper pt-glass" data-dir={rise}>
      <button type="button" aria-label="Fewer runs" onClick={() => { setRise('down'); onChange(Math.max(1, value - 1)); }}><MinusIcon size={14} /></button>
      <output key={value} className="pt-stepper-bump">{value}</output>
      <button type="button" aria-label="More runs" onClick={() => { setRise('up'); onChange(value + 1); }}><PlusIcon size={14} /></button>
    </span>
  );
}

function GlassTable() {
  const [runs, setRuns] = useState(3);
  return (
    <div className="flex flex-col gap-4">
      <div className="pt-glass overflow-hidden rounded-card">
        <table className="pt-table">
          <thead>
            <tr>
              <th>Material</th>
              <th className="pt-num"><span className="pt-sort">Quantity <SortIcon size={13} /></span></th>
              <th className="pt-num">Cost</th>
            </tr>
          </thead>
          <tbody>
            {MATERIALS.map((row) => (
              <tr key={row.name}>
                <td className="text-name">{row.name}</td>
                <td className="pt-num">{(row.qty * runs).toLocaleString('en-US')}</td>
                <td className="pt-num">{row.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StateCell label="pill stepper · runs">
        <PillStepper value={runs} onChange={setRuns} />
      </StateCell>
    </div>
  );
}

function FloatingRows() {
  const [me, setMe] = useState(8);
  return (
    <div className="flex flex-col gap-3">
      <table className="pt-table pt-table-rows">
        <thead>
          <tr><th>Material</th><th className="pt-num">Quantity</th><th className="pt-num">Cost</th></tr>
        </thead>
        <tbody>
          {MATERIALS.map((row) => (
            <tr key={row.name}>
              <td className="text-name">{row.name}</td>
              <td className="pt-num">{row.qty.toLocaleString('en-US')}</td>
              <td className="pt-num text-isk">{row.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <StateCell label="inline stepper · ME">
        <span className="inline-flex items-center gap-1 font-ui text-nav text-name">
          <button type="button" className="pt-clear" aria-label="Lower ME" onClick={() => setMe(Math.max(0, me - 1))}><ChevronDownIcon size={13} /></button>
          <span className="w-8 text-center pt-tabular">{me}</span>
          <button type="button" className="pt-clear rotate-180" aria-label="Raise ME" onClick={() => setMe(Math.min(10, me + 1))}><ChevronDownIcon size={13} /></button>
          <span className="ml-1 text-muted">ME</span>
        </span>
      </StateCell>
    </div>
  );
}

function CardList() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {MATERIALS.map((row) => (
        <div key={row.name} className="pt-glass flex flex-col gap-1 rounded-card p-3.5">
          <span className="font-ui text-label text-muted">{row.name}</span>
          <span className="font-ui text-h3 font-semibold text-name pt-tabular">{row.qty.toLocaleString('en-US')}</span>
          <span className="font-ui text-ui text-isk">{row.price} ISK</span>
        </div>
      ))}
    </div>
  );
}

function CurrentTable() {
  const [runs, setRuns] = useState(3);
  return (
    <div className="flex flex-col gap-4">
      <StaticTable ariaLabel="Materials (current)" columns={COLUMNS} rows={MATERIALS} getRowKey={(row) => row.name} />
      <Stepper ariaLabel="Runs (current)" value={runs} onChange={setRuns} min={1} />
    </div>
  );
}

export function TablesGroup() {
  return (
    <PrototypeGroup
      id="tables"
      title="Tables + steppers"
      today="Today: monospace cells under uppercase tracked headers, a square bordered sortable grid, and boxed –/+ steppers."
    >
      <VariantCard letter="Now" name="Mono grid" pitch="The shipping StaticTable and Stepper.">
        <CurrentTable />
      </VariantCard>
      <VariantCard letter="A" name="Glass table" pitch="A rounded glass container, sentence-case headers, an aurora sort chevron, tabular Geist numbers, and a pill stepper.">
        <GlassTable />
      </VariantCard>
      <VariantCard letter="B" name="Floating rows" pitch="Each row is its own rounded glass strip. Easier to scan on wide screens; pairs with an inline chevron stepper.">
        <FloatingRows />
      </VariantCard>
      <VariantCard letter="C" name="Card list" pitch="On narrow screens the same rows become small stat cards.">
        <CardList />
      </VariantCard>
    </PrototypeGroup>
  );
}
