'use client';

import Link from 'next/link';
import { useState } from 'react';
import { RigSupply } from '@/components/RigSupply';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { toast } from '@/components/ui/toast';
import { type StructureRigOption, type StructureTypeOption } from '@/data/eve-data/structures';
import {
  MAX_FACILITY_TAX_PCT,
  parseFacilityTaxDraft,
  taxDraftFromStored,
} from '@/data/industry-math/fees';
import { apiFetch } from '@/transport/api-client';
import { MAX_CORP_STRUCTURE_RIGS, setCorpStructureRigsEndpoint } from '../api-contract';
import {
  deriveCorpCardView,
  deriveCorpStructureItemView,
  type CorpStructureItemView,
} from '../corp-structure-view';
import type { CorpStructurePageStructure, CorpStructurePageView } from '../types';

export function CorpStructureSection({
  corps,
  structureTypes,
  structureRigs,
}: {
  corps: CorpStructurePageView[];
  structureTypes: StructureTypeOption[];
  structureRigs: StructureRigOption[];
}) {
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
          <p className="text-body text-muted">
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
    <Card as="li" className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-data text-ui text-text">{view.displayName}</span>
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
        <span className="text-micro text-muted">no rigs recorded</span>
      )}
    </Card>
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
        taxPct: tax.value,
      },
      cache: 'no-store',
    });
    setBusy(false);
    if (res.ok) {
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
        <span className="text-label uppercase tracking-wide text-muted">Facility tax %</span>
        <Input
          type="number"
          min={0}
          max={MAX_FACILITY_TAX_PCT}
          step="0.01"
          value={taxDraft}
          onChange={(e) => setTaxDraft(e.target.value)}
          placeholder="Empty = 0.25% assumed"
          aria-label={`Facility tax percent for ${structure.name ?? `structure ${structure.structureId}`}`}
          disabled={busy}
          className="w-[180px]"
        />
      </label>
      <Button variant="primary" onClick={onSave} disabled={busy} className="self-start">
        Save details
      </Button>
    </div>
  );
}
