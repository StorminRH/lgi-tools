'use client';

import { cn } from '@/components/ui/cn';
import Link from 'next/link';
import { useState } from 'react';
import { RigSupply } from '@/components/RigSupply';
import { Button } from '@/components/ui/button';
import { Card, insetSurface } from '@/components/ui/card';
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
import { deriveCorpCardView, deriveCorpStructureItemView, managedCorps } from '../corp-structure-view';
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
  const visible = managedCorps(corps);
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((corp) => (
        <div key={corp.corporationId} className="reveal reveal-2 mt-4 w-full max-w-[760px]">
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
      <SectionHeader size="md" label={corp.corporationName} />
      <div className="flex flex-col gap-4 px-3.5 py-3.5">
        <p className="text-body text-muted">
          {view.sharingBlurb} ·{' '}
          <Link href="/settings/corporations" className="text-name underline hover:text-text">
            Corporation settings
          </Link>
          .
        </p>

        {view.isEmpty ? (
          <EmptyState>No structures synced yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {corp.structures.map((s) => (
              <CorpStructureItem
                key={s.structureId}
                corporationId={corp.corporationId}
                structure={s}
                structureTypes={structureTypes}
                structureRigs={structureRigs}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function CorpStructureItem({
  corporationId,
  structure,
  structureTypes,
  structureRigs,
}: {
  corporationId: number;
  structure: CorpStructurePageStructure;
  structureTypes: StructureTypeOption[];
  structureRigs: StructureRigOption[];
}) {
  const view = deriveCorpStructureItemView(structure, { structureTypes, structureRigs });

  return (
    <li className={cn(insetSurface, 'flex flex-col gap-2 px-3 py-2.5 font-ui text-text')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-data text-ui text-text">{view.displayName}</span>
        <Pill tone="neutral">{view.typeName}</Pill>
      </div>
      <CorpStructureRigEditor corporationId={corporationId} structure={structure} validRigs={view.validRigs} />
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
  const [taxDraft, setTaxDraft] = useState(taxDraftFromStored(structure.taxPct));
  const [busy, setBusy] = useState(false);

  async function onSave() {
    if (busy) return;
    const tax = parseFacilityTaxDraft(taxDraft);
    if (!tax.ok) {
      toast.error(`Tax must be 0–${MAX_FACILITY_TAX_PCT}%`);
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
      toast.success('Structure saved');
    } else {
      toast.error('Save failed');
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
      <Button variant="secondary" onClick={onSave} disabled={busy} className="self-start">
        Save details
      </Button>
    </div>
  );
}
