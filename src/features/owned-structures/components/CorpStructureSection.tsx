'use client';

import { useId, useState } from 'react';
import { RigSupply } from '@/components/RigSupply';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { rigFitsStructure, type StructureRigOption, type StructureTypeOption } from '@/data/eve-data/structures';
import { MAX_FACILITY_TAX_PCT, parseFacilityTaxDraft } from '@/data/industry-math/fees';
import { apiFetch } from '@/lib/api-client';
import {
  MAX_CORP_STRUCTURE_RIGS,
  setCorpStructureRigsEndpoint,
  setCorpStructureSharingEndpoint,
} from '../api-contract';
import type { CorpStructurePageStructure, CorpStructurePageView } from '../types';

// The corp-structures section of the /structures page. For each member corp: a
// Station_Manager sees the sharing toggle (default off; enabling pulls the corp's
// structures, disabling wipes them) and, per shared structure, a rig-completion editor
// (ESI doesn't expose fitted rigs). A non-Station_Manager member sees the shared
// structures read-only; a corp that isn't shared and where the viewer isn't a manager
// shows nothing. The island takes server-resolved data in and fires mutations out — the
// gate/wipe live in the data layer, so it relocates into a future settings menu unchanged.
export function CorpStructureSection({
  corps,
  structureTypes,
  structureRigs,
}: {
  corps: CorpStructurePageView[];
  structureTypes: StructureTypeOption[];
  structureRigs: StructureRigOption[];
}) {
  // A non-manager of an un-shared corp has nothing to show.
  const visible = corps.filter((c) => c.isStationManager || c.sharingEnabled);
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((corp) => (
        <div key={corp.corporationId} className="mt-4 w-full max-w-[760px]">
          <CorpCard corp={corp} structureTypes={structureTypes} structureRigs={structureRigs} />
        </div>
      ))}
    </>
  );
}

function CorpCard({
  corp,
  structureTypes,
  structureRigs,
}: {
  corp: CorpStructurePageView;
  structureTypes: StructureTypeOption[];
  structureRigs: StructureRigOption[];
}) {
  const [enabled, setEnabled] = useState(corp.sharingEnabled);
  const [structures, setStructures] = useState(corp.structures);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmLabelId = useId();

  async function applySharing(next: boolean) {
    setBusy(true);
    const res = await apiFetch(setCorpStructureSharingEndpoint, {
      body: { corporationId: corp.corporationId, enabled: next },
      cache: 'no-store',
    });
    setBusy(false);
    if (!res.ok) {
      toast.error('Could not change sharing');
      return;
    }
    setEnabled(next);
    if (next) {
      toast.success('Sharing on — structures appear after the next refresh');
    } else {
      setStructures([]); // disable wipes the catalogue
      toast.success('Sharing off — this corp’s structures were removed');
    }
  }

  // Enabling is one click; disabling wipes the catalogue, so it confirms first.
  function onToggle(next: boolean) {
    if (next) void applySharing(true);
    else setConfirmOpen(true);
  }

  return (
    <Card>
      <SectionHeader
        size="md"
        label={corp.corporationName}
        hint={corp.isStationManager ? (enabled ? 'sharing on' : 'sharing off') : 'shared'}
      />
      <div className="flex flex-col gap-4 px-3.5 py-3.5">
        {corp.isStationManager && (
          <label className="flex items-center gap-2.5">
            <Switch
              checked={enabled}
              onCheckedChange={onToggle}
              disabled={busy}
              label={`Share ${corp.corporationName}'s structures`}
            />
            <span className="text-[11px] text-text">Share this corporation’s structures as build locations</span>
          </label>
        )}

        {enabled ? (
          structures.length === 0 ? (
            <EmptyState>No structures synced yet — they appear here after the next refresh.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {structures.map((s) => (
                <CorpStructureItem
                  key={s.structureId}
                  corporationId={corp.corporationId}
                  structure={s}
                  canEdit={corp.isStationManager}
                  structureTypes={structureTypes}
                  structureRigs={structureRigs}
                />
              ))}
            </ul>
          )
        ) : (
          corp.isStationManager && (
            <p className="text-[11px] text-muted">
              Turn sharing on to make this corporation’s structures selectable as build locations for every member.
            </p>
          )
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen} labelledBy={confirmLabelId}>
        <div className="flex flex-col gap-3 p-4 max-w-[360px]">
          <p id={confirmLabelId} className="text-[12px] text-text">
            Stop sharing {corp.corporationName}’s structures? This removes the corporation’s structures and any
            recorded rig fits and facility taxes. Turning sharing back on re-fetches them.
          </p>
          <div className="flex items-center justify-end gap-3">
            <DialogClose className="text-[10px] uppercase tracking-[0.12em] text-muted hover:text-text">
              Keep sharing
            </DialogClose>
            <DialogClose
              onClick={() => void applySharing(false)}
              className="text-[10px] uppercase tracking-[0.12em] text-tone-red hover:underline"
            >
              Stop sharing
            </DialogClose>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

function CorpStructureItem({
  corporationId,
  structure,
  canEdit,
  structureTypes,
  structureRigs,
}: {
  corporationId: number;
  structure: CorpStructurePageStructure;
  canEdit: boolean;
  structureTypes: StructureTypeOption[];
  structureRigs: StructureRigOption[];
}) {
  const typeOption = structureTypes.find((t) => t.typeId === structure.typeId) ?? null;
  const typeName = typeOption?.name ?? `Type ${structure.typeId}`;
  const validRigs = typeOption ? structureRigs.filter((r) => rigFitsStructure(r, typeOption)) : [];
  const rigName = new Map(structureRigs.map((r) => [r.typeId, r.name]));

  return (
    <li className="flex flex-col gap-2 border border-border bg-section px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-text">{structure.name ?? typeName}</span>
        <Pill tone="neutral">{typeName}</Pill>
      </div>
      {canEdit ? (
        <CorpStructureRigEditor corporationId={corporationId} structure={structure} validRigs={validRigs} />
      ) : structure.rigTypeIds.length > 0 || structure.taxPct !== null ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {structure.rigTypeIds.map((r) => (
            <Pill key={r} tone="blue">
              {rigName.get(r) ?? `Rig ${r}`}
            </Pill>
          ))}
          {structure.taxPct !== null && <Pill tone="neutral">tax {structure.taxPct}%</Pill>}
        </div>
      ) : (
        <span className="text-[10px] text-muted">no rigs recorded</span>
      )}
    </li>
  );
}

const slotsFrom = (rigTypeIds: number[]): (number | null)[] =>
  Array.from({ length: MAX_CORP_STRUCTURE_RIGS }, (_, i) => rigTypeIds[i] ?? null);

function CorpStructureRigEditor({
  corporationId,
  structure,
  validRigs,
}: {
  corporationId: number;
  structure: CorpStructurePageStructure;
  validRigs: StructureRigOption[];
}) {
  const [slots, setSlots] = useState<(number | null)[]>(() => slotsFrom(structure.rigTypeIds));
  // The owner-set facility tax (3.7.13.3), edited beside the rigs — kept as the
  // raw input string until save. Empty = never entered: the planner then assumes
  // the 0.25% NPC baseline (labeled as assumed in the fee breakdown).
  const [taxDraft, setTaxDraft] = useState(structure.taxPct === null ? '' : String(structure.taxPct));
  const [busy, setBusy] = useState(false);

  async function onSave() {
    if (busy) return;
    const tax = parseFacilityTaxDraft(taxDraft);
    if (!tax.ok) {
      toast.error(`Facility tax must be 0–${MAX_FACILITY_TAX_PCT}% (or empty)`);
      return;
    }
    setBusy(true);
    const res = await apiFetch(setCorpStructureRigsEndpoint, {
      body: {
        corporationId,
        structureId: structure.structureId,
        rigTypeIds: slots.filter((x): x is number => x !== null),
        // Explicit, never omitted: this editor always shows the full completion,
        // so an empty field is a deliberate clear (the tri-state's undefined is
        // for rig-only callers that must not clobber a stored tax).
        taxPct: tax.value,
      },
      cache: 'no-store',
    });
    setBusy(false);
    if (res.ok) toast.success('Structure details saved');
    else toast.error('Could not save the structure details');
  }

  return (
    <div className="flex flex-col gap-2">
      <RigSupply
        validRigs={validRigs}
        maxSlots={MAX_CORP_STRUCTURE_RIGS}
        slots={slots}
        onSlotsChange={setSlots}
        disabled={busy}
      />
      <label className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted">Facility tax %</span>
        <input
          type="number"
          min={0}
          max={MAX_FACILITY_TAX_PCT}
          step="0.01"
          value={taxDraft}
          onChange={(e) => setTaxDraft(e.target.value)}
          placeholder="Empty = 0.25% assumed"
          aria-label={`Facility tax percent for ${structure.name ?? `structure ${structure.structureId}`}`}
          disabled={busy}
          className="w-[180px] border border-border bg-bg px-2 py-1 font-mono text-[12px] text-text focus:border-border-active focus:outline-none"
        />
      </label>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="self-start border border-tone-green px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-tone-green hover:bg-section disabled:border-border disabled:text-muted"
      >
        Save details
      </button>
    </div>
  );
}
