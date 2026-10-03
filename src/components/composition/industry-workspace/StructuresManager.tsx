'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { StructureHullTile } from '@/components/StructureHullTile';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedControl } from '@/components/ui/segmented';
import { eyebrow } from '@/components/ui/type-roles';
import { useSystemSearch } from '@/components/use-system-search';
import { securityStatusTextClass } from '@/data/eve-data/security';
import { rigFitsStructure, type StructureRigOption, type StructureTypeOption } from '@/data/eve-data/structures';
import { formatSec, type SystemSearchEntry } from '@/data/eve-data/systems-search';
import { StructureComposer } from '@/features/custom-structures/components/StructureComposer';
import type { CustomStructureRow } from '@/features/custom-structures/types';
import { StructureBonusColumns } from '@/features/industry-planner/components/structure-bonus-readout';
import { structureBonusesAt, type StructureReadout } from '@/features/industry-planner/structure-factors';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { refreshAvailableStructures, useAvailableStructures } from '@/features/industry-planner/use-available-structures';
import { CorpRigEditor } from '@/features/owned-structures/components/CorpRigEditor';
import type { CorpStructurePageStructure, CorpStructurePageView } from '@/features/owned-structures/types';
import { type NewStructure, settleNewStructure, useNewStructureAsked } from './structures-panel';

type Filter = 'all' | 'corp' | 'yours';
type Composer = { kind: 'new' } | { kind: 'edit'; id: string } | { kind: 'corp'; structureId: number } | null;

const rowAction =
  'font-ui text-label uppercase tracking-wide text-muted transition-opacity hover:text-text focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100';
const NO_READOUT: StructureReadout = { mfg: null, rxn: null };
/**
 * Readout across the row under the name on a phone, its label column as wide as
 * the hull tile so the values start under the name; beside the name, over the
 * action, from sm up.
 */
const rowGrid =
  "grid grid-cols-[auto_minmax(0,1fr)_auto] [grid-template-areas:'tile_name_action'_'readout_readout_readout'] sm:[grid-template-areas:'tile_name_readout'_'tile_name_action']";

interface Lookups {
  types: StructureTypeOption[];
  systems: SystemSearchEntry[];
  available: Map<string, AvailableStructure>;
}

function readoutFor(lookups: Lookups, id: string, systemId: number | null): StructureReadout {
  const structure = lookups.available.get(id);
  if (!structure) return NO_READOUT;
  const security = lookups.systems.find((s) => s.id === systemId)?.security ?? null;
  return structureBonusesAt(structure, security);
}

function StructureRow({
  lookups,
  name,
  typeId,
  systemId,
  readout,
  taxPct,
  action,
}: {
  lookups: Lookups;
  name: string;
  typeId: number;
  systemId: number | null;
  readout: StructureReadout;
  taxPct: number | null;
  action: ReactNode;
}) {
  const hull = lookups.types.find((t) => t.typeId === typeId) ?? null;
  const system = lookups.systems.find((s) => s.id === systemId) ?? null;
  return (
    <li className={cn(rowGrid, 'group items-center gap-x-3 gap-y-2 px-2 py-2.5 sm:gap-y-1.5')}>
      <span className="[grid-area:tile]">
        <StructureHullTile typeId={typeId} hullName={hull?.name ?? null} />
      </span>
      <div className="flex min-w-0 flex-col gap-1 [grid-area:name]">
        <span className="truncate font-ui text-nav font-medium text-name">{name}</span>
        <span className="truncate font-data text-micro text-muted">
          {hull?.name ?? 'Structure'}
          {system ? (
            <>
              {' · '}
              {system.name} <span className={securityStatusTextClass(system.security)}>{formatSec(system.security)}</span>
            </>
          ) : null}
        </span>
      </div>
      <span className="[--bonus-label-col:2.5rem] [grid-area:readout] sm:self-end sm:justify-self-end sm:[--bonus-label-col:auto]">
        <StructureBonusColumns readout={readout} taxPct={taxPct} />
      </span>
      <span className="flex justify-self-end [grid-area:action] sm:self-start">{action}</span>
    </li>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      <div className="flex items-baseline justify-between px-2">
        <h3 className={eyebrow({ size: 'micro' })}>{title}</h3>
        <span className="font-data text-micro text-faint">{count}</span>
      </div>
      <ul className="flex flex-col divide-y divide-border-soft">{children}</ul>
    </section>
  );
}

function CorpGroup({
  corp,
  lookups,
  rigs,
  composer,
  setComposer,
  onCorpSaved,
}: {
  corp: CorpStructurePageView;
  lookups: Lookups;
  rigs: StructureRigOption[];
  composer: Composer;
  setComposer: (next: Composer) => void;
  onCorpSaved: (structureId: number, saved: { rigTypeIds: number[]; taxPct: number | null }) => void;
}) {
  const manage = corp.structureAccess === 'manage';
  const editor = (s: CorpStructurePageStructure) => {
    const hull = lookups.types.find((t) => t.typeId === s.typeId);
    return (
      <li key={`${s.structureId}-rigs`} className="py-2">
        <CorpRigEditor
          corporationId={corp.corporationId}
          structure={s}
          validRigs={hull ? rigs.filter((r) => rigFitsStructure(r, hull)) : []}
          onSaved={(saved) => onCorpSaved(s.structureId, saved)}
          onClose={() => setComposer(null)}
        />
      </li>
    );
  };
  return (
    <Group title={corp.corporationName} count={corp.structures.length}>
      {corp.structures.map((s) => {
        const editing = composer?.kind === 'corp' && composer.structureId === s.structureId;
        const row = (
          <StructureRow
            key={s.structureId}
            lookups={lookups}
            name={s.name ?? lookups.types.find((t) => t.typeId === s.typeId)?.name ?? `Structure ${s.structureId}`}
            typeId={s.typeId}
            systemId={s.systemId}
            readout={readoutFor(lookups, `corp:${s.structureId}`, s.systemId)}
            taxPct={s.taxPct}
            action={
              manage ? (
                <Button
                  variant="bare"
                  className={cn(rowAction, s.rigTypeIds.length === 0 && 'text-isk sm:opacity-100')}
                  onClick={() => setComposer({ kind: 'corp', structureId: s.structureId })}
                >
                  {s.rigTypeIds.length === 0 ? 'Set rigs' : 'Edit'}
                </Button>
              ) : null
            }
          />
        );
        return editing ? [row, editor(s)] : row;
      })}
    </Group>
  );
}

function Toolbar({
  counts,
  filter,
  onFilter,
  onAdd,
}: {
  counts: { corp: number; yours: number };
  filter: Filter;
  onFilter: (next: Filter) => void;
  onAdd: () => void;
}) {
  const showFilter = counts.corp > 0 && counts.yours > 0;
  return (
    <div className="flex items-center justify-between gap-3">
      {showFilter ? (
        <SegmentedControl
          density="compact"
          label="Show structures"
          value={filter}
          onChange={(v) => onFilter(v as Filter)}
          options={[
            { value: 'all', label: `All ${counts.corp + counts.yours}` },
            { value: 'corp', label: `Corporation ${counts.corp}` },
            { value: 'yours', label: `Yours ${counts.yours}` },
          ]}
        />
      ) : (
        <span />
      )}
      <Button variant="primary" size="sm" onClick={onAdd}>
        + Add structure
      </Button>
    </div>
  );
}

function YoursGroup({
  rows,
  lookups,
  editingId,
  composerFor,
  onEdit,
}: {
  rows: CustomStructureRow[];
  lookups: Lookups;
  editingId: string | null;
  composerFor: (row: CustomStructureRow) => ReactNode;
  onEdit: (id: string) => void;
}) {
  return (
    <Group title="Yours" count={rows.length}>
      {rows.map((row) =>
        row.id === editingId ? (
          <li key={row.id} className="py-2">{composerFor(row)}</li>
        ) : (
          <StructureRow
            key={row.id}
            lookups={lookups}
            name={row.name}
            typeId={row.structureTypeId}
            systemId={row.systemId}
            readout={readoutFor(lookups, row.id, row.systemId)}
            taxPct={row.taxPct}
            action={
              <Button variant="bare" className={rowAction} onClick={() => onEdit(row.id)}>
                Edit
              </Button>
            }
          />
        ),
      )}
    </Group>
  );
}

function useLookups(structureTypes: StructureTypeOption[]): Lookups {
  const available = useAvailableStructures();
  const { systems } = useSystemSearch();
  return useMemo<Lookups>(
    () => ({ types: structureTypes, systems, available: new Map((available ?? []).map((s) => [s.id, s])) }),
    [structureTypes, systems, available],
  );
}

const withCorpRigs = (structureId: number, saved: Pick<CorpStructurePageStructure, 'rigTypeIds' | 'taxPct'>) =>
  (corp: CorpStructurePageView): CorpStructurePageView => ({
    ...corp,
    structures: corp.structures.map((s) => (s.structureId === structureId ? { ...s, ...saved } : s)),
  });

/** The structure a save just added, in the shape a profile takes it. */
export function savedStructure(
  before: readonly CustomStructureRow[],
  after: readonly CustomStructureRow[],
  types: readonly StructureTypeOption[],
): NewStructure | null {
  const row = after.find((s) => !before.some((b) => b.id === s.id));
  const groupId = row && types.find((t) => t.typeId === row.structureTypeId)?.groupId;
  return row && groupId !== undefined ? { id: row.id, name: row.name, systemId: row.systemId, groupId } : null;
}

export function StructuresManager({
  structureTypes,
  structureRigs,
  initialCustom,
  initialCorps,
}: {
  structureTypes: StructureTypeOption[];
  structureRigs: StructureRigOption[];
  initialCustom: CustomStructureRow[];
  initialCorps: CorpStructurePageView[];
}) {
  const [custom, setCustom] = useState(initialCustom);
  const [corps, setCorps] = useState(() => initialCorps.filter((c) => c.structures.length > 0));
  const [ownComposer, setComposer] = useState<Composer>(null);
  // A profile asking for a new structure opens the form, and gets what it saves.
  const forProfile = useNewStructureAsked();
  const composer: Composer = forProfile ? { kind: 'new' } : ownComposer;
  const [filter, setFilter] = useState<Filter>('all');
  const lookups = useLookups(structureTypes);
  const counts = { corp: corps.reduce((n, c) => n + c.structures.length, 0), yours: custom.length };

  const settle = () => {
    setComposer(null);
    refreshAvailableStructures();
  };
  const composerFor = (row: CustomStructureRow | null) => (
    <StructureComposer
      key={row?.id ?? 'new'}
      structureTypes={structureTypes}
      structureRigs={structureRigs}
      editing={row}
      onSaved={(structures) => {
        if (row === null && forProfile) settleNewStructure(savedStructure(custom, structures, structureTypes));
        setCustom(structures);
        settle();
      }}
      onClose={() => (row === null && forProfile ? settleNewStructure(null) : setComposer(null))}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {composer?.kind === 'new' ? (
        composerFor(null)
      ) : (
        <Toolbar counts={counts} filter={filter} onFilter={setFilter} onAdd={() => setComposer({ kind: 'new' })} />
      )}
      {filter !== 'yours' &&
        corps.map((corp) => (
          <CorpGroup
            key={corp.corporationId}
            corp={corp}
            lookups={lookups}
            rigs={structureRigs}
            composer={composer}
            setComposer={setComposer}
            onCorpSaved={(structureId, saved) => {
              setCorps((prev) => prev.map(withCorpRigs(structureId, saved)));
              settle();
            }}
          />
        ))}
      {filter !== 'corp' && custom.length > 0 && (
        <YoursGroup
          rows={custom}
          lookups={lookups}
          editingId={composer?.kind === 'edit' ? composer.id : null}
          composerFor={composerFor}
          onEdit={(id) => setComposer({ kind: 'edit', id })}
        />
      )}
      {counts.corp + counts.yours === 0 && composer === null && <EmptyState>No structures yet.</EmptyState>}
    </div>
  );
}
