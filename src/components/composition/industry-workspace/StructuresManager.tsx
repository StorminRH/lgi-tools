'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { StructureHullTile } from '@/components/StructureHullTile';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/segmented';
import { eyebrow } from '@/components/ui/type-roles';
import { useSystemsById } from '@/components/use-system-search';
import { fittingRigs, type StructureRigOption, type StructureTypeOption } from '@/data/eve-data/structures';
import { lookupSystem, type SystemSearchEntry } from '@/data/eve-data/systems-search';
import { StructureComposer } from '@/features/custom-structures/components/StructureComposer';
import type { CustomStructureRow } from '@/features/custom-structures/types';
import { StructureBonusColumns } from '@/features/industry-planner/components/structure-bonus-readout';
import { structureBonusesAt, type StructureReadout } from '@/features/industry-planner/structure-factors';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { refreshAvailableStructures, useAvailableStructures } from '@/features/industry-planner/use-available-structures';
import { CorpRigEditor } from '@/features/owned-structures/components/CorpRigEditor';
import type { CorpStructurePageStructure, CorpStructurePageView } from '@/features/owned-structures/types';
import { refreshCorpStructures, useCorpStructuresLive } from '@/features/owned-structures/use-corp-structures-live';
import { unresolvedName } from '@/lib/format/names';
import { useClientCommitted } from '@/lib/use-client-committed';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { isCurrentReadIdentity, type ReadIdentity, sameReadIdentity, useReadIdentity } from '@/platform/auth/read-identity';
import { FacilitySubline } from './facility-subline';
import { type NewStructure, settleNewStructure, useNewStructureRequest } from './structures-panel';

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
  systemsById: ReadonlyMap<number, SystemSearchEntry> | null;
  available: Map<string, AvailableStructure>;
}

function readoutFor(lookups: Lookups, id: string, systemId: number | null): StructureReadout {
  const structure = lookups.available.get(id);
  if (!structure) return NO_READOUT;
  return structureBonusesAt(structure, lookupSystem(lookups.systemsById, systemId)?.security ?? null);
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
  const system = lookupSystem(lookups.systemsById, systemId);
  return (
    <li className={cn(rowGrid, 'group items-center gap-x-3 gap-y-2 px-2 py-2.5 sm:gap-y-1.5')}>
      <span className="[grid-area:tile]">
        <StructureHullTile typeId={typeId} hullName={hull?.name ?? null} />
      </span>
      <div className="flex min-w-0 flex-col gap-1 [grid-area:name]">
        <span className="truncate font-ui text-nav font-medium text-name">{name}</span>
        <FacilitySubline kind={hull?.name ?? 'Structure'} system={system} />
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
          validRigs={fittingRigs(rigs, hull)}
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
            name={s.name ?? lookups.types.find((t) => t.typeId === s.typeId)?.name ?? unresolvedName('structure', s.structureId)}
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
  const systemsById = useSystemsById();
  return useMemo<Lookups>(
    () => ({ types: structureTypes, systemsById, available: new Map((available ?? []).map((s) => [s.id, s])) }),
    [structureTypes, systemsById, available],
  );
}

export type RigEdit = Pick<CorpStructurePageStructure, 'rigTypeIds' | 'taxPct'>;

const withRigEdits = (edits: ReadonlyMap<number, RigEdit>) =>
  (corp: CorpStructurePageView): CorpStructurePageView => ({
    ...corp,
    structures: corp.structures.map((s) => ({ ...s, ...edits.get(s.structureId) })),
  });

/** The rigs saved here, with the live rows they were saved over. */
export interface RigOverlay {
  readonly over: readonly CorpStructurePageView[];
  readonly edits: ReadonlyMap<number, RigEdit>;
}

/** A save joins the overlay while the same live rows stand, and starts a new one once newer rows came in. */
export function withRigSaved(
  prev: RigOverlay | null,
  over: readonly CorpStructurePageView[],
  structureId: number,
  saved: RigEdit,
): RigOverlay {
  return { over, edits: new Map(prev?.over === over ? prev.edits : []).set(structureId, saved) };
}

/**
 * The live rows with the rigs saved here drawn over them, until the rows
 * change. A save bumps the revision, which cancels any earlier read, so the
 * next rows to land are the re-read that carries the save; a later change
 * by another manager is never masked.
 */
export function overlaidCorps(
  corporations: readonly CorpStructurePageView[],
  overlay: RigOverlay | null,
): readonly CorpStructurePageView[] {
  return overlay === null || overlay.over !== corporations ? corporations : corporations.map(withRigEdits(overlay.edits));
}

/** The member corps with structures to show, newer data streaming in behind the server's first draw. */
function useCorpGroups(initialCorps: CorpStructurePageView[]) {
  const { corporations } = useCorpStructuresLive(initialCorps);
  const [overlay, setOverlay] = useState<RigOverlay | null>(null);
  const corps = useMemo(
    () => overlaidCorps(corporations, overlay).filter((c) => c.structures.length > 0),
    [corporations, overlay],
  );
  const saveRigs = (structureId: number, saved: RigEdit) =>
    setOverlay((prev) => withRigSaved(prev, corporations, structureId, saved));
  return { corps, saveRigs };
}

/** The structure a save just added, in the shape a profile takes it. */
export function savedStructure(
  structures: readonly CustomStructureRow[],
  createdId: string,
  types: readonly StructureTypeOption[],
): NewStructure | null {
  const row = structures.find((s) => s.id === createdId);
  const groupId = row && types.find((t) => t.typeId === row.structureTypeId)?.groupId;
  return row && groupId !== undefined ? { id: row.id, name: row.name, systemId: row.systemId, groupId } : null;
}

export interface StructuresManagerProps {
  owner: ReadIdentity;
  structureTypes: StructureTypeOption[];
  structureRigs: StructureRigOption[];
  initialCustom: CustomStructureRow[];
  initialCorps: CorpStructurePageView[];
}

export function StructuresManager(props: StructuresManagerProps) {
  const { owner, ...data } = props;
  const identity = useReadIdentity();
  const committed = useClientCommitted();
  const { loading } = useAuth();
  const router = useRouter();
  const matches = sameReadIdentity(identity, owner);
  useEffect(() => {
    if (committed && !loading && !matches) router.refresh();
  }, [committed, loading, matches, identity, router]);
  if (committed && !matches) return <Skeleton label="Loading custom structures" className="h-56 w-full rounded-card" />;
  return <StructuresManagerContent key={`${owner.userId}:${owner.characterId}`} {...data} identity={identity} />;
}

function StructuresManagerContent({
  structureTypes,
  structureRigs,
  initialCustom,
  initialCorps,
  identity,
}: Omit<StructuresManagerProps, 'owner'> & { identity: ReadIdentity | null }) {
  const [custom, setCustom] = useState(initialCustom);
  const { corps, saveRigs } = useCorpGroups(initialCorps);
  const [ownComposer, setComposer] = useState<Composer>(null);
  // A profile asking for a new structure opens the form, and gets what it saves.
  const request = useNewStructureRequest();
  const composer: Composer = request !== null ? { kind: 'new' } : ownComposer;
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
      onSaved={(structures, createdId) => {
        if (!isCurrentReadIdentity(identity)) return;
        if (request !== null && createdId !== undefined) {
          settleNewStructure(request, savedStructure(structures, createdId, structureTypes));
        }
        setCustom(structures);
        settle();
      }}
      onClose={() => (row === null && request !== null ? settleNewStructure(request, null) : setComposer(null))}
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
              if (!isCurrentReadIdentity(identity)) return;
              saveRigs(structureId, saved);
              refreshCorpStructures();
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
