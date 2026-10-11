'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { PlaceholderTile, StructureHullTile } from '@/components/StructureHullTile';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Collapsible, CollapsibleChevron } from '@/components/ui/collapsible';
import { ChevronDownIcon } from '@/components/ui/icons';
import { SectionPanel } from '@/components/ui/section-panel';
import { useSystemsById } from '@/components/use-system-search';
import { lookupSystem, type SystemSearchEntry } from '@/data/eve-data/systems-search';
import {
  addFacility,
  removeFacility,
  setFacilityCategories,
} from '@/features/industry-planner/profiles/assignments';
import {
  facilityKey,
  MAX_PROFILE_FACILITIES,
  type ProfileDocument,
  type ProfileFacility,
} from '@/features/industry-planner/profiles/profile-document';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { AddFacilityRow } from './AddFacilityRow';
import { CategoryChecklist } from './CategoryChecklist';
import { FacilitySubline } from './facility-subline';
import {
  type FacilityPick,
  type FacilityView,
  facilityViews,
  rigBonuses,
  stationFacility,
  structureFacility,
  unavailableCategories,
} from './facilities-model';
import { type NewStructure, requestNewStructure } from './structures-panel';
import { roleLine } from './workspace-model';

export interface HullName {
  typeId: number;
  name: string;
}

function hullName(hulls: readonly HullName[], typeId: number | undefined): string | null {
  return hulls.find((h) => h.typeId === typeId)?.name ?? null;
}

function FacilityTile({ view, hull }: { view: FacilityView; hull: string | null }) {
  if (view.facility.kind === 'station') return <PlaceholderTile label="NPC" className="text-micro tracking-copy" />;
  return <StructureHullTile typeId={view.structure?.structureTypeId ?? null} hullName={hull} />;
}

function facilityKind(view: FacilityView, hull: string | null): string {
  if (view.facility.kind === 'station') return 'NPC station';
  if (view.missing) return 'No longer available';
  return hull ?? 'Structure';
}

function FacilityHeader({
  view,
  hulls,
  system,
}: {
  view: FacilityView;
  hulls: readonly HullName[];
  system: SystemSearchEntry | null;
}) {
  const off = unavailableCategories(view);
  const builds = roleLine({ categories: view.facility.categories.filter((c) => !off.has(c)) });
  const hull = hullName(hulls, view.structure?.structureTypeId);
  return (
    <span className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1">
      <span className={cn(view.missing && 'opacity-50 grayscale')}>
        <FacilityTile view={view} hull={hull} />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-ui text-nav font-medium text-name">{view.facility.name}</span>
        <FacilitySubline kind={facilityKind(view, hull)} system={system} />
        <span className="truncate font-data text-micro text-isk sm:hidden">{builds}</span>
      </span>
      <span className="flex items-center gap-3">
        <span className="hidden max-w-[22rem] truncate font-data text-micro text-isk sm:block">
          {builds}
        </span>
        <CollapsibleChevron className="flex">
          <ChevronDownIcon size={14} />
        </CollapsibleChevron>
      </span>
    </span>
  );
}

function FacilityRow({
  view,
  hulls,
  system,
  open,
  onOpenChange,
  onEdit,
  doc,
}: {
  view: FacilityView;
  hulls: readonly HullName[];
  system: SystemSearchEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (next: ProfileDocument) => void;
  doc: ProfileDocument;
}) {
  const { structure, facility } = view;
  const bonuses = structure ? rigBonuses(structure, system?.security ?? null) : undefined;
  return (
    <li>
      <Collapsible
        open={open}
        onOpenChange={onOpenChange}
        header={<FacilityHeader view={view} hulls={hulls} system={system} />}
        headerClassName="py-2"
      >
        <div className="flex flex-col gap-4 px-3.5 pt-1 pb-4 sm:pl-[4.25rem]">
          <CategoryChecklist
            label={`Categories built at ${facility.name}`}
            categories={facility.categories}
            unavailable={unavailableCategories(view)}
            bonuses={bonuses}
            onChange={(next) => onEdit(setFacilityCategories(doc, view.key, next))}
          />
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            aria-label={`Remove ${facility.name} from this profile`}
            onClick={() => onEdit(removeFacility(doc, view.key))}
          >
            Remove from profile
          </Button>
        </div>
      </Collapsible>
    </li>
  );
}

/**
 * Where the profile builds: each facility and the categories it takes. A job
 * goes to the facility that covers its most specific category; where several
 * do, the best bonus wins.
 */
export function FacilitiesPanel({
  doc,
  structures,
  hulls,
  onEdit,
}: {
  doc: ProfileDocument;
  structures: readonly AvailableStructure[] | null;
  hulls: readonly HullName[];
  onEdit: (next: ProfileDocument) => void;
}) {
  const systemsById = useSystemsById();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const views = facilityViews(doc, structures);
  const systemOf = (systemId: number | null) => lookupSystem(systemsById, systemId);
  const describe = (pick: FacilityPick) =>
    pick.kind === 'station' ? (
      <FacilitySubline kind="NPC station" system={systemOf(pick.station.systemId)} />
    ) : (
      <FacilitySubline
        kind={hullName(hulls, pick.structure.structureTypeId) ?? 'Structure'}
        system={systemOf(pick.structure.systemId)}
      />
    );
  const addAndOpen = (facility: ProfileFacility) => {
    onEdit(addFacility(doc, facility));
    setOpenKey(facilityKey(facility));
  };
  const add = (pick: FacilityPick) =>
    addAndOpen(pick.kind === 'structure' ? structureFacility(doc, pick.structure) : stationFacility(doc, pick.station));
  const addNew = useRef((saved: NewStructure) =>
    addAndOpen(structureFacility(doc, saved)));
  const cancelNew = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    addNew.current = (saved) => addAndOpen(structureFacility(doc, saved));
  });
  useLayoutEffect(() => () => cancelNew.current?.(), []);
  return (
    <SectionPanel title="Facilities">
      {views.length > 0 ? (
        <ul className="flex flex-col">
          {views.map((view) => (
            <FacilityRow
              key={view.key}
              view={view}
              hulls={hulls}
              system={systemOf(view.systemId)}
              open={openKey === view.key}
              onOpenChange={(open) => setOpenKey((current) => (open ? view.key : current === view.key ? null : current))}
              onEdit={onEdit}
              doc={doc}
            />
          ))}
        </ul>
      ) : null}
      <div className={cn(views.length > 0 && 'border-t border-border-soft')}>
        <AddFacilityRow
          structures={structures}
          taken={new Set(views.map((v) => v.key))}
          describe={describe}
          onAdd={add}
          onNewStructure={() => {
            cancelNew.current?.();
            cancelNew.current = requestNewStructure((saved) => addNew.current(saved));
          }}
          full={doc.facilities.length >= MAX_PROFILE_FACILITIES}
        />
      </div>
    </SectionPanel>
  );
}
