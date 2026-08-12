'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { EveImage } from '@/components/eve-image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

/** One self-hiding catalogue section derived without changing listing order. */
export interface MapCatalogueSection {
  readonly id: 'created' | 'corporation' | 'direct';
  readonly label: 'Your maps' | 'Corporation maps' | 'Shared with you';
  readonly maps: readonly AuthorizedMapRow[];
}

/** Partitions the exact authorized listing into its three exclusive provenance sections. */
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
    <svg viewBox="0 0 24 24" aria-hidden className="size-8 stroke-current" fill="none">
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
}: {
  readonly map: AuthorizedMapRow;
  readonly href: string;
  readonly corporationById: ReadonlyMap<number, CorporationAccessOption>;
  readonly onManage: (map: AuthorizedMapRow, opener: HTMLElement) => void;
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
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-h2 font-semibold tracking-copy uppercase text-name">
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
        <div className="flex justify-end border-t border-border-soft px-4 py-3">
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
}: {
  readonly section: MapCatalogueSection;
  readonly pathname: string;
  readonly searchParams: Pick<URLSearchParams, 'toString'>;
  readonly corporationById: ReadonlyMap<number, CorporationAccessOption>;
  readonly onManage: (map: AuthorizedMapRow, opener: HTMLElement) => void;
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
          />
        ))}
      </div>
    </section>
  );
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Create/trash stay keyed to listing availability only. Including admin map
  // ids would close TrashWindow on restore refresh, unlike the Atlas-menu door.
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
  const catalogueRef = useRef<HTMLElement | null>(null);
  const sections = mapCatalogueSections(maps);
  const corporationById = useMemo(
    () => new Map(corporations.map((corporation) => [corporation.corporationId, corporation])),
    [corporations],
  );

  const surface = !listingAvailable ? (
    <main
      ref={catalogueRef}
      tabIndex={-1}
      data-map-catalogue
      data-map-catalogue-unavailable
      className="flex h-full min-h-0 items-center justify-center bg-bg-deep px-6 text-center outline-none"
    >
      <Card className="flex max-w-lg flex-col items-center gap-4 p-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-h2 font-semibold tracking-copy uppercase text-name">
            Map catalogue unavailable
          </h1>
          <p className="font-ui text-ui leading-relaxed text-muted">
            Atlas could not load your authorized maps. Retry before creating or managing a map.
          </p>
        </div>
        <Button variant="primary" onClick={() => router.refresh()}>
          Try again
        </Button>
      </Card>
    </main>
  ) : (
    <main
      ref={catalogueRef}
      tabIndex={-1}
      data-map-catalogue
      className="relative h-full min-h-0 bg-bg-deep outline-none"
    >
      <div
        data-map-catalogue-scroll
        className="h-full min-h-0 overflow-y-auto overscroll-contain px-4 pb-28 pt-20 sm:px-6 lg:px-10"
      >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
            <header className="flex flex-col gap-1">
              <div className="font-data text-label uppercase tracking-eyebrow text-isk">
                Atlas
              </div>
              <h1 className="font-display text-display font-bold uppercase tracking-copy text-name">
                Map catalogue
              </h1>
            </header>

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
                onManage={(map, opener) => {
                  editOpenerRef.current = opener;
                  setStoredDialogs((current) => ({
                    ...current,
                    editingMapId: map.id,
                  }));
                }}
              />
            ))}

            <Card hover data-map-catalogue-create-card className="overflow-hidden">
              <Button
                variant="bare"
                data-map-catalogue-create
                className="flex min-h-48 w-full flex-col items-start justify-center gap-3 p-5 text-left text-muted hover:text-isk"
                onClick={(event) => {
                  creationOpenerRef.current = event.currentTarget;
                  setStoredDialogs((current) => ({
                    ...current,
                    creationOpen: true,
                  }));
                }}
              >
                <PlusGlyph />
                <span className="font-display text-h2 font-semibold tracking-copy uppercase text-name">
                  Create new map
                </span>
              </Button>
            </Card>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          data-map-catalogue-trash
          className="absolute bottom-4 left-4 z-sticky gap-2 bg-section"
          onClick={(event) => {
            trashOpenerRef.current = event.currentTarget;
            setStoredDialogs((current) => ({ ...current, trashOpen: true }));
          }}
        >
          <TrashGlyph />
          Trash{deletedMaps.length > 0 ? ` (${deletedMaps.length})` : ''}
        </Button>
    </main>
  );

  const finalFocus = (opener: HTMLElement | null) =>
    connectedDialogFocus(opener, catalogueRef.current);

  return (
    <>
      {surface}

      <MapLifecycleDialogs
        creationOpen={dialogs.creationOpen}
        trashOpen={dialogs.trashOpen}
        onCreationOpenChange={(open) =>
          setStoredDialogs((current) => ({ ...current, creationOpen: open }))
        }
        onTrashOpenChange={(open) =>
          setStoredDialogs((current) => ({ ...current, trashOpen: open }))
        }
        corporations={corporations}
        deletedMaps={deletedMaps}
        creationFocus={() => finalFocus(creationOpenerRef.current)}
        trashFocus={() => finalFocus(trashOpenerRef.current)}
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
    </>
  );
}

/** Renders the metadata-only Atlas landing from the exact map-chrome snapshot. */
export function MapCatalogue() {
  const data = useMapCatalogueData();
  return <MapCatalogueContent data={data} />;
}
