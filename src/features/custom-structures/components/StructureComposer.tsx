'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { PercentInput } from '@/components/PercentInput';
import { RigSupply } from '@/components/RigSupply';
import { StructureHullTile } from '@/components/StructureHullTile';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { cardSurface, insetSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { CloseIcon } from '@/components/ui/icons';
import { Textarea } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { Select, type SelectItems } from '@/components/ui/select';
import { eyebrow } from '@/components/ui/type-roles';
import { useSystemSearch } from '@/components/use-system-search';
import {
  SDE_CITADEL_GROUP_ID,
  SDE_ENGINEERING_COMPLEX_GROUP_ID,
  SDE_REFINERY_GROUP_ID,
} from '@/data/eve-data/constants';
import { securityStatusTextClass } from '@/data/eve-data/security';
import { rigFitsStructure, type StructureRigOption, type StructureTypeOption } from '@/data/eve-data/structures';
import { formatSec, type SystemSearchEntry } from '@/data/eve-data/systems-search';
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

const actionLink =
  'whitespace-nowrap font-ui text-micro font-normal uppercase tracking-eyebrow text-isk transition-colors hover:text-name disabled:text-muted';
const label = eyebrow({ size: 'micro' });

const HULL_GROUPS: [number, string][] = [
  [SDE_ENGINEERING_COMPLEX_GROUP_ID, 'Engineering complex'],
  [SDE_REFINERY_GROUP_ID, 'Refinery'],
  [SDE_CITADEL_GROUP_ID, 'Citadel'],
];

const FIELD_ERROR: Record<'name' | 'hull' | 'tax' | 'bonus' | 'save' | 'fit', string> = {
  name: 'Name the structure.',
  hull: 'Pick the hull.',
  tax: 'Tax must be 0–10%.',
  bonus: 'Bonuses must be 0–99%.',
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

function LabeledField({ htmlFor, text, children, className }: { htmlFor?: string; text: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className={label}>{text}</label>
      {children}
    </div>
  );
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
  const id = useId();
  const [typed, setTyped] = useState('');
  const picked = useRef<string | null>(null);
  const hits = useStructureSearch(typed);
  const options: PickOption<StructureSearchResult>[] = hits.map((hit) => {
    const hull = types.find((t) => t.typeId === hit.structureTypeId)?.name;
    const system = systems.find((s) => s.id === hit.systemId);
    return {
      key: String(hit.structureId),
      value: hit.name,
      label: hit.name,
      meta: [hull, system ? `${system.name} ${formatSec(system.security)}` : null].filter(Boolean).join(' · '),
      item: hit,
    };
  });
  return (
    <LabeledField htmlFor={id} text="Structure">
      <PickField
        id={id}
        value={draft.name}
        onValueChange={(name) => {
          onName(name);
          setTyped(name === picked.current ? '' : name);
        }}
        options={options}
        onPick={(hit) => {
          picked.current = hit.name;
          setTyped('');
          onPick(hit);
        }}
      />
    </LabeledField>
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

function BonusSection({
  draft,
  structure,
  rigs,
  busy,
  onDraft,
  onReadFit,
}: {
  draft: StructureDraft;
  structure: StructureTypeOption | null;
  rigs: StructureRigOption[];
  busy: boolean;
  onDraft: (next: Partial<StructureDraft>) => void;
  onReadFit: (fit: string) => void;
}) {
  const [fitOpen, setFitOpen] = useState(false);
  const rigMode = draft.mode === 'rigs';
  const validRigs = structure ? rigs.filter((r) => rigFitsStructure(r, structure)) : [];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className={label}>{rigMode ? 'Rigs' : 'Bonuses'}</span>
        <span className="flex gap-4">
          {!rigMode && (
            <Button variant="bare" className={actionLink} onClick={() => setFitOpen(!fitOpen)}>
              {fitOpen ? 'Close fit' : 'Paste fit'}
            </Button>
          )}
          {rigMode && (
            <Button variant="bare" className={actionLink} onClick={() => onDraft({ mode: 'values' })}>
              Enter values
            </Button>
          )}
        </span>
      </div>
      {!rigMode && fitOpen && <FitPaste busy={busy} onRead={onReadFit} />}
      {rigMode ? (
        <RigSupply
          validRigs={validRigs}
          maxSlots={MAX_CUSTOM_STRUCTURE_RIGS}
          slots={draft.rigSlots}
          onSlotsChange={(rigSlots) => onDraft({ rigSlots })}
          disabled={busy}
        />
      ) : (
        <BonusGrid
          bonus={draft.bonus}
          reactions={structure?.groupId === SDE_REFINERY_GROUP_ID}
          onChange={(field, value) => onDraft({ bonus: { ...draft.bonus, [field]: value } })}
        />
      )}
    </div>
  );
}

type Mutation = { ok: true; data: { structures: CustomStructureRow[] } } | { ok: false };

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
  onSaved: (structures: CustomStructureRow[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<StructureDraft>(() => (editing ? draftFromRow(editing) : emptyStructureDraft()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ComposerError | null>(null);
  const sys = useSystemField(draft.systemId);
  const structure = structureTypes.find((t) => t.typeId === draft.structureTypeId) ?? null;
  const update = (next: Partial<StructureDraft>) => {
    setDraft((d) => ({ ...d, ...next }));
    setError(null);
  };

  function pickStructure(hit: StructureSearchResult) {
    const known = structureTypes.some((t) => t.typeId === hit.structureTypeId);
    update({
      name: hit.name,
      systemId: hit.systemId,
      ...(known ? { structureTypeId: hit.structureTypeId } : {}),
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
    onSaved(res.data.structures);
  }

  async function readFit(fit: string) {
    setBusy(true);
    const res = await apiFetch(parseStructureFitEndpoint, { body: { fit }, cache: 'no-store' });
    setBusy(false);
    const parsed = res.ok ? res.data.parsed : null;
    if (!parsed) return setError('fit');
    update(draftFromFit(draft, parsed, structureTypes));
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
        <StructureHullTile hullName={structure?.name ?? null} groupId={structure?.groupId ?? null} />
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
          <LabeledField text="Hull">
            <Select
              value={draft.structureTypeId === null ? '' : String(draft.structureTypeId)}
              onValueChange={(v) => update({ structureTypeId: v === '' ? null : Number(v), rigSlots: slotsFromRigs([]) })}
              items={hullItems(structureTypes)}
              ariaLabel="Hull"
            />
          </LabeledField>
        </div>
        <BonusSection
          draft={draft}
          structure={structure}
          rigs={structureRigs}
          busy={busy}
          onDraft={update}
          onReadFit={(fit) => void readFit(fit)}
        />
        <LabeledField text="Facility tax" className="w-40">
          <PercentInput value={draft.taxDraft} onChange={(taxDraft) => update({ taxDraft })} ariaLabel="Facility tax" />
        </LabeledField>
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
  const id = useId();
  const options: PickOption<SystemSearchEntry>[] = sys.suggestions.map((s) => ({
    key: String(s.id),
    value: s.name,
    label: s.name,
    meta: <span className={securityStatusTextClass(s.security)}>{formatSec(s.security)}</span>,
    item: s,
  }));
  return (
    <LabeledField htmlFor={id} text="System">
      <PickField
        id={id}
        value={sys.shown}
        onValueChange={onType}
        options={options}
        onPick={onPick}
        trailing={sys.system ? <SecPill security={sys.system.security} /> : undefined}
      />
    </LabeledField>
  );
}
