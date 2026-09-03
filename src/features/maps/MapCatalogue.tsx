'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState, type RefObject } from 'react';
import { EveImage } from '@/components/eve-image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { SectionLabel } from '@/components/ui/section-label';
import type { CorporationAccessOption } from '@/data/maps/access-contract';
import type { AuthorizedMapRow } from '@/data/maps/queries';
import { formatUtcDate } from '@/lib/format/time';
import { corporationLogoUrl } from '@/lib/eve-image';
import { mapRoleLabel } from './access-editor-model';
import { MapAccessDialog } from './MapAccessDialog';
import { MapLifecycleDialogs } from './MapLifecycleDialogs';
import {
  useMapCatalogueData,
  type MapCatalogueData,
} from './map-catalogue-data';
import {
  closedMapDialogs,
  connectedDialogFocus,
  currentAdminMap,
  dropLostAdminEdit,
  mapDialogAuthorityKey,
  reconcileAuthorityScopedMapDialogs,
} from './map-dialog-state';
import { mapSelectionHref } from './map-navigation';
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
        const name = corporation?.name ?? `Corporation ${corporationId}`;
        return (
          <span
            key={corporationId}
            className="inline-flex items-center gap-2 rounded-ctl border border-border-soft bg-surface-sunk px-2 py-1 font-data text-micro text-muted"
          >
            <EveImage
              source="eve"
              family="corporation-logo"
              src={corporation?.logoUrl ?? corporationLogoUrl(corporationId, 64)}
              alt=""
              width={24}
              height={24}
              className="size-6 rounded-ctl object-cover"
            />
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
      className="flex min-h-56 flex-col overflow-hidden"
    >
      <Link
        href={href}
        data-map-catalogue-open={map.id}
        className="flex flex-1 flex-col gap-4 p-5 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-isk-sub"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="min-w-0 break-words font-display text-h2 font-semibold tracking-copy uppercase text-name">
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
          <PageHead size="hero" crumb="atlas" title="Atlas" />
          <Card className="flex max-w-lg flex-col items-center gap-4 p-6 text-center">
            <div className="flex flex-col gap-1.5">
              <h2 className="font-display text-h2 font-semibold tracking-copy uppercase text-name">
                Map catalogue unavailable
              </h2>
              <p className="font-ui text-ui leading-relaxed text-muted">
                Atlas could not load your authorized maps. Retry before creating or managing a map.
              </p>
            </div>
            <Button variant="primary" onClick={onRetry}>
              Try again
            </Button>
          </Card>
        </PageShell>
      </div>
    );
  }

  return (
    <div ref={catalogueRef} tabIndex={-1} data-map-catalogue className="outline-none">
      <PageShell mode="workspace">
        <PageHead
          size="hero"
          crumb="atlas"
          title="Atlas"
          meta={
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                data-map-catalogue-create
                className="gap-2"
                onClick={(event) => onCreate(event.currentTarget)}
              >
                <PlusGlyph />
                Create new map
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
          }
        />
        <div className="flex flex-col gap-9 pb-16">
          {maps.length === 0 ? (
            <p data-map-catalogue-empty-hint className="font-ui text-ui text-muted">
              Create a map to begin charting a chain.
            </p>
          ) : null}

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

function useMapCatalogueDialogs(data: MapCatalogueData) {
  const { maps, corporations, listingAvailable } = data;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const authorityKey = mapDialogAuthorityKey(listingAvailable, []);
  const [storedDialogs, setStoredDialogs] = useState(() =>
    closedMapDialogs(authorityKey),
  );
  const reconciled = reconcileAuthorityScopedMapDialogs(storedDialogs, authorityKey);
  const currentEditingMap = currentAdminMap(maps, reconciled.editingMapId);
  const dialogs = dropLostAdminEdit(reconciled, currentEditingMap);
  if (dialogs !== storedDialogs) setStoredDialogs(dialogs);
  const creationOpenerRef = useRef<HTMLElement | null>(null);
  const trashOpenerRef = useRef<HTMLElement | null>(null);
  const editOpenerRef = useRef<HTMLElement | null>(null);
  const deleteOpenerRef = useRef<HTMLElement | null>(null);
  const catalogueRef = useRef<HTMLDivElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const deletion = useMapDeletion();
  const corporationById = useMemo(
    () => new Map(corporations.map((corporation) => [corporation.corporationId, corporation])),
    [corporations],
  );
  return {
    catalogueRef,
    corporationById,
    creationOpenerRef,
    currentEditingMap,
    deleteOpenerRef,
    deletion,
    dialogs,
    editOpenerRef,
    pathname,
    pendingDelete,
    searchParams,
    setPendingDelete,
    setStoredDialogs,
    trashOpenerRef,
  };
}

function MapCatalogueContent({ data }: { readonly data: MapCatalogueData }) {
  const {
    maps,
    deletedMaps,
    corporations,
    grantsByMapId,
    listingAvailable,
  } = data;
  const router = useRouter();
  const {
    catalogueRef,
    corporationById,
    creationOpenerRef,
    currentEditingMap,
    deleteOpenerRef,
    deletion,
    dialogs,
    editOpenerRef,
    pathname,
    pendingDelete,
    searchParams,
    setPendingDelete,
    setStoredDialogs,
    trashOpenerRef,
  } = useMapCatalogueDialogs(data);
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
        setStoredDialogs((current) => ({ ...current, creationOpen: true }));
      }}
      onDelete={(map, opener) => {
        deleteOpenerRef.current = opener;
        setPendingDelete({ id: map.id, name: map.name });
      }}
      onManage={(map, opener) => {
        editOpenerRef.current = opener;
        setStoredDialogs((current) => ({
          ...current,
          editingMapId: map.id,
        }));
      }}
      onRetry={() => router.refresh()}
      onTrash={(opener) => {
        trashOpenerRef.current = opener;
        setStoredDialogs((current) => ({ ...current, trashOpen: true }));
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
        onDialogsChange={setStoredDialogs}
        corporations={corporations}
        deletedMaps={deletedMaps}
        creationOpenerRef={creationOpenerRef}
        trashOpenerRef={trashOpenerRef}
        hostRef={catalogueRef}
      />
      {dialogs.editingMapId !== null ? (
        <MapAccessDialog
          key={dialogs.editingMapId}
          mapId={dialogs.editingMapId}
          mapName={currentEditingMap?.name ?? 'map'}
          open={currentEditingMap !== null}
          onOpenChange={(open) => {
            if (!open) {
              setStoredDialogs((current) => ({ ...current, editingMapId: null }));
            }
          }}
          finalFocus={() => finalFocus(editOpenerRef.current)}
          corporations={corporations}
          initialGrants={
            currentEditingMap === null
              ? []
              : grantsByMapId[currentEditingMap.id] ?? []
          }
        />
      ) : null}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletion.deleting) setPendingDelete(null);
        }}
        title="Delete map?"
        consequence={
          pendingDelete === null
            ? ''
            : `${pendingDelete.name} leaves the catalogue. Restore it from Trash within 30 days.`
        }
        busy={deletion.deleting}
        error={deletion.error}
        confirmLabel="Delete map"
        onConfirm={() => {
          if (pendingDelete === null) return;
          void deletion.removeMap(pendingDelete.id, () => setPendingDelete(null));
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
