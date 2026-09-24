'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { useEntityNames } from '@/components/use-entity-names';
import { systemClassificationReadout } from '@/data/eve-data/system-identity';
import { useTypeNames } from '@/data/eve-data/use-type-names';
import { ScannerLivePricesProvider, useScannerEstIskSum } from '@/features/wormhole-sites/scanner-live-prices';
import { formatIskShort } from '@/lib/format/isk';
import { useUniverseAssets } from '../chain/use-universe-assets';
import { useSignatureRows } from '../signatures/signature-context';
import { signatureCounts } from '../signatures/signature-model';
import { useSystemStaticSlots } from '../signatures/use-system-statics';
import { friendlyRows, type PresencePilot } from '../tracking/presence-model';
import { useSystemPresence } from '../tracking/presence-context';
import { IntelIcon, type IntelIconKind } from './IntelIcon';
import { INTEL_CATEGORY_LABEL, intelCategoryBlocks, intelLocationKind, type IntelCategoryBlock } from './intel-model';
import { useSystemLabel } from './use-system-label';

export function SystemTitleAccessory({ systemId }: { readonly systemId: number }) {
  const label = useSystemLabel(systemId);
  const classification = systemClassificationReadout({ security: label?.security ?? null, whClassId: label?.whClassId ?? null });
  if (classification === null) return null;
  return (
    <span data-identity-readout>
      {' '}<span data-identity-classification className={cn('tabular-nums', classification.tone)}>{classification.label}</span>
    </span>
  );
}

function Disclosure({ icon, label, count, value, children }: {
  readonly icon: IntelIconKind;
  readonly label: string;
  readonly count: number;
  readonly value?: ReactNode;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <Button variant="bare" aria-expanded={open} aria-controls={id} onClick={() => setOpen((current) => !current)}
        className="pointer-events-auto flex h-auto min-h-7 w-full items-center gap-2 text-left font-data text-ui text-name">
        <IntelIcon kind={icon} />
        <span className="flex-1">{label}</span>
        <span className="tabular-nums">{count}</span>
        {value}
        <IntelIcon kind="expand" className={cn('size-2 text-muted', open && 'rotate-90')} />
      </Button>
      <div id={id} hidden={!open}>{open ? children : null}</div>
    </div>
  );
}

function WormholeLocation({ systemId }: { readonly systemId: number }) {
  const slots = useSystemStaticSlots(systemId);
  if (slots.length === 0) return null;
  return (
    <div role="group" aria-label="Statics" data-intel-statics className="flex flex-wrap items-center gap-x-3 gap-y-1 font-data text-micro">
      <IntelIcon kind="wormhole" />
      {slots.map((slot) => <span key={slot.code} className="text-muted">{slot.code} <span className="text-name">{slot.className}</span></span>)}
    </div>
  );
}

function KnownSpaceLocation({ systemId }: { readonly systemId: number }) {
  const assets = useUniverseAssets();
  const hubs = assets?.hubJumps(systemId);
  if (hubs === undefined) return null;
  return (
    <div data-intel-hubs className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-data text-micro">
      {hubs.map((hub) => (
        <span key={hub.id} className="flex items-center gap-1.5">
          <IntelIcon kind="market" />
          <span className="flex-1 text-name">{hub.name}</span>
          <span className="tabular-nums text-muted" aria-label={hub.jumps === null ? 'Unreachable' : `${hub.jumps} jumps`}>{hub.jumps ?? '—'}</span>
        </span>
      ))}
    </div>
  );
}

function LocationSection({ systemId }: { readonly systemId: number }) {
  const label = useSystemLabel(systemId);
  const kind = intelLocationKind({ security: label?.security ?? null, whClassId: label?.whClassId ?? null });
  if (kind === 'wormhole') return <WormholeLocation systemId={systemId} />;
  if (kind === 'k-space') return <KnownSpaceLocation systemId={systemId} />;
  return null;
}

function SiteValue({ names }: { readonly names: readonly (string | null)[] }) {
  const isk = useScannerEstIskSum(names);
  return <span className={cn('min-w-12 text-right text-micro tabular-nums', isk === null ? 'text-muted' : 'text-isk')}>{formatIskShort(isk)}</span>;
}

function CategoryBlock({ block }: { readonly block: IntelCategoryBlock }) {
  const names = useMemo(() => block.rows.map((row) => row.name), [block.rows]);
  const knownNames = useMemo(() => names.filter((name) => name !== null), [names]);
  return (
    <div data-intel-category={block.bucket}>
      <Disclosure icon={block.bucket} label={INTEL_CATEGORY_LABEL[block.bucket]} count={block.rows.length}
        value={block.bucket === 'harvestables' ? (
          <ScannerLivePricesProvider harvestableNames={knownNames}><SiteValue names={names} /></ScannerLivePricesProvider>
        ) : block.bucket === 'combat' ? <SiteValue names={names} /> : <span className="min-w-12" aria-hidden="true" />}>
        <ul className="mb-1 ml-6 flex flex-col gap-0.5 font-data text-micro text-muted">
          {block.rows.map((row) => <li key={row.key} className="break-words">{row.name ?? row.signatureId}</li>)}
        </ul>
      </Disclosure>
    </div>
  );
}

function FriendlyList({ pilots }: { readonly pilots: readonly PresencePilot[] }) {
  const names = useEntityNames(pilots.map((pilot) => pilot.characterId));
  const ships = useTypeNames(pilots.flatMap((pilot) => !pilot.docked && pilot.shipTypeId !== null ? [pilot.shipTypeId] : []));
  return (
    <ul className="ml-6 flex flex-col gap-1 py-1 font-data text-ui">
      {friendlyRows(pilots, names, ships).map((row) => (
        <li key={row.characterId} data-presence-pilot={row.characterId} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-name">{row.label}</span>
          <span className="max-w-1/2 shrink-0 truncate text-muted">{row.word === 'Docked' ? 'Docked' : row.shipName ?? '—'}</span>
        </li>
      ))}
    </ul>
  );
}

function FriendliesSection({ systemId }: { readonly systemId: number }) {
  const presence = useSystemPresence(systemId);
  if (presence === null || presence.pilots.length === 0) return null;
  return (
    <section data-intel-section="friendlies" className="border-t border-border-idle pt-1">
      <Disclosure icon="pilot" label="Friendlies" count={presence.pilots.length}>
        <FriendlyList pilots={presence.pilots} />
      </Disclosure>
    </section>
  );
}

export function SystemIntelligenceBody({ systemId }: { readonly systemId: number }) {
  const rows = useSignatureRows(systemId);
  const blocks = useMemo(() => intelCategoryBlocks(rows, systemId), [rows, systemId]);
  const counts = signatureCounts(rows, systemId);
  return (
    <div key={systemId} data-system-intel className="nopan nowheel flex min-w-60 flex-col gap-2 text-left">
      <LocationSection systemId={systemId} />
      <section data-intel-section="sites">
        {blocks.length > 0 ? blocks.map((block) => <CategoryBlock key={block.bucket} block={block} />) : (
          <p className="font-data text-micro text-muted">{counts.signatures} signatures · {counts.anomalies} anomalies</p>
        )}
      </section>
      <FriendliesSection systemId={systemId} />
    </div>
  );
}
