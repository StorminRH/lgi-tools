'use client';

import { useMemo, useState } from 'react';
import { RigSupply } from '@/components/RigSupply';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { useSystemSearch, type SystemErr, type SystemParams } from '@/components/use-system-search';
import {
  SDE_CITADEL_GROUP_ID,
  SDE_ENGINEERING_COMPLEX_GROUP_ID,
  SDE_REFINERY_GROUP_ID,
} from '@/data/eve-data/constants';
import { rigFitsStructure, type StructureRigOption, type StructureTypeOption } from '@/data/eve-data/structures';
import { formatSec, type SystemSearchEntry } from '@/data/eve-data/systems-search';
import { apiFetch } from '@/lib/api-client';
import {
  createCustomStructureEndpoint,
  deleteCustomStructureEndpoint,
  MAX_CUSTOM_STRUCTURE_NAME_LEN,
  MAX_CUSTOM_STRUCTURE_RIGS,
  parseStructureFitEndpoint,
  setCustomStructurePinEndpoint,
} from '../api-contract';
import type { CustomStructureRow } from '../types';

const inputClass =
  'border border-border bg-bg px-2 py-1 font-mono text-[12px] text-text focus:border-border-active focus:outline-none';
const slotIndices = Array.from({ length: MAX_CUSTOM_STRUCTURE_RIGS }, (_, i) => i);

// The structure family label shown beside each type in the picker (the SDE group,
// not a "role" — a Citadel hosts manufacturing rigs but carries no role bonus).
const STRUCTURE_GROUP_LABEL: Record<number, string> = {
  [SDE_ENGINEERING_COMPLEX_GROUP_ID]: 'Engineering Complex',
  [SDE_REFINERY_GROUP_ID]: 'Refinery',
  [SDE_CITADEL_GROUP_ID]: 'Citadel',
};

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
  const { systems, parse, suggest } = useSystemSearch();

  const typeName = useMemo(
    () => new Map(structureTypes.map((t) => [t.typeId, t.name])),
    [structureTypes],
  );
  const rigName = useMemo(() => new Map(structureRigs.map((r) => [r.typeId, r.name])), [structureRigs]);

  const structure = structureTypeId === null ? null : (structureTypes.find((t) => t.typeId === structureTypeId) ?? null);
  // The rigs that fit the chosen structure (its group in the rig's canFitGroups +
  // matching rig size) — the picker options.
  const validRigs = structure ? structureRigs.filter((r) => rigFitsStructure(r, structure)) : [];

  function chooseStructure(id: number | null) {
    setStructureTypeId(id);
    // A new structure type may invalidate the fitted rigs — clear them.
    setRigSlots(slotIndices.map(() => null));
    setError(null);
  }

  async function onParse() {
    if (!paste.trim() || busy) return;
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
    const slots = slotIndices.map((i) => parsed.rigTypeIds[i] ?? null);
    setRigSlots(slots);
    if (!name.trim()) setName(typeName.get(parsed.structureTypeId) ?? '');
  }

  async function onSave() {
    if (structureTypeId === null || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    const rigTypeIds = rigSlots.filter((x): x is number => x !== null);
    const res = await apiFetch(createCustomStructureEndpoint, {
      body: { name: name.trim(), structureTypeId, rigTypeIds, systemId: pin?.id ?? null },
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
    const res = await apiFetch(setCustomStructurePinEndpoint, { body: { id, systemId }, cache: 'no-store' });
    setBusy(false);
    if (res.ok) {
      setStructures(res.data.structures);
      setPinningId(null);
    }
  }

  // The pin's display name resolves from the loaded universe index; the raw id
  // is the fallback while the index is still fetching.
  function pinLabel(systemId: number): string {
    const sys = systems.find((s) => s.id === systemId);
    return sys ? `${sys.name} ${formatSec(sys.security)}` : `System ${systemId}`;
  }

  const canSave = structureTypeId !== null && name.trim().length > 0 && !busy;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {/* Paste an in-game fit to pre-fill, OR pick below. */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
            Paste an in-game structure fit (optional)
          </span>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={3}
            placeholder={'[Azbel, My Build Azbel]\nStandup L-Set Equipment Manufacturing Efficiency II\n…'}
            aria-label="Structure fit"
            className={cn(inputClass, 'resize-y leading-[1.5]')}
          />
          <button
            type="button"
            onClick={onParse}
            disabled={!paste.trim() || busy}
            className="self-start text-[10px] uppercase tracking-[0.12em] text-tone-blue hover:underline disabled:text-muted disabled:no-underline"
          >
            Read fit →
          </button>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted">Structure type</span>
          <select
            value={structureTypeId ?? ''}
            onChange={(e) => chooseStructure(e.target.value === '' ? null : Number(e.target.value))}
            aria-label="Structure type"
            className={cn(inputClass, 'w-full max-w-[320px]')}
          >
            <option value="">— pick a structure —</option>
            {structureTypes.map((t) => (
              <option key={t.typeId} value={t.typeId}>
                {t.name} ({STRUCTURE_GROUP_LABEL[t.groupId] ?? 'Structure'})
              </option>
            ))}
          </select>
        </label>

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
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted">Name</span>
          <input
            type="text"
            value={name}
            maxLength={MAX_CUSTOM_STRUCTURE_NAME_LEN}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Null ME Azbel"
            aria-label="Structure name"
            className={cn(inputClass, 'w-full max-w-[320px]')}
          />
        </label>

        {/* The optional system pin: a pinned structure appears only in that
            system's build list and locks the planner to it on select; leaving
            this empty saves a portable structure (shown everywhere). */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted">Pin to system (optional)</span>
          {pin ? (
            <div className="flex items-center gap-2">
              <Pill tone="blue">
                {pin.name} {formatSec(pin.security)}
              </Pill>
              <button
                type="button"
                onClick={() => setPin(null)}
                className="text-[10px] uppercase tracking-[0.12em] text-muted hover:text-text"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="w-full max-w-[320px]">
              <TerminalSearch<SystemParams, SystemErr>
                initialValue=""
                placeholder="System name — leave empty for portable"
                parse={parse}
                suggest={suggest}
                errorMessage={() => 'No system matches that name.'}
                onSubmit={({ system }) => setPin(system)}
                onClear={() => setPin(null)}
                errorLabel="System"
                hint="Pinned structures show only in that system's build list"
              />
            </div>
          )}
        </div>

        {error && <p className="text-[11px] text-tone-red">{error}</p>}

        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className={cn(
            'self-start border px-3 py-1.5 text-[11px] uppercase tracking-[0.12em]',
            canSave
              ? 'border-tone-green text-tone-green hover:bg-section'
              : 'border-border text-muted',
          )}
        >
          Save structure
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-border-soft pt-4">
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
          Your structures ({structures.length})
        </span>
        {structures.length === 0 ? (
          <EmptyState>No custom structures yet — build one above.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {structures.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 border border-border bg-section px-3 py-2"
              >
                <span className="font-mono text-[12px] text-text">{s.name}</span>
                <Pill tone="neutral">{typeName.get(s.structureTypeId) ?? `Type ${s.structureTypeId}`}</Pill>
                {s.rigTypeIds.map((r) => (
                  <Pill key={r} tone="blue">
                    {rigName.get(r) ?? `Rig ${r}`}
                  </Pill>
                ))}
                {s.rigTypeIds.length === 0 && <span className="text-[10px] text-muted">no rigs</span>}
                {s.systemId !== null && <Pill tone="blue">Pinned · {pinLabel(s.systemId)}</Pill>}
                <span className="ml-auto flex items-center gap-3">
                  {s.systemId !== null ? (
                    <button
                      type="button"
                      onClick={() => onSetPin(s.id, null)}
                      disabled={busy}
                      className="text-[10px] uppercase tracking-[0.12em] text-muted hover:text-text disabled:text-muted"
                    >
                      Unpin
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPinningId(pinningId === s.id ? null : s.id)}
                      disabled={busy}
                      className="text-[10px] uppercase tracking-[0.12em] text-muted hover:text-text disabled:text-muted"
                    >
                      Pin…
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(s.id)}
                    disabled={busy}
                    className="text-[10px] uppercase tracking-[0.12em] text-muted hover:text-tone-red disabled:text-muted"
                  >
                    Delete
                  </button>
                </span>
                {pinningId === s.id && s.systemId === null && (
                  <div className="w-full max-w-[320px]">
                    <TerminalSearch<SystemParams, SystemErr>
                      initialValue=""
                      placeholder="Pin to system — type a name"
                      parse={parse}
                      suggest={suggest}
                      errorMessage={() => 'No system matches that name.'}
                      onSubmit={({ system }) => onSetPin(s.id, system.id)}
                      onClear={() => setPinningId(null)}
                      errorLabel="System"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
