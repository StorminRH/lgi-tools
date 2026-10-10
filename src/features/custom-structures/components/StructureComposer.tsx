'use client';

import { useEffect, useMemo, useState } from 'react';
import { PercentInput } from '@/components/PercentInput';
import { RigSupply } from '@/components/RigSupply';
import { StructureHullTile } from '@/components/StructureHullTile';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { cardSurface, insetSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Field } from '@/components/ui/field';
import { CloseIcon } from '@/components/ui/icons';
import { Textarea } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { Select, type SelectItems } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { useSystemSearch } from '@/components/use-system-search';
import {
  SDE_CITADEL_GROUP_ID,
  SDE_ENGINEERING_COMPLEX_GROUP_ID,
  SDE_REFINERY_GROUP_ID,
} from '@/data/eve-data/constants';
import { securityStatusTextClass } from '@/data/eve-data/security';
import { rigFitsStructure, type StructureRigOption, type StructureTypeOption } from '@/data/eve-data/structures';
import { formatSec, type SystemSearchEntry } from '@/data/eve-data/systems-search';
import { MAX_ENTERED_BONUS_PCT } from '@/data/industry-math/entered-bonuses';
import { MAX_FACILITY_TAX_PCT } from '@/data/industry-math/fees';
import { apiFetch } from '@/transport/api-client';
import {
  createCustomStructureEndpoint,
  deleteCustomStructureEndpoint,
  parseStructureFitEndpoint,
  updateCustomStructureEndpoint,
  MAX_CUSTOM_STRUCTURE_NAME_LEN,
  MAX_CUSTOM_STRUCTURE_RIGS,
  type StructureSearchResult,
} from '../api-contract';
import {
  draftFromFit,
  draftFromRow,
  emptyStructureDraft,
  payloadFromDraft,
  slotsFromRigs,
  type BonusDraft,
  type BonusField,
  type StructureDraft,
} from '../structure-draft';
import type { CustomStructureRow } from '../types';
import { useStructureSearch } from '../use-structure-search';
import { PickField, type PickOption } from './PickField';

const HULL_GROUPS: [number, string][] = [
  [SDE_ENGINEERING_COMPLEX_GROUP_ID, 'Engineering complex'],
  [SDE_REFINERY_GROUP_ID, 'Refinery'],
  [SDE_CITADEL_GROUP_ID, 'Citadel'],
];

const FIELD_ERROR: Record<'name' | 'hull' | 'tax' | 'bonus' | 'save' | 'fit', string> = {
  name: 'Name the structure.',
  hull: 'Pick the hull.',
  tax: `Tax must be 0–${MAX_FACILITY_TAX_PCT}%.`,
  bonus: `Bonuses must be 0–${MAX_ENTERED_BONUS_PCT}%.`,
  save: 'Could not save. Try again.',
  fit: 'No structure in that fit.',
};
type ComposerError = keyof typeof FIELD_ERROR;

function hullItems(types: StructureTypeOption[]): SelectItems {
  return [
    { value: '', label: '—' },
    ...HULL_GROUPS.map(([groupId, group]) => ({
      group,
      options: types
        .filter((t) => t.groupId === groupId)
        .map((t) => ({ value: String(t.typeId), label: t.name })),
    })),
  ];
}

function SecPill({ security }: { security: number | null }) {
  return <Pill tone={security !== null && security >= 0.45 ? 'green' : security !== null && security > 0 ? 'orange' : 'red'}>{formatSec(security)}</Pill>;
}

function useSystemField(systemId: number | null) {
  const { systems, suggest } = useSystemSearch();
  const system = useMemo(() => systems.find((s) => s.id === systemId) ?? null, [systems, systemId]);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SystemSearchEntry[]>([]);
  const shown = query || system?.name || '';
  useEffect(() => {
    if (query.trim() === '' || query === system?.name) return;
    let alive = true;
    void suggest(query).then((names) => {
      if (alive) setSuggestions(names.flatMap((n) => systems.find((s) => s.name === n) ?? []));
    });
    return () => {
      alive = false;
    };
  }, [query, system, suggest, systems]);
  const exact = (text: string) => systems.find((s) => s.name.toLowerCase() === text.trim().toLowerCase()) ?? null;
  return { systems, system, shown, suggestions: query === system?.name ? [] : suggestions, setQuery, exact };
}

function NameField({
  draft,
  types,
  systems,
  onName,
  onPick,
}: {
  draft: StructureDraft;
  types: StructureTypeOption[];
  systems: SystemSearchEntry[];
  onName: (name: string) => void;
  onPick: (hit: StructureSearchResult) => void;
}) {
  const [typed, setTyped] = useState('');
  const hits = useStructureSearch(typed);
  const options: PickOption<StructureSearchResult>[] = hits.map((hit) => {
    const hull = types.find((t) => t.typeId === hit.structureTypeId)?.name;
    const system = systems.find((s) => s.id === hit.systemId);
    return {
      key: String(hit.structureId),
      label: hit.name,
      meta: [hull, system ? `${system.name} ${formatSec(system.security)}` : null].filter(Boolean).join(' · '),
      item: hit,
    };
  });
  return (
    <Field label="Structure" labelStyle="eyebrow">
      <PickField
        value={draft.name}
        onValueChange={(name) => {
          onName(name);
          setTyped(name);
        }}
        options={options}
        onPick={(hit) => {
          setTyped('');
          onPick(hit);
        }}
      />
    </Field>
  );
}

/** On a phone the row label takes its own line over the three inputs. */
const rowLabel = 'col-span-3 font-ui text-ui text-name max-sm:pt-1 sm:col-span-1';

function BonusGrid({ bonus, reactions, onChange }: { bonus: BonusDraft; reactions: boolean; onChange: (field: BonusField, value: string) => void }) {
  const cell = (field: BonusField, aria: string) => (
    <PercentInput value={bonus[field]} onChange={(v) => onChange(field, v)} ariaLabel={aria} />
  );
  return (
    <div
      className={cn(
        insetSurface,
        'grid grid-cols-3 items-center gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_5.5rem]',
      )}
    >
      <span className="max-sm:hidden" />
      {['Material', 'Time', 'Job cost'].map((h) => (
        <span key={h} className="text-center font-ui text-micro text-muted">{h}</span>
      ))}
      <span className={rowLabel}>Manufacturing</span>
      {cell('me', 'Manufacturing material bonus')}
      {cell('te', 'Manufacturing time bonus')}
      {cell('cost', 'Manufacturing job cost bonus')}
      {reactions ? (
        <>
          <span className={rowLabel}>Reactions</span>
          {cell('rxnMe', 'Reaction material bonus')}
          {cell('rxnTe', 'Reaction time bonus')}
          <span />
        </>
      ) : null}
    </div>
  );
}

function FitPaste({ busy, onRead }: { busy: boolean; onRead: (fit: string) => void }) {
  const [fit, setFit] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        rows={4}
        value={fit}
        onChange={(e) => setFit(e.target.value)}
        aria-label="Structure fit"
        className="leading-[1.5]"
      />
      <Button size="sm" className="self-end" disabled={busy || fit.trim() === ''} onClick={() => onRead(fit)}>
        Read fit
      </Button>
    </div>
  );
}

/** How the bonuses are given: typed from the industry window, picked as rigs, or read from a pasted fit. */
type BonusTab = 'values' | 'rigs' | 'fit';

function BonusSection({
  draft,
  structure,
  rigs,
  busy,
  pasting,
  onPastingChange,
  onDraft,
  onReadFit,
}: {
  draft: StructureDraft;
  structure: StructureTypeOption | null;
  rigs: StructureRigOption[];
  busy: boolean;
  /** The fit tab is open; a fit read switches to rigs. */
  pasting: boolean;
  onPastingChange: (pasting: boolean) => void;
  onDraft: (next: Partial<StructureDraft>) => void;
  onReadFit: (fit: string) => void;
}) {
  const validRigs = structure ? rigs.filter((r) => rigFitsStructure(r, structure)) : [];
  const tab: BonusTab = pasting ? 'fit' : draft.mode;
  const choose = (next: string) => {
    onPastingChange(next === 'fit');
    if (next === 'values' || next === 'rigs') onDraft({ mode: next });
  };
  return (
    <Tabs
      label="Structure bonuses"
      value={tab}
      onValueChange={choose}
      panelClassName="p-0 pt-3"
      tabs={[
        {
          value: 'values',
          label: 'Bonuses',
          content: (
            <BonusGrid
              bonus={draft.bonus}
              reactions={structure?.groupId === SDE_REFINERY_GROUP_ID}
              onChange={(field, value) => onDraft({ bonus: { ...draft.bonus, [field]: value } })}
            />
          ),
        },
        {
          value: 'rigs',
          label: 'Rigs',
          content: (
            <RigSupply
              validRigs={validRigs}
              maxSlots={MAX_CUSTOM_STRUCTURE_RIGS}
              slots={draft.rigSlots}
              onSlotsChange={(rigSlots) => onDraft({ rigSlots })}
              disabled={busy}
            />
          ),
        },
        { value: 'fit', label: 'Paste fit', content: <FitPaste busy={busy} onRead={onReadFit} /> },
      ]}
    />
  );
}

type Mutation = { ok: true; data: { structures: CustomStructureRow[]; createdId?: string } } | { ok: false };

export function StructureComposer({
  structureTypes,
  structureRigs,
  editing,
  onSaved,
  onClose,
}: {
  structureTypes: StructureTypeOption[];
  structureRigs: StructureRigOption[];
  editing: CustomStructureRow | null;
  onSaved: (structures: CustomStructureRow[], createdId?: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<StructureDraft>(() => (editing ? draftFromRow(editing) : emptyStructureDraft()));
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [error, setError] = useState<ComposerError | null>(null);
  const sys = useSystemField(draft.systemId);
  const structure = structureTypes.find((t) => t.typeId === draft.structureTypeId) ?? null;
  const update = (next: Partial<StructureDraft>) => {
    setDraft((d) => ({ ...d, ...next }));
    setError(null);
  };

  function pickStructure(hit: StructureSearchResult) {
    // When the search cannot tell the hull, the one already chosen (or read from a fit) stays.
    const known = structureTypes.some((t) => t.typeId === hit.structureTypeId);
    const structureTypeId = hit.structureTypeId === null ? draft.structureTypeId : known ? hit.structureTypeId : null;
    update({
      name: hit.name.slice(0, MAX_CUSTOM_STRUCTURE_NAME_LEN),
      systemId: hit.systemId,
      structureTypeId,
      ...(structureTypeId === draft.structureTypeId ? {} : { rigSlots: slotsFromRigs([]) }),
    });
    sys.setQuery('');
  }

  function typeSystem(text: string) {
    sys.setQuery(text);
    update({ systemId: sys.exact(text)?.id ?? null });
  }

  async function settle(run: () => Promise<Mutation>) {
    setBusy(true);
    const res = await run();
    setBusy(false);
    if (!res.ok) return setError('save');
    onSaved(res.data.structures, res.data.createdId);
  }

  async function readFit(fit: string) {
    setBusy(true);
    const res = await apiFetch(parseStructureFitEndpoint, { body: { fit }, cache: 'no-store' });
    setBusy(false);
    const parsed = res.ok ? res.data.parsed : null;
    if (!parsed) return setError('fit');
    update(draftFromFit(draft, parsed, structureTypes));
    setPasting(false);
  }

  function save() {
    const result = payloadFromDraft(draft);
    if (!result.ok) return setError(result.field);
    const body = result.payload;
    void settle(() =>
      editing
        ? apiFetch(updateCustomStructureEndpoint, { body: { id: editing.id, ...body }, cache: 'no-store' })
        : apiFetch(createCustomStructureEndpoint, { body, cache: 'no-store' }),
    );
  }

  function remove() {
    if (!editing) return;
    void settle(() => apiFetch(deleteCustomStructureEndpoint, { body: { id: editing.id }, cache: 'no-store' }));
  }

  return (
    <section className={cn(cardSurface, 'flex flex-col overflow-hidden')} aria-label={editing ? 'Edit structure' : 'New structure'}>
      <div className="flex items-center gap-3 border-b border-border-soft px-4 py-3">
        <StructureHullTile typeId={structure?.typeId ?? null} hullName={structure?.name ?? null} />
        <h3 className="flex-1 font-display text-h3 font-bold text-name">{editing ? 'Edit structure' : 'New structure'}</h3>
        <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
          <CloseIcon size={14} />
        </Button>
      </div>
      <div className="flex flex-col gap-4 px-4 py-4">
        <NameField
          draft={draft}
          types={structureTypes}
          systems={sys.systems}
          onName={(name) => update({ name: name.slice(0, MAX_CUSTOM_STRUCTURE_NAME_LEN) })}
          onPick={pickStructure}
        />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <SystemField sys={sys} onType={typeSystem} onPick={(s) => { sys.setQuery(''); update({ systemId: s.id }); }} />
          <Field label="Hull" labelStyle="eyebrow">
            <Select
              value={draft.structureTypeId === null ? '' : String(draft.structureTypeId)}
              onValueChange={(v) => update({ structureTypeId: v === '' ? null : Number(v), rigSlots: slotsFromRigs([]) })}
              items={hullItems(structureTypes)}
            />
          </Field>
        </div>
        <BonusSection
          draft={draft}
          structure={structure}
          rigs={structureRigs}
          busy={busy}
          pasting={pasting}
          onPastingChange={setPasting}
          onDraft={update}
          onReadFit={(fit) => void readFit(fit)}
        />
        <Field label="Facility tax" labelStyle="eyebrow" className="w-40">
          <PercentInput value={draft.taxDraft} onChange={(taxDraft) => update({ taxDraft })} />
        </Field>
        {error && <Callout label="Check">{FIELD_ERROR[error]}</Callout>}
      </div>
      <div className="flex items-center justify-end gap-2.5 border-t border-border-soft px-4 py-3">
        {editing && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={remove} className="mr-auto">
            Delete
          </Button>
        )}
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={busy} onClick={save}>
          Save
        </Button>
      </div>
    </section>
  );
}

function SystemField({
  sys,
  onType,
  onPick,
}: {
  sys: ReturnType<typeof useSystemField>;
  onType: (text: string) => void;
  onPick: (system: SystemSearchEntry) => void;
}) {
  const options: PickOption<SystemSearchEntry>[] = sys.suggestions.map((s) => ({
    key: String(s.id),
    label: s.name,
    meta: <span className={securityStatusTextClass(s.security)}>{formatSec(s.security)}</span>,
    item: s,
  }));
  return (
    <Field label="System" labelStyle="eyebrow">
      <PickField
        value={sys.shown}
        onValueChange={onType}
        options={options}
        onPick={onPick}
        trailing={sys.system ? <SecPill security={sys.system.security} /> : undefined}
      />
    </Field>
  );
}
