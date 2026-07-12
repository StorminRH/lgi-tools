'use client';

import { useMemo, useState } from 'react';
import { RigSupply } from '@/components/RigSupply';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Pill } from '@/components/ui/pill';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { useSystemSearch, type SystemErr, type SystemParams } from '@/components/use-system-search';
import {
  SDE_CITADEL_GROUP_ID,
  SDE_ENGINEERING_COMPLEX_GROUP_ID,
  SDE_REFINERY_GROUP_ID,
} from '@/data/eve-data/constants';
import { type StructureRigOption, type StructureTypeOption } from '@/data/eve-data/structures';
import { formatSec, type SystemSearchEntry } from '@/data/eve-data/systems-search';
import {
  MAX_FACILITY_TAX_PCT,
  parseFacilityTaxDraft,
  taxDraftFromStored,
} from '@/data/industry-math/fees';
import { apiFetch } from '@/lib/api-client';
import {
  createCustomStructureEndpoint,
  deleteCustomStructureEndpoint,
  MAX_CUSTOM_STRUCTURE_NAME_LEN,
  MAX_CUSTOM_STRUCTURE_RIGS,
  parseStructureFitEndpoint,
  setCustomStructurePinEndpoint,
  setCustomStructureTaxEndpoint,
} from '../api-contract';
import {
  buildCreateStructurePayload,
  canReadFit,
  deriveBuilderView,
  deriveSavedRowView,
  readyBuildInput,
  resolveFitName,
  slotsFromParsedFit,
  type SavedStructureRowView,
} from '../custom-structure-view';
import type { CustomStructureRow } from '../types';

const slotIndices = Array.from({ length: MAX_CUSTOM_STRUCTURE_RIGS }, (_, i) => i);

// The structure family label shown beside each type in the picker (the SDE group,
// not a "role" — a Citadel hosts manufacturing rigs but carries no role bonus).
const STRUCTURE_GROUP_LABEL: Record<number, string> = {
  [SDE_ENGINEERING_COMPLEX_GROUP_ID]: 'Engineering Complex',
  [SDE_REFINERY_GROUP_ID]: 'Refinery',
  [SDE_CITADEL_GROUP_ID]: 'Citadel',
};

// The system-search parse/suggest pair from `useSystemSearch`, forwarded to the
// TerminalSearch inputs in the pin fields.
type SystemParse = (input: string) => { ok: true; params: SystemParams } | { ok: false; error: SystemErr };
type SystemSuggest = (input: string) => Promise<string[]>;

// The optional system pin for the structure being built: shows a cleared Pill
// once chosen, else the system search.
function PinField({
  pin,
  parse,
  suggest,
  onPick,
  onClear,
}: {
  pin: SystemSearchEntry | null;
  parse: SystemParse;
  suggest: SystemSuggest;
  onPick: (system: SystemSearchEntry) => void;
  onClear: () => void;
}) {
  if (pin) {
    return (
      <div className="flex items-center gap-2">
        <Pill tone="blue">
          {pin.name} {formatSec(pin.security)}
        </Pill>
        <button
          type="button"
          onClick={onClear}
          className="text-label uppercase tracking-[0.12em] text-muted hover:text-text"
        >
          Clear
        </button>
      </div>
    );
  }
  return (
    <div className="w-full max-w-[320px]">
      <TerminalSearch<SystemParams, SystemErr>
        initialValue=""
        placeholder="System name — leave empty for portable"
        parse={parse}
        suggest={suggest}
        errorMessage={() => 'No system matches that name.'}
        onSubmit={({ system }) => onPick(system)}
        onClear={onClear}
        errorLabel="System"
        hint="Pinned structures show only in that system's build list"
      />
    </div>
  );
}

// Pills summarising a saved structure: its rigs (or "no rigs"), pin, and tax.
function StructureMetaPills({ view }: { view: SavedStructureRowView }) {
  return (
    <>
      {view.rigLabels.map((r) => (
        <Pill key={r.key} tone="blue">
          {r.label}
        </Pill>
      ))}
      {view.hasNoRigs && <span className="text-micro text-muted">no rigs</span>}
      {view.pinLabel !== null && <Pill tone="blue">Pinned · {view.pinLabel}</Pill>}
      {view.taxLabel !== null && <Pill tone="neutral">{view.taxLabel}</Pill>}
    </>
  );
}

// Inline facility-tax editor for a saved structure. Setting an empty value clears
// the tax back to never-entered (the 0.25% NPC-baseline assumption).
function InlineTaxEditor({
  name,
  draft,
  onDraftChange,
  busy,
  onSet,
  onError,
}: {
  name: string;
  draft: string;
  onDraftChange: (value: string) => void;
  busy: boolean;
  onSet: (taxPct: number | null) => void;
  onError: (message: string) => void;
}) {
  return (
    <div className="flex w-full max-w-[320px] items-center gap-2">
      <Input
        type="number"
        min={0}
        max={MAX_FACILITY_TAX_PCT}
        step="0.01"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder="Facility tax % — empty = 0.25% assumed"
        aria-label={`Facility tax percent for ${name}`}
        className="w-full"
      />
      <button
        type="button"
        onClick={() => {
          const tax = parseFacilityTaxDraft(draft);
          if (!tax.ok) {
            onError(`Facility tax must be 0–${MAX_FACILITY_TAX_PCT}% (or empty).`);
            return;
          }
          onSet(tax.value);
        }}
        disabled={busy}
        className="text-label uppercase tracking-[0.12em] text-tone-green hover:underline disabled:text-muted disabled:no-underline"
      >
        Set
      </button>
    </div>
  );
}

function SavedStructureRow({
  row,
  view,
  busy,
  parse,
  suggest,
  showPinPicker,
  showTaxEditor,
  rowTaxDraft,
  onRowTaxDraftChange,
  onTogglePin,
  onToggleTax,
  onSetPin,
  onSetTax,
  onDelete,
  onError,
}: {
  row: CustomStructureRow;
  view: SavedStructureRowView;
  busy: boolean;
  parse: SystemParse;
  suggest: SystemSuggest;
  showPinPicker: boolean;
  showTaxEditor: boolean;
  rowTaxDraft: string;
  onRowTaxDraftChange: (value: string) => void;
  onTogglePin: () => void;
  onToggleTax: () => void;
  onSetPin: (systemId: number | null) => void;
  onSetTax: (taxPct: number | null) => void;
  onDelete: () => void;
  onError: (message: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 border border-border bg-section px-3 py-2">
      <span className="font-mono text-ui text-text">{view.name}</span>
      <Pill tone="neutral">{view.typeLabel}</Pill>
      <StructureMetaPills view={view} />
      <span className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleTax}
          disabled={busy}
          className="text-label uppercase tracking-[0.12em] text-muted hover:text-text disabled:text-muted"
        >
          Tax…
        </button>
        {view.isPinned ? (
          <button
            type="button"
            onClick={() => onSetPin(null)}
            disabled={busy}
            className="text-label uppercase tracking-[0.12em] text-muted hover:text-text disabled:text-muted"
          >
            Unpin
          </button>
        ) : (
          <button
            type="button"
            onClick={onTogglePin}
            disabled={busy}
            className="text-label uppercase tracking-[0.12em] text-muted hover:text-text disabled:text-muted"
          >
            Pin…
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="text-label uppercase tracking-[0.12em] text-muted hover:text-tone-red disabled:text-muted"
        >
          Delete
        </button>
      </span>
      {showPinPicker && (
        <div className="w-full max-w-[320px]">
          <TerminalSearch<SystemParams, SystemErr>
            initialValue=""
            placeholder="Pin to system — type a name"
            parse={parse}
            suggest={suggest}
            errorMessage={() => 'No system matches that name.'}
            onSubmit={({ system }) => onSetPin(system.id)}
            onClear={onTogglePin}
            errorLabel="System"
          />
        </div>
      )}
      {showTaxEditor && (
        <InlineTaxEditor
          name={row.name}
          draft={rowTaxDraft}
          onDraftChange={onRowTaxDraftChange}
          busy={busy}
          onSet={onSetTax}
          onError={onError}
        />
      )}
    </li>
  );
}

function StructureTypeSelect({
  value,
  types,
  onChange,
}: {
  value: number | null;
  types: StructureTypeOption[];
  onChange: (id: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label uppercase tracking-[0.12em] text-muted">Structure type</span>
      <Select
        value={value == null ? '' : String(value)}
        onValueChange={(v) => onChange(v === '' ? null : Number(v))}
        items={[
          { value: '', label: '— pick a structure —' },
          ...types.map((t) => ({
            value: String(t.typeId),
            label: `${t.name} (${STRUCTURE_GROUP_LABEL[t.groupId] ?? 'Structure'})`,
          })),
        ]}
        ariaLabel="Structure type"
        className="w-full max-w-[320px]"
      />
    </label>
  );
}

function SavedStructuresList({
  structures,
  view,
  busy,
  parse,
  suggest,
  pinningId,
  taxingId,
  rowTaxDraft,
  onRowTaxDraftChange,
  onTogglePin,
  onToggleTax,
  onSetPin,
  onSetTax,
  onDelete,
  onError,
}: {
  structures: CustomStructureRow[];
  view: (row: CustomStructureRow) => SavedStructureRowView;
  busy: boolean;
  parse: SystemParse;
  suggest: SystemSuggest;
  pinningId: string | null;
  taxingId: string | null;
  rowTaxDraft: string;
  onRowTaxDraftChange: (value: string) => void;
  onTogglePin: (id: string) => void;
  onToggleTax: (id: string, taxPct: number | null) => void;
  onSetPin: (id: string, systemId: number | null) => void;
  onSetTax: (id: string, taxPct: number | null) => void;
  onDelete: (id: string) => void;
  onError: (message: string) => void;
}) {
  if (structures.length === 0) {
    return <EmptyState>No custom structures yet — build one above.</EmptyState>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {structures.map((s) => (
        <SavedStructureRow
          key={s.id}
          row={s}
          view={view(s)}
          busy={busy}
          parse={parse}
          suggest={suggest}
          showPinPicker={pinningId === s.id && s.systemId === null}
          showTaxEditor={taxingId === s.id}
          rowTaxDraft={rowTaxDraft}
          onRowTaxDraftChange={onRowTaxDraftChange}
          onTogglePin={() => onTogglePin(s.id)}
          onToggleTax={() => onToggleTax(s.id, s.taxPct)}
          onSetPin={(systemId) => onSetPin(s.id, systemId)}
          onSetTax={(taxPct) => onSetTax(s.id, taxPct)}
          onDelete={() => onDelete(s.id)}
          onError={onError}
        />
      ))}
    </ul>
  );
}

export function CustomStructureBuilder({
  structureTypes,
  structureRigs,
  initial,
}: {
  structureTypes: StructureTypeOption[];
  structureRigs: StructureRigOption[];
  initial: CustomStructureRow[];
}) {
  const [structures, setStructures] = useState<CustomStructureRow[]>(initial);
  const [structureTypeId, setStructureTypeId] = useState<number | null>(null);
  const [rigSlots, setRigSlots] = useState<(number | null)[]>(() => slotIndices.map(() => null));
  const [name, setName] = useState('');
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The optional system pin for the structure being built (null = portable),
  // and the saved row currently showing an inline pin picker.
  const [pin, setPin] = useState<SystemSearchEntry | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  // The optional facility tax for the structure being built (3.7.13.3, kept as
  // the raw input string until save), and the saved row currently showing the
  // inline tax editor + its draft.
  const [taxDraft, setTaxDraft] = useState('');
  const [taxingId, setTaxingId] = useState<string | null>(null);
  const [rowTaxDraft, setRowTaxDraft] = useState('');
  const { systems, parse, suggest } = useSystemSearch();

  const typeName = useMemo(
    () => new Map(structureTypes.map((t) => [t.typeId, t.name])),
    [structureTypes],
  );
  const rigName = useMemo(() => new Map(structureRigs.map((r) => [r.typeId, r.name])), [structureRigs]);

  const { structure, validRigs, canSave } = deriveBuilderView({
    structureTypeId,
    structureTypes,
    structureRigs,
    name,
    busy,
  });

  function chooseStructure(id: number | null) {
    setStructureTypeId(id);
    // A new structure type may invalidate the fitted rigs — clear them.
    setRigSlots(slotIndices.map(() => null));
    setError(null);
  }

  async function onParse() {
    if (!canReadFit(paste, busy)) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch(parseStructureFitEndpoint, { body: { fit: paste }, cache: 'no-store' });
    setBusy(false);
    if (!res.ok) {
      setError('Could not read that fit.');
      return;
    }
    const parsed = res.data.parsed;
    if (!parsed) {
      setError('No structure found in that text — paste the in-game "Copy to Clipboard" fit.');
      return;
    }
    setStructureTypeId(parsed.structureTypeId);
    setRigSlots(slotsFromParsedFit(parsed.rigTypeIds, slotIndices));
    setName(resolveFitName(name, parsed.structureTypeId, typeName));
  }

  async function onSave() {
    const ready = readyBuildInput(structureTypeId, name, busy);
    if (!ready) return;
    const tax = parseFacilityTaxDraft(taxDraft);
    if (!tax.ok) {
      setError(`Facility tax must be 0–${MAX_FACILITY_TAX_PCT}% (or empty).`);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiFetch(createCustomStructureEndpoint, {
      body: buildCreateStructurePayload({ ...ready, rigSlots, pin, taxValue: tax.value }),
      cache: 'no-store',
    });
    setBusy(false);
    if (!res.ok) {
      setError('Could not save — check the structure and rigs.');
      return;
    }
    setStructures(res.data.structures);
    setName('');
    setPaste('');
    setPin(null);
    setTaxDraft('');
    chooseStructure(null);
  }

  async function onDelete(id: string) {
    if (busy) return;
    setBusy(true);
    const res = await apiFetch(deleteCustomStructureEndpoint, { body: { id }, cache: 'no-store' });
    setBusy(false);
    if (res.ok) setStructures(res.data.structures);
  }

  async function onSetPin(id: string, systemId: number | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch(setCustomStructurePinEndpoint, { body: { id, systemId }, cache: 'no-store' });
    setBusy(false);
    if (!res.ok) {
      // The inline picker stays open for a retry — without this the failed
      // attempt would be indistinguishable from a slow one.
      setError('Could not update the pin — try again.');
      return;
    }
    setStructures(res.data.structures);
    setPinningId(null);
  }

  // Set or clear (null) a saved structure's facility tax — the onSetPin twin.
  async function onSetTax(id: string, taxPct: number | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch(setCustomStructureTaxEndpoint, { body: { id, taxPct }, cache: 'no-store' });
    setBusy(false);
    if (!res.ok) {
      setError('Could not update the tax — try again.');
      return;
    }
    setStructures(res.data.structures);
    setTaxingId(null);
  }

  function togglePinning(id: string) {
    setPinningId(pinningId === id ? null : id);
  }

  function toggleTaxing(id: string, taxPct: number | null) {
    setTaxingId(taxingId === id ? null : id);
    setRowTaxDraft(taxDraftFromStored(taxPct));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {/* Paste an in-game fit to pre-fill, OR pick below. */}
        <label className="flex flex-col gap-1">
          <span className="text-label uppercase tracking-[0.12em] text-muted">
            Paste an in-game structure fit (optional)
          </span>
          <Textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={3}
            placeholder={'[Azbel, My Build Azbel]\nStandup L-Set Equipment Manufacturing Efficiency II\n…'}
            aria-label="Structure fit"
            className="leading-[1.5]"
          />
          <button
            type="button"
            onClick={onParse}
            disabled={!canReadFit(paste, busy)}
            className="self-start text-label uppercase tracking-[0.12em] text-tone-blue hover:underline disabled:text-muted disabled:no-underline"
          >
            Read fit →
          </button>
        </label>

        <StructureTypeSelect value={structureTypeId} types={structureTypes} onChange={chooseStructure} />

        {structure && (
          <RigSupply
            validRigs={validRigs}
            maxSlots={MAX_CUSTOM_STRUCTURE_RIGS}
            slots={rigSlots}
            onSlotsChange={setRigSlots}
            disabled={busy}
          />
        )}

        <label className="flex flex-col gap-1">
          <span className="text-label uppercase tracking-[0.12em] text-muted">Name</span>
          <Input
            type="text"
            value={name}
            maxLength={MAX_CUSTOM_STRUCTURE_NAME_LEN}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Null ME Azbel"
            aria-label="Structure name"
            className="w-full max-w-[320px]"
          />
        </label>

        {/* The optional system pin: a pinned structure appears only in that
            system's build list and locks the planner to it on select; leaving
            this empty saves a portable structure (shown everywhere). */}
        <div className="flex flex-col gap-1">
          <span className="text-label uppercase tracking-[0.12em] text-muted">Pin to system (optional)</span>
          <PinField
            pin={pin}
            parse={parse}
            suggest={suggest}
            onPick={setPin}
            onClear={() => setPin(null)}
          />
        </div>

        {/* The optional facility tax (3.7.13.3): the owner-set rate this imagined
            structure would charge. Empty = never entered — the planner assumes
            the 0.25% NPC baseline (labeled as assumed in the fee breakdown). */}
        <label className="flex flex-col gap-1">
          <span className="text-label uppercase tracking-[0.12em] text-muted">
            Facility tax % (optional)
          </span>
          <Input
            type="number"
            min={0}
            max={MAX_FACILITY_TAX_PCT}
            step="0.01"
            value={taxDraft}
            onChange={(e) => setTaxDraft(e.target.value)}
            placeholder="Empty = 0.25% assumed"
            aria-label="Facility tax percent"
            className="w-full max-w-[320px]"
          />
        </label>

        {error && <p className="text-ui text-tone-red">{error}</p>}

        <Button variant="primary" onClick={onSave} disabled={!canSave} className="self-start">
          Save structure
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-border-soft pt-4">
        <span className="text-label uppercase tracking-[0.12em] text-muted">
          Your structures ({structures.length})
        </span>
        <SavedStructuresList
          structures={structures}
          view={(s) => deriveSavedRowView(s, { typeName, rigName, systems })}
          busy={busy}
          parse={parse}
          suggest={suggest}
          pinningId={pinningId}
          taxingId={taxingId}
          rowTaxDraft={rowTaxDraft}
          onRowTaxDraftChange={setRowTaxDraft}
          onTogglePin={togglePinning}
          onToggleTax={toggleTaxing}
          onSetPin={onSetPin}
          onSetTax={onSetTax}
          onDelete={onDelete}
          onError={setError}
        />
      </div>
    </div>
  );
}
