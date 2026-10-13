'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, type RefObject } from 'react';
import { EntityLogo } from '@/components/entity-logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadFailed } from '@/components/ui/load-failed';
import { PageShell } from '@/components/ui/page-shell';
import { SectionLabel } from '@/components/ui/section-label';
import { displayTitle } from '@/components/ui/type-roles';
import { useConfirmGate } from '@/components/ui/use-confirm-gate';
import type { CorporationAccessOption } from '@/data/maps/access-contract';
import type { AuthorizedMapRow } from '@/data/maps/queries';
import { formatUtcDate } from '@/lib/format/time';
import { unresolvedName } from '@/lib/format/names';
import { mapRoleLabel } from './access-editor-model';
import { EditingMapAccessDialog } from './MapAccessDialog';
import { MapLifecycleDialogs } from './MapLifecycleDialogs';
import {
  useMapCatalogueData,
  type MapCatalogueData,
} from './map-catalogue-data';
import { connectedDialogFocus } from './map-dialog-state';
import { mapSelectionHref } from './map-navigation';
import { useAuthorityScopedMapDialogs } from './use-authority-scoped-map-dialogs';
import { useMapDeletion } from './use-map-deletion';

export interface MapCatalogueSection {
  readonly id: 'created' | 'corporation' | 'direct';
  readonly label: 'Your maps' | 'Corporation maps' | 'Shared with you';
  readonly maps: readonly AuthorizedMapRow[];
}

export function mapCatalogueSections(
  maps: readonly AuthorizedMapRow[],
): readonly MapCatalogueSection[] {
  return [
    {
      id: 'created',
      label: 'Your maps',
      maps: maps.filter((map) => map.provenance.kind === 'created'),
    },
    {
      id: 'corporation',
      label: 'Corporation maps',
      maps: maps.filter((map) => map.provenance.kind === 'corporation'),
    },
    {
      id: 'direct',
      label: 'Shared with you',
      maps: maps.filter((map) => map.provenance.kind === 'direct'),
    },
  ];
}

function PlusGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[18px] stroke-current" fill="none">
      <path d="M12 5v14M5 12h14" strokeWidth="1.5" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="size-[18px] stroke-current" fill="none">
      <path d="M4.5 6h11M8 3.5h4M6.5 6l.6 10h5.8l.6-10M8.5 8.5v5M11.5 8.5v5" />
    </svg>
  );
}

function CorporationBadges({
  map,
  corporationById,
}: {
  readonly map: AuthorizedMapRow;
  readonly corporationById: ReadonlyMap<number, CorporationAccessOption>;
}) {
  if (map.provenance.kind !== 'corporation') return null;
  return (
    <div className="flex flex-wrap gap-2" data-map-catalogue-corporations={map.id}>
      {map.provenance.corporationIds.map((corporationId) => {
        const corporation = corporationById.get(corporationId);
        const name = corporation?.name ?? unresolvedName('corporation', corporationId);
        return (
          <span
            key={corporationId}
            className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-row-hover px-2.5 py-1 font-data text-micro text-muted"
          >
            <EntityLogo kind="corporation" id={corporationId} size={24} />
            <span>{name}</span>
          </span>
        );
      })}
    </div>
  );
}

function CatalogueMapCard({
  map,
  href,
  corporationById,
  onManage,
  onDelete,
}: {
  readonly map: AuthorizedMapRow;
  readonly href: string;
  readonly corporationById: ReadonlyMap<number, CorporationAccessOption>;
  readonly onManage: (map: AuthorizedMapRow, opener: HTMLElement) => void;
  readonly onDelete: (map: AuthorizedMapRow, opener: HTMLElement) => void;
}) {
  return (
    <Card
      hover
      data-map-catalogue-card={map.id}
      className="edge-glow flex min-h-56 flex-col rounded-panel"
    >
      <Link
        href={href}
        data-map-catalogue-open={map.id}
        className="flex flex-1 flex-col gap-4 p-5 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-isk-sub"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className={displayTitle({ wrap: true })}>
            {map.name}
          </h2>
          {map.provenance.kind === 'created' ? null : (
            <p className="font-ui text-label text-muted">Shared by {map.creatorName}</p>
          )}
        </div>
        <CorporationBadges map={map} corporationById={corporationById} />
        <div className="mt-auto flex flex-col gap-1 font-data text-label text-muted">
          <span>Your access: {mapRoleLabel(map.role)}</span>
          <time dateTime={map.createdAt.toISOString()}>
            Created {formatUtcDate(map.createdAt)}
          </time>
        </div>
      </Link>
      {map.role === 'admin' ? (
        <div className="flex items-center justify-between gap-2 border-t border-border-soft px-3 py-2">
          <Button
            variant="bare"
            aria-label={`Delete ${map.name}`}
            data-map-catalogue-delete={map.id}
            className="p-2 text-hostile hover:text-dps-high"
            onClick={(event) => onDelete(map, event.currentTarget)}
          >
            <TrashGlyph />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-map-catalogue-edit={map.id}
            onClick={(event) => onManage(map, event.currentTarget)}
          >
            Edit access
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function CatalogueSection({
  section,
  pathname,
  searchParams,
  corporationById,
  onManage,
  onDelete,
}: {
  readonly section: MapCatalogueSection;
  readonly pathname: string;
  readonly searchParams: Pick<URLSearchParams, 'toString'>;
  readonly corporationById: ReadonlyMap<number, CorporationAccessOption>;
  readonly onManage: (map: AuthorizedMapRow, opener: HTMLElement) => void;
  readonly onDelete: (map: AuthorizedMapRow, opener: HTMLElement) => void;
}) {
  if (section.maps.length === 0) return null;
  return (
    <section aria-labelledby={`map-catalogue-${section.id}`} className="flex flex-col gap-3">
      <SectionLabel>
        <span id={`map-catalogue-${section.id}`}>{section.label}</span>
      </SectionLabel>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {section.maps.map((map) => (
          <CatalogueMapCard
            key={map.id}
            map={map}
            href={mapSelectionHref(pathname, searchParams, map.id)}
            corporationById={corporationById}
            onManage={onManage}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

function MapCatalogueSurface({
  catalogueRef,
  corporationById,
  deletedCount,
  listingAvailable,
  maps,
  onCreate,
  onDelete,
  onManage,
  onRetry,
  onTrash,
  pathname,
  searchParams,
  sections,
}: {
  catalogueRef: RefObject<HTMLDivElement | null>;
  corporationById: ReadonlyMap<number, CorporationAccessOption>;
  deletedCount: number;
  listingAvailable: boolean;
  maps: readonly AuthorizedMapRow[];
  onCreate: (opener: HTMLElement) => void;
  onDelete: (map: AuthorizedMapRow, opener: HTMLElement) => void;
  onManage: (map: AuthorizedMapRow, opener: HTMLElement) => void;
  onRetry: () => void;
  onTrash: (opener: HTMLElement) => void;
  pathname: string;
  searchParams: ReturnType<typeof useSearchParams>;
  sections: readonly MapCatalogueSection[];
}) {
  if (!listingAvailable) {
    return (
      <div
        ref={catalogueRef}
        tabIndex={-1}
        data-map-catalogue
        data-map-catalogue-unavailable
        className="outline-none"
      >
        <PageShell mode="workspace">
          <h1 className="sr-only">Atlas</h1>
          <LoadFailed
            title="Maps didn't load"
            retryLabel="Try again"
            onRetry={onRetry}
            className="max-w-lg"
          />
        </PageShell>
      </div>
    );
  }

  return (
    <div ref={catalogueRef} tabIndex={-1} data-map-catalogue className="outline-none">
      <PageShell mode="workspace">
        <h1 className="sr-only">Atlas</h1>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {maps.length === 0 ? (
            <p data-map-catalogue-empty-hint className="font-ui text-ui text-muted">
              No maps yet.
            </p>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            data-map-catalogue-create
            className="ml-auto gap-2"
            onClick={(event) => onCreate(event.currentTarget)}
          >
            <PlusGlyph />
            New map
          </Button>
          <Button
            variant="secondary"
            size="sm"
            data-map-catalogue-trash
            className="gap-2"
            onClick={(event) => onTrash(event.currentTarget)}
          >
            <TrashGlyph />
            Trash{deletedCount > 0 ? ` (${deletedCount})` : ''}
          </Button>
        </div>
        <div className="flex flex-col gap-9 pb-16">
          {sections.map((section) => (
            <CatalogueSection
              key={section.id}
              section={section}
              pathname={pathname}
              searchParams={searchParams}
              corporationById={corporationById}
              onManage={onManage}
              onDelete={onDelete}
            />
          ))}
        </div>
      </PageShell>
    </div>
  );
}

function useMapCatalogueDialogs(corporations: readonly CorporationAccessOption[]) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const creationOpenerRef = useRef<HTMLElement | null>(null);
  const trashOpenerRef = useRef<HTMLElement | null>(null);
  const editOpenerRef = useRef<HTMLElement | null>(null);
  const deleteOpenerRef = useRef<HTMLElement | null>(null);
  const catalogueRef = useRef<HTMLDivElement | null>(null);
  const deleteGate = useConfirmGate<{ id: string; name: string }>();
  const deletion = useMapDeletion();
  const corporationById = useMemo(
    () => new Map(corporations.map((corporation) => [corporation.corporationId, corporation])),
    [corporations],
  );
  return {
    catalogueRef,
    corporationById,
    creationOpenerRef,
    deleteGate,
    deleteOpenerRef,
    deletion,
    editOpenerRef,
    pathname,
    searchParams,
    trashOpenerRef,
  };
}

function MapCatalogueContent({ data }: { readonly data: MapCatalogueData }) {
  const {
    maps,
    deletedMaps,
    corporations,
    grantsByMapId,
    blocksByMapId,
    listingAvailable,
  } = data;
  const router = useRouter();
  const {
    catalogueRef,
    corporationById,
    creationOpenerRef,
    deleteGate,
    deleteOpenerRef,
    deletion,
    editOpenerRef,
    pathname,
    searchParams,
    trashOpenerRef,
  } = useMapCatalogueDialogs(corporations);
  const { dialogs, setDialogs, editingMap } = useAuthorityScopedMapDialogs(
    maps,
    listingAvailable,
  );
  const sections = mapCatalogueSections(maps);

  const surface = (
    <MapCatalogueSurface
      catalogueRef={catalogueRef}
      corporationById={corporationById}
      deletedCount={deletedMaps.length}
      listingAvailable={listingAvailable}
      maps={maps}
      onCreate={(opener) => {
        creationOpenerRef.current = opener;
        setDialogs((current) => ({ ...current, creationOpen: true }));
      }}
      onDelete={(map, opener) => {
        deleteOpenerRef.current = opener;
        deleteGate.request({ id: map.id, name: map.name });
      }}
      onManage={(map, opener) => {
        editOpenerRef.current = opener;
        setDialogs((current) => ({
          ...current,
          editingMapId: map.id,
        }));
      }}
      onRetry={() => router.refresh()}
      onTrash={(opener) => {
        trashOpenerRef.current = opener;
        setDialogs((current) => ({ ...current, trashOpen: true }));
      }}
      pathname={pathname}
      searchParams={searchParams}
      sections={sections}
    />
  );

  const finalFocus = (opener: HTMLElement | null) =>
    connectedDialogFocus(opener, catalogueRef.current);

  return (
    <>
      {surface}

      <MapLifecycleDialogs
        dialogs={dialogs}
        onDialogsChange={setDialogs}
        corporations={corporations}
        deletedMaps={deletedMaps}
        creationOpenerRef={creationOpenerRef}
        trashOpenerRef={trashOpenerRef}
        hostRef={catalogueRef}
      />
      <EditingMapAccessDialog
        editingMap={editingMap}
        onClose={() => setDialogs((current) => ({ ...current, editingMapId: null }))}
        finalFocus={() => finalFocus(editOpenerRef.current)}
        corporations={corporations}
        grantsByMapId={grantsByMapId}
        blocksByMapId={blocksByMapId}
      />
      <ConfirmDialog
        open={deleteGate.open}
        onOpenChange={(open) => {
          if (!open) deleteGate.cancel();
        }}
        title="Delete map?"
        consequence={
          deleteGate.target === null
            ? ''
            : `${deleteGate.target.name} moves to Trash. You can restore it within 30 days.`
        }
        busy={deleteGate.busy}
        error={deleteGate.errored ? deletion.error : null}
        confirmLabel="Delete map"
        onConfirm={() => {
          const map = deleteGate.target;
          if (map === null) return;
          void deleteGate.run(() => deletion.removeMap(map.id, deleteGate.reset), (deleted) => !deleted);
        }}
        finalFocus={deleteOpenerRef}
      />
    </>
  );
}

export function MapCatalogue() {
  const data = useMapCatalogueData();
  return <MapCatalogueContent data={data} />;
}
