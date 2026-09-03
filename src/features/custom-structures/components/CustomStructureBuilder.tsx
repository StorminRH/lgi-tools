'use client';

import { useMemo, useState } from 'react';
import { RigSupply } from '@/components/RigSupply';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
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
import { apiFetch } from '@/transport/api-client';
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

const STRUCTURE_GROUP_LABEL: Record<number, string> = {
  [SDE_ENGINEERING_COMPLEX_GROUP_ID]: 'Engineering Complex',
  [SDE_REFINERY_GROUP_ID]: 'Refinery',
  [SDE_CITADEL_GROUP_ID]: 'Citadel',
};

type SystemParse = (input: string) => { ok: true; params: SystemParams } | { ok: false; error: SystemErr };
type SystemSuggest = (input: string) => Promise<string[]>;

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
        <Button
          variant="bare"
          type="button"
          onClick={onClear}
          className="text-label uppercase tracking-wide text-muted hover:text-text"
        >
          Clear
        </Button>
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
      <Button
        variant="bare"
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
        className="text-label uppercase tracking-wide text-tone-green hover:underline disabled:text-muted disabled:no-underline"
      >
        Set
      </Button>
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
    <Card as="li" className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="font-data text-ui text-text">{view.name}</span>

      <Pill tone="neutral">{view.typeLabel}</Pill>

      <StructureMetaPills view={view} />
      <span className="ml-auto flex items-center gap-3">
        <Button
          variant="bare"
          type="button"
          onClick={onToggleTax}
          disabled={busy}
          className="text-label uppercase tracking-wide text-muted hover:text-text disabled:text-muted"
        >
          Tax…
        </Button>
        {view.isPinned ? (
          <Button
            variant="bare"
            type="button"
            onClick={() => onSetPin(null)}
            disabled={busy}
            className="text-label uppercase tracking-wide text-muted hover:text-text disabled:text-muted"
          >
            Unpin
          </Button>

        ) : (
          <Button
            variant="bare"
            type="button"
            onClick={onTogglePin}
            disabled={busy}
            className="text-label uppercase tracking-wide text-muted hover:text-text disabled:text-muted"
          >
            Pin…
          </Button>

        )}
        <Button
          variant="bare"
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="text-label uppercase tracking-wide text-muted hover:text-tone-red disabled:text-muted"
        >
          Delete
        </Button>

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
    </Card>

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

    <div className="flex flex-col gap-1">
      <span className="text-label uppercase tracking-wide text-muted">Structure type</span>

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
    </div>

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

function useCustomStructureDraft(
  structureTypes: StructureTypeOption[],
  structureRigs: StructureRigOption[],
  initial: CustomStructureRow[],
) {
  const [structures, setStructures] = useState<CustomStructureRow[]>(initial);
  const [structureTypeId, setStructureTypeId] = useState<number | null>(null);
  const [rigSlots, setRigSlots] = useState<(number | null)[]>(() => slotIndices.map(() => null));
  const [name, setName] = useState('');
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pin, setPin] = useState<SystemSearchEntry | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);

  const [taxDraft, setTaxDraft] = useState('');
  const [taxingId, setTaxingId] = useState<string | null>(null);
  const [rowTaxDraft, setRowTaxDraft] = useState('');
  const { systems, parse, suggest } = useSystemSearch();

  const typeName = useMemo(
    () => new Map(structureTypes.map((t) => [t.typeId, t.name])),
    [structureTypes],
  );
  const rigName = useMemo(() => new Map(structureRigs.map((r) => [r.typeId, r.name])), [structureRigs]);

  return {
    busy,
    error,
    name,
    parse,
    paste,
    pin,
    pinningId,
    rigName,
    rigSlots,
    rowTaxDraft,
    setBusy,
    setError,
    setName,
    setPaste,
    setPin,
    setPinningId,
    setRigSlots,
    setRowTaxDraft,
    setStructures,
    setStructureTypeId,
    setTaxDraft,
    setTaxingId,
    structureTypeId,
    structures,
    suggest,
    systems,
    taxDraft,
    taxingId,
    typeName,
  };
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
  const draft = useCustomStructureDraft(structureTypes, structureRigs, initial);

  const { structure, validRigs, canSave } = deriveBuilderView({
    structureTypeId: draft.structureTypeId,
    structureTypes,
    structureRigs,
    name: draft.name,
    busy: draft.busy,
  });

  function chooseStructure(id: number | null) {
    draft.setStructureTypeId(id);

    draft.setRigSlots(slotIndices.map(() => null));
    draft.setError(null);
  }

  async function onParse() {
    if (!canReadFit(draft.paste, draft.busy)) return;
    draft.setBusy(true);
    draft.setError(null);
    const res = await apiFetch(parseStructureFitEndpoint, {
      body: { fit: draft.paste },
      cache: 'no-store',
    });
    draft.setBusy(false);
    if (!res.ok) {
      draft.setError('Could not read that fit.');
      return;
    }
    const parsed = res.data.parsed;
    if (!parsed) {
      draft.setError('No structure found in that text — paste the in-game "Copy to Clipboard" fit.');
      return;
    }
    draft.setStructureTypeId(parsed.structureTypeId);
    draft.setRigSlots(slotsFromParsedFit(parsed.rigTypeIds, slotIndices));
    draft.setName(resolveFitName(draft.name, parsed.structureTypeId, draft.typeName));
  }

  async function onSave() {
    const ready = readyBuildInput(draft.structureTypeId, draft.name, draft.busy);
    if (!ready) return;
    const tax = parseFacilityTaxDraft(draft.taxDraft);
    if (!tax.ok) {
      draft.setError(`Facility tax must be 0–${MAX_FACILITY_TAX_PCT}% (or empty).`);
      return;
    }
    draft.setBusy(true);
    draft.setError(null);
    const res = await apiFetch(createCustomStructureEndpoint, {
      body: buildCreateStructurePayload({
        ...ready,
        rigSlots: draft.rigSlots,
        pin: draft.pin,
        taxValue: tax.value,
      }),
      cache: 'no-store',
    });
    draft.setBusy(false);
    if (!res.ok) {
      draft.setError('Could not save — check the structure and rigs.');
      return;
    }
    draft.setStructures(res.data.structures);
    draft.setName('');
    draft.setPaste('');
    draft.setPin(null);
    draft.setTaxDraft('');
    chooseStructure(null);
  }

  async function onDelete(id: string) {
    if (draft.busy) return;
    draft.setBusy(true);
    const res = await apiFetch(deleteCustomStructureEndpoint, { body: { id }, cache: 'no-store' });
    draft.setBusy(false);
    if (res.ok) draft.setStructures(res.data.structures);
  }

  async function onSetPin(id: string, systemId: number | null) {
    if (draft.busy) return;
    draft.setBusy(true);
    draft.setError(null);
    const res = await apiFetch(setCustomStructurePinEndpoint, { body: { id, systemId }, cache: 'no-store' });
    draft.setBusy(false);
    if (!res.ok) {

      draft.setError('Could not update the pin — try again.');
      return;
    }
    draft.setStructures(res.data.structures);
    draft.setPinningId(null);
  }

  async function onSetTax(id: string, taxPct: number | null) {
    if (draft.busy) return;
    draft.setBusy(true);
    draft.setError(null);
    const res = await apiFetch(setCustomStructureTaxEndpoint, { body: { id, taxPct }, cache: 'no-store' });
    draft.setBusy(false);
    if (!res.ok) {
      draft.setError('Could not update the tax — try again.');
      return;
    }
    draft.setStructures(res.data.structures);
    draft.setTaxingId(null);
  }

  function togglePinning(id: string) {
    draft.setPinningId(draft.pinningId === id ? null : id);
  }

  function toggleTaxing(id: string, taxPct: number | null) {
    draft.setTaxingId(draft.taxingId === id ? null : id);
    draft.setRowTaxDraft(taxDraftFromStored(taxPct));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Field
          label="Paste an in-game structure fit (optional)"
          hint="Use the in-game Copy to Clipboard format."
        >
          <Textarea
            value={draft.paste}
            onChange={(e) => draft.setPaste(e.target.value)}
            rows={3}
            placeholder={'[Azbel, My Build Azbel]\nStandup L-Set Equipment Manufacturing Efficiency II\n…'}
            aria-label="Structure fit"
            className="leading-[1.5]"
          />
        </Field>

        <div className="flex flex-col gap-1">
          <Button
            variant="bare"
            type="button"
            onClick={onParse}
            disabled={!canReadFit(draft.paste, draft.busy)}
            className="self-start text-label uppercase tracking-wide text-tone-blue hover:underline disabled:text-muted disabled:no-underline"
          >
            Read fit →
          </Button>

        </div>
        <StructureTypeSelect value={draft.structureTypeId} types={structureTypes} onChange={chooseStructure} />

        {structure && (
          <RigSupply
            validRigs={validRigs}
            maxSlots={MAX_CUSTOM_STRUCTURE_RIGS}
            slots={draft.rigSlots}
            onSlotsChange={draft.setRigSlots}
            disabled={draft.busy}
          />
        )}

        <div className="flex flex-col gap-1">
          <span className="text-label uppercase tracking-wide text-muted">Name</span>

          <Input
            type="text"
            value={draft.name}
            maxLength={MAX_CUSTOM_STRUCTURE_NAME_LEN}
            onChange={(e) => draft.setName(e.target.value)}
            placeholder="e.g. Null ME Azbel"
            aria-label="Structure name"
            className="w-full max-w-[320px]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-label uppercase tracking-wide text-muted">Pin to system (optional)</span>

          <PinField
            pin={draft.pin}
            parse={draft.parse}
            suggest={draft.suggest}
            onPick={draft.setPin}
            onClear={() => draft.setPin(null)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-label uppercase tracking-wide text-muted">
            Facility tax % (optional)
          </span>
          <Input
            type="number"
            min={0}
            max={MAX_FACILITY_TAX_PCT}
            step="0.01"
            value={draft.taxDraft}
            onChange={(e) => draft.setTaxDraft(e.target.value)}
            placeholder="Empty = 0.25% assumed"
            aria-label="Facility tax percent"
            className="w-full max-w-[320px]"
          />
        </div>

        {draft.error && <Banner tone="warn">{draft.error}</Banner>}
        <Button variant="primary" onClick={onSave} disabled={!canSave} className="self-start">
          Save structure
        </Button>

      </div>

      <div className="flex flex-col gap-2 border-t border-border-soft pt-4">
        <span className="text-label uppercase tracking-wide text-muted">
          Your structures ({draft.structures.length})
        </span>

        <SavedStructuresList
          structures={draft.structures}
          view={(s) => deriveSavedRowView(s, {
            typeName: draft.typeName,
            rigName: draft.rigName,
            systems: draft.systems,
          })}
          busy={draft.busy}
          parse={draft.parse}
          suggest={draft.suggest}
          pinningId={draft.pinningId}
          taxingId={draft.taxingId}
          rowTaxDraft={draft.rowTaxDraft}
          onRowTaxDraftChange={draft.setRowTaxDraft}
          onTogglePin={togglePinning}
          onToggleTax={toggleTaxing}
          onSetPin={onSetPin}
          onSetTax={onSetTax}
          onDelete={onDelete}
          onError={draft.setError}
        />
      </div>

    </div>

  );
}
