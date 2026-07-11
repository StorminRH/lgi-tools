'use client';

import Link from 'next/link';
import { useState } from 'react';
import { RigSupply } from '@/components/RigSupply';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { toast } from '@/components/ui/toast';
import { type StructureRigOption, type StructureTypeOption } from '@/data/eve-data/structures';
import {
  MAX_FACILITY_TAX_PCT,
  parseFacilityTaxDraft,
  taxDraftFromStored,
} from '@/data/industry-math/fees';
import { apiFetch } from '@/lib/api-client';
import { MAX_CORP_STRUCTURE_RIGS, setCorpStructureRigsEndpoint } from '../api-contract';
import {
  deriveCorpCardView,
  deriveCorpStructureItemView,
  type CorpStructureItemView,
} from '../corp-structure-view';
import type { CorpStructurePageStructure, CorpStructurePageView } from '../types';

// The corp-structures section of the /structures page. For each member corp: the
// shared structures with, for a Station_Manager, a per-structure rig-completion
// editor (ESI doesn't expose fitted rigs). A non-Station_Manager member sees the
// shared structures read-only; a corp that isn't shared and where the viewer isn't
// a manager shows nothing. The sharing consent toggle itself lives on the account
// settings page (ACCOUNT.6 — its one home); managers get a pointer there.
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
  const view = deriveCorpCardView(corp);
  return (
    <Card>
      <SectionHeader size="md" label={corp.corporationName} hint={view.hint} />
      <div className="flex flex-col gap-4 px-3.5 py-3.5">
        {view.showManagerNote && (
          <p className="text-[11px] text-muted">
            Structure sharing is managed in{' '}
            <Link href="/settings" className="text-name underline hover:text-text">
              Account settings
            </Link>
            {view.managerBlurb}
          </p>
        )}

        {view.showStructures &&
          (view.isEmpty ? (
            <EmptyState>No structures synced yet — they appear here after the next refresh.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {corp.structures.map((s) => (
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
          ))}
      </div>
    </Card>
  );
}

// Read-only rig + tax pills for a member (non-manager) view.
function CorpStructureReadonlyDetails({ view }: { view: CorpStructureItemView }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {view.rigLabels.map((r) => (
        <Pill key={r.key} tone="blue">
          {r.label}
        </Pill>
      ))}
      {view.taxLabel !== null && <Pill tone="neutral">{view.taxLabel}</Pill>}
    </div>
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
  const view = deriveCorpStructureItemView(structure, { structureTypes, structureRigs });

  return (
    <li className="flex flex-col gap-2 border border-border bg-section px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-text">{view.displayName}</span>
        <Pill tone="neutral">{view.typeName}</Pill>
      </div>
      {canEdit ? (
        <CorpStructureRigEditor
          corporationId={corporationId}
          structure={structure}
          validRigs={view.validRigs}
        />
      ) : view.hasDetails ? (
        <CorpStructureReadonlyDetails view={view} />
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
  const [taxDraft, setTaxDraft] = useState(taxDraftFromStored(structure.taxPct));
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
    if (res.ok) {
      // Adopt the echoed stored value so the field reflects the authoritative
      // state (normalizes drafts like "01.50" and can't drift from the save).
      setTaxDraft(taxDraftFromStored(res.data.taxPct));
      toast.success('Structure details saved');
    } else {
      toast.error('Could not save the structure details');
    }
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
