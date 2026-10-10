'use client';

import { useState } from 'react';
import { PercentInput } from '@/components/PercentInput';
import { RigSupply } from '@/components/RigSupply';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { insetSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Field } from '@/components/ui/field';
import { eyebrow } from '@/components/ui/type-roles';
import type { StructureRigOption } from '@/data/eve-data/structures';
import { MAX_FACILITY_TAX_PCT, parseFacilityTaxDraft, taxDraftFromStored } from '@/data/industry-math/fees';
import { apiFetch } from '@/transport/api-client';
import { MAX_CORP_STRUCTURE_RIGS, setCorpStructureRigsEndpoint } from '../api-contract';
import type { CorpStructurePageStructure } from '../types';

const slotsFrom = (rigTypeIds: number[]): (number | null)[] =>
  Array.from({ length: MAX_CORP_STRUCTURE_RIGS }, (_, i) => rigTypeIds[i] ?? null);

/** Rigs and tax for a synced corporation structure; ESI gives neither, a manager sets them. */
export function CorpRigEditor({
  corporationId,
  structure,
  validRigs,
  onSaved,
  onClose,
}: {
  corporationId: number;
  structure: CorpStructurePageStructure;
  validRigs: StructureRigOption[];
  onSaved: (saved: { rigTypeIds: number[]; taxPct: number | null }) => void;
  onClose: () => void;
}) {
  const [slots, setSlots] = useState(() => slotsFrom(structure.rigTypeIds));
  const [taxDraft, setTaxDraft] = useState(() => taxDraftFromStored(structure.taxPct));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const tax = parseFacilityTaxDraft(taxDraft);
    if (!tax.ok) return setError(`Tax must be 0–${MAX_FACILITY_TAX_PCT}%.`);
    setBusy(true);
    const rigTypeIds = slots.filter((x): x is number => x !== null);
    const res = await apiFetch(setCorpStructureRigsEndpoint, {
      body: { corporationId, structureId: structure.structureId, rigTypeIds, taxPct: tax.value },
      cache: 'no-store',
    });
    setBusy(false);
    if (!res.ok) return setError('Could not save. Try again.');
    onSaved({ rigTypeIds: res.data.rigTypeIds, taxPct: res.data.taxPct });
  }

  return (
    <div className={cn(insetSurface, 'flex flex-col gap-3 px-3 py-3')}>
      <span className={eyebrow({ size: 'micro' })}>Rigs</span>
      <RigSupply
        validRigs={validRigs}
        maxSlots={MAX_CORP_STRUCTURE_RIGS}
        slots={slots}
        onSlotsChange={setSlots}
        disabled={busy}
      />
      {error && <Callout label="Check">{error}</Callout>}
      <div className="flex items-end justify-end gap-2.5">
        <Field label="Facility tax" labelStyle="eyebrow" className="mr-auto w-40">
          <PercentInput value={taxDraft} onChange={setTaxDraft} disabled={busy} />
        </Field>
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}
