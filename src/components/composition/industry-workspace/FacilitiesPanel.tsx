'use client';

import { useState } from 'react';
import { StructureHullTile } from '@/components/StructureHullTile';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Collapsible } from '@/components/ui/collapsible';
import { ChevronDownIcon } from '@/components/ui/icons';
import { useSystemSearch } from '@/components/use-system-search';
import { securityStatusTextClass } from '@/data/eve-data/security';
import { formatSec, type SystemSearchEntry } from '@/data/eve-data/systems-search';
import {
  addFacility,
  removeFacility,
  setFacilityCategories,
} from '@/features/industry-planner/profiles/assignments';
import type { CategoryKey } from '@/features/industry-planner/profiles/production-categories';
import { facilityKey, type ProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import type { AvailableStructure } from '@/features/industry-planner/types';
import { SectionPanel } from '../board/SectionBody';
import { AddFacility } from './AddFacility';
import { CategoryChecklist } from './CategoryChecklist';
import {
  type FacilityPick,
  type FacilityView,
  facilityViews,
  REACTION_KEYS,
  rigBonuses,
  stationFacility,
  structureFacility,
} from './facilities-model';
import { setStructuresPanelOpen } from './structures-panel';
import { roleLine } from './workspace-model';

export interface HullName {
  typeId: number;
  name: string;
}

const NOTHING_OFF: ReadonlySet<CategoryKey> = new Set();

function FacilityTile({ view, hulls }: { view: FacilityView; hulls: readonly HullName[] }) {
  if (view.facility.kind === 'station') {
    return (
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-ctl border border-border bg-bg-deep/60 font-display text-micro font-bold tracking-copy text-muted"
      >
        NPC
      </span>
    );
  }
  const hull = hulls.find((h) => h.typeId === view.structure?.structureTypeId)?.name ?? null;
  return <StructureHullTile hullName={hull} groupId={view.structure?.groupId ?? null} />;
}

function facilityKind(view: FacilityView, hulls: readonly HullName[]): string {
  if (view.facility.kind === 'station') return 'NPC station';
  if (view.missing) return 'No longer available';
  return hulls.find((h) => h.typeId === view.structure?.structureTypeId)?.name ?? 'Structure';
}

/** What a facility is and where: its hull or station, then its system and security. */
function FacilitySubline({ kind, system }: { kind: string; system: SystemSearchEntry | null }) {
  return (
    <span className="truncate font-data text-micro text-muted">
      {kind}
      {system ? (
        <>
          {' · '}
          {system.name} <span className={securityStatusTextClass(system.security)}>{formatSec(system.security)}</span>
        </>
      ) : null}
    </span>
  );
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
  return (
    <span className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1">
      <span className={cn(view.missing && 'opacity-50 grayscale')}>
        <FacilityTile view={view} hulls={hulls} />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-ui text-nav font-medium text-name">{view.facility.name}</span>
        <FacilitySubline kind={facilityKind(view, hulls)} system={system} />
        <span className="truncate font-data text-micro text-isk sm:hidden">{roleLine(view.facility)}</span>
      </span>
      <span className="flex items-center gap-3">
        <span className="hidden max-w-[22rem] truncate font-data text-micro text-isk sm:block">
          {roleLine(view.facility)}
        </span>
        <ChevronDownIcon size={14} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
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
            unavailable={view.hostsReactions ? NOTHING_OFF : REACTION_KEYS}
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
  const { systems } = useSystemSearch();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const views = facilityViews(doc, structures);
  const systemOf = (systemId: number | null) => systems.find((s) => s.id === systemId) ?? null;
  const describe = (pick: FacilityPick) =>
    pick.kind === 'station' ? (
      <FacilitySubline kind="NPC station" system={systemOf(pick.station.systemId)} />
    ) : (
      <FacilitySubline
        kind={hulls.find((h) => h.typeId === pick.structure.structureTypeId)?.name ?? 'Structure'}
        system={systemOf(pick.structure.systemId)}
      />
    );
  const add = (pick: FacilityPick) => {
    const facility = pick.kind === 'structure' ? structureFacility(doc, pick.structure) : stationFacility(doc, pick.station);
    onEdit(addFacility(doc, facility));
    setOpenKey(facilityKey(facility));
  };
  return (
    <SectionPanel
      title="Facilities"
      meta={
        <Button
          variant="bare"
          data-structures-trigger
          aria-haspopup="dialog"
          className="whitespace-nowrap font-ui text-micro font-normal uppercase tracking-eyebrow text-isk no-underline transition-colors hover:text-name"
          onClick={() => setStructuresPanelOpen(true)}
        >
          Structures →
        </Button>
      }
    >
      {views.length > 0 ? (
        <ul className="flex flex-col">
          {views.map((view) => (
            <FacilityRow
              key={view.key}
              view={view}
              hulls={hulls}
              system={systemOf(view.facility.systemId)}
              open={openKey === view.key}
              onOpenChange={(open) => setOpenKey((current) => (open ? view.key : current === view.key ? null : current))}
              onEdit={onEdit}
              doc={doc}
            />
          ))}
        </ul>
      ) : null}
      <div className={cn('px-3.5 py-3', views.length > 0 && 'border-t border-border-soft')}>
        <AddFacility
          structures={structures}
          taken={new Set(views.map((v) => v.key))}
          describe={describe}
          onAdd={add}
        />
      </div>
    </SectionPanel>
  );
}
