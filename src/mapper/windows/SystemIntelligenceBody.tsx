'use client';

import { useState } from 'react';
import { cn } from '@/components/ui/cn';
import { useEntityNames } from '@/components/use-entity-names';
import { systemClassificationReadout } from '@/data/eve-data/system-identity';
import {
  formatHubJump,
  type HubJumpTuple,
} from '@/data/eve-data/trade-hubs';
import { useTypeNames } from '@/data/eve-data/use-type-names';
import { formatIskShort } from '@/lib/format/isk';
import {
  ScannerLivePricesProvider,
  useScannerEstIskSum,
} from '@/features/wormhole-sites/widget';
import { useSignatureRows } from '../signatures/signature-context';
import { useSystemStaticSlots } from '../signatures/use-system-statics';
import {
  friendlyRows,
  type FriendlyRowModel,
  type PresenceStatusWord,
} from '../tracking/presence-model';
import { useSystemPresence } from '../tracking/presence-context';
import { useUniverseAssets } from '../chain/use-universe-assets';
import {
  harvestableNamesForIntel,
  intelCategoryBlocks,
  intelLocationKind,
  type IntelCategoryBlock,
  type StaticSlot,
} from './intel-model';
import { useSystemLabel } from './use-system-label';

const NO_PILOTS: readonly never[] = [];

function useFriendlyRows(systemId: number): readonly FriendlyRowModel[] {
  const presence = useSystemPresence(systemId);
  const pilots = presence?.pilots ?? NO_PILOTS;
  const names = useEntityNames(pilots.map((pilot) => pilot.characterId));
  const shipNames = useTypeNames(
    pilots.flatMap((pilot) => (pilot.shipTypeId === null ? [] : [pilot.shipTypeId])),
  );
  return friendlyRows(pilots, names, shipNames);
}

const STATUS_CLASS: Record<PresenceStatusWord, string> = {
  'In space': 'text-isk',
  Docked: 'text-text',
};

export function SystemTitleAccessory({
  systemId,
}: {
  readonly systemId: number;
}) {
  const label = useSystemLabel(systemId);
  const classification = systemClassificationReadout({
    security: label?.security ?? null,
    whClassId: label?.whClassId ?? null,
  });
  if (classification === null) return null;
  return (
    <span data-identity-readout>
      {' '}
      <span
        data-identity-classification
        className={cn('tabular-nums', classification.tone)}
      >
        {classification.label}
      </span>
    </span>
  );
}

function StaticSlotsList({ slots }: { readonly slots: readonly StaticSlot[] }) {
  if (slots.length === 0) return null;
  return (
    <ul data-intel-statics className="flex flex-col gap-0.5">
      {slots.map((slot) => (
        <li key={slot.code} className="font-data text-micro text-muted">
          {slot.code} {slot.className}
        </li>
      ))}
    </ul>
  );
}

function HubList({ hubs }: { readonly hubs: HubJumpTuple }) {
  return (
    <ul data-intel-hubs className="flex flex-col gap-0.5">
      {hubs.map((hub) => (
        <li key={hub.id} className="font-data text-micro text-muted">
          {formatHubJump(hub)}
        </li>
      ))}
    </ul>
  );
}

function LocationSection({ systemId }: { readonly systemId: number }) {
  const label = useSystemLabel(systemId);
  const assets = useUniverseAssets();
  const kind = intelLocationKind({
    security: label?.security ?? null,
    whClassId: label?.whClassId ?? null,
  });
  const statics = useSystemStaticSlots(systemId);
  if (kind === 'none') return null;
  if (kind === 'wormhole') {
    if (statics.length === 0) return null;
    return (
      <section data-intel-section="location" className="flex flex-col gap-1">
        <p className="font-data text-label uppercase tracking-label text-isk">
          Statics
        </p>
        <StaticSlotsList slots={statics} />
      </section>
    );
  }
  const hubs = assets?.hubJumps(systemId);
  if (hubs === undefined) return null;
  return (
    <section data-intel-section="location" className="flex flex-col gap-1">
      <p className="font-data text-label uppercase tracking-label text-isk">
        Trade hubs
      </p>
      <HubList hubs={hubs} />
    </section>
  );
}

function CategoryBlock({ block }: { readonly block: IntelCategoryBlock }) {
  const [open, setOpen] = useState(false);
  const isk = useScannerEstIskSum(block.names, block.bucket === 'harvestables');
  return (
    <div data-intel-category={block.bucket} className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="pointer-events-auto flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span className="font-data text-micro text-name">
          {block.label} ×{block.count}
        </span>
        <span
          data-intel-category-isk={isk === null ? 'empty' : 'value'}
          className={cn(
            'shrink-0 font-data text-micro tabular-nums',
            isk === null ? 'text-muted' : 'text-isk',
          )}
        >
          {formatIskShort(isk)}
        </span>
      </button>
      {open
        ? block.names.map((name) => (
            <p key={name} className="font-data text-micro text-muted">
              {name}
            </p>
          ))
        : null}
    </div>
  );
}

function IdentifiedCategories({
  blocks,
}: {
  readonly blocks: readonly IntelCategoryBlock[];
}) {
  if (blocks.length === 0) return null;
  return (
    <section data-intel-section="sites" className="flex flex-col gap-1">
      <p className="font-data text-label uppercase tracking-label text-isk">
        Identified
      </p>
      {blocks.map((block) => (
        <CategoryBlock key={block.bucket} block={block} />
      ))}
    </section>
  );
}

function FriendlyRow({ row }: { readonly row: FriendlyRowModel }) {
  return (
    <li
      data-presence-pilot={row.characterId}
      className="flex items-baseline justify-between gap-3"
    >
      <span className="truncate font-data text-ui text-name">
        {row.label}
        {row.shipName !== null ? (
          <span data-presence-ship className="text-muted">
            {' '}
            {row.shipName}
          </span>
        ) : null}
      </span>
      <span
        data-presence-status={row.word}
        className={cn('shrink-0 font-data text-ui', STATUS_CLASS[row.word])}
      >
        {row.word}
      </span>
    </li>
  );
}

function FriendliesSection({ rows }: { readonly rows: readonly FriendlyRowModel[] }) {
  if (rows.length === 0) return null;
  return (
    <section data-intel-section="friendlies" className="flex flex-col gap-1">
      <p className="font-data text-label uppercase tracking-label text-isk">Friendlies</p>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <FriendlyRow key={row.characterId} row={row} />
        ))}
      </ul>
    </section>
  );
}

export function SystemIntelligenceBody({ systemId }: { readonly systemId: number }) {
  const rows = useSignatureRows(systemId);
  const friendlies = useFriendlyRows(systemId);
  return (
    <div data-system-intel className="flex flex-col items-stretch gap-3 text-left">
      <ScannerLivePricesProvider
        harvestableNames={harvestableNamesForIntel(rows, systemId)}
      >
        <LocationSection systemId={systemId} />
        <IdentifiedCategories blocks={intelCategoryBlocks(rows, systemId)} />
        <FriendliesSection rows={friendlies} />
      </ScannerLivePricesProvider>
    </div>
  );
}
