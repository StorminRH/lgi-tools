'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { eyebrow } from '@/components/ui/type-roles';
import { useEntityNames } from '@/components/use-entity-names';
import { systemClassificationReadout } from '@/data/eve-data/system-identity';
import { useTypeNames } from '@/data/eve-data/use-type-names';
import { WORMHOLE_EFFECT_NAME, type WormholeEffect } from '@/data/eve-data/wormhole-contract';
import { ScannerLivePricesProvider, useScannerEstIskSum } from '@/features/wormhole-sites/scanner-live-prices';
import { formatIskShort } from '@/lib/format/isk';
import { formatSigned } from '@/lib/format/number';
import { useUniverseAssets } from '../chain/use-universe-assets';
import { useSignatureRows } from '../signatures/signature-context';
import { useSystemStaticSlots, useWormholeCodexStatus } from '../signatures/use-system-statics';
import { friendlyRows, type PresencePilot } from '../tracking/presence-model';
import { useSystemPresence } from '../tracking/presence-context';
import { IntelIcon, WormholeEffectIcon, type IntelIconKind } from './IntelIcon';
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

const INTEL_HEADING_CLASS = eyebrow({ size: 'micro', tone: 'faint', emphasis: 'strong' });

/** One titled category of the intel body; render it only when it has content. */
function IntelSection({ section, title, children }: {
  readonly section: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section data-intel-section={section} aria-labelledby={headingId} className="flex flex-col gap-1">
      <h3 id={headingId} className={INTEL_HEADING_CLASS}>{title}</h3>
      {children}
    </section>
  );
}

/** A header row that shows or hides its body, with the expand chevron last. */
function DisclosureToggle({ header, className, children, ...group }: {
  readonly header: ReactNode;
  readonly className: string;
  readonly children: ReactNode;
  readonly role?: string;
  readonly 'aria-label'?: string;
  readonly 'data-intel-effect'?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div {...group}>
      <Button variant="bare" aria-expanded={open} aria-controls={id} onClick={() => setOpen((current) => !current)}
        className={cn('pointer-events-auto flex h-auto w-full items-center text-left font-data', className)}>
        {header}
        <IntelIcon kind="expand" className={cn('size-2 text-muted', open && 'rotate-90')} />
      </Button>
      <div id={id} hidden={!open}>{open ? children : null}</div>
    </div>
  );
}

function Disclosure({ icon, label, count, value, children }: {
  readonly icon: IntelIconKind;
  readonly label: string;
  readonly count: number;
  readonly value?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <DisclosureToggle
      className="min-h-7 gap-2 text-ui text-name"
      header={
        <>
          <IntelIcon kind={icon} />
          <span className="flex-1">{label}</span>
          <span className="tabular-nums">{count}</span>
          {value}
        </>
      }
    >
      {children}
    </DisclosureToggle>
  );
}

function EffectModifiers({ effect, whClassId }: { readonly effect: WormholeEffect; readonly whClassId: number }) {
  const { codex, failed } = useWormholeCodexStatus();
  if (codex === null) {
    return (
      <p className="ml-6 py-1 font-data text-micro text-muted">
        {failed ? 'Effect details are unavailable right now.' : 'Loading effects…'}
      </p>
    );
  }
  const entry = codex.effect(effect, whClassId);
  if (entry === null || entry.modifiers.length === 0) {
    return <p className="ml-6 py-1 font-data text-micro text-muted">No effect data for this class.</p>;
  }
  return (
    <ul data-intel-effect-modifiers className="ml-6 flex flex-col gap-0.5 py-1 font-data text-micro">
      {entry.modifiers.map((modifier) => (
        <li key={modifier.attributeId} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-muted">{modifier.label}</span>
          <span className="shrink-0 tabular-nums text-name">{formatSigned(modifier.percent, (magnitude) => `${magnitude}%`)}</span>
        </li>
      ))}
    </ul>
  );
}

function EffectDisclosure({ effect, whClassId }: { readonly effect: WormholeEffect; readonly whClassId: number }) {
  return (
    <DisclosureToggle
      role="group"
      aria-label="Effect"
      data-intel-effect
      className="gap-1.5 text-micro"
      header={
        <>
          <WormholeEffectIcon effect={effect} />
          <span className="flex-1 text-name">{WORMHOLE_EFFECT_NAME[effect]}</span>
        </>
      }
    >
      <EffectModifiers effect={effect} whClassId={whClassId} />
    </DisclosureToggle>
  );
}

function WormholeLocation({ systemId, effect, whClassId }: {
  readonly systemId: number;
  readonly effect: WormholeEffect | null;
  readonly whClassId: number;
}) {
  const slots = useSystemStaticSlots(systemId);
  return (
    <>
      {slots.length > 0 ? (
        <IntelSection section="statics" title="Statics">
          <div role="group" aria-label="Statics" data-intel-statics className="flex flex-wrap items-center gap-x-3 gap-y-1 font-data text-micro">
            <IntelIcon kind="wormhole" />
            {slots.map((slot) => <span key={slot.code} className="text-muted">{slot.code} <span className="text-name">{slot.className}</span></span>)}
          </div>
        </IntelSection>
      ) : null}
      {effect !== null ? (
        <IntelSection section="effect" title="Effect">
          <EffectDisclosure effect={effect} whClassId={whClassId} />
        </IntelSection>
      ) : null}
    </>
  );
}

function KnownSpaceLocation({ systemId }: { readonly systemId: number }) {
  const assets = useUniverseAssets();
  const hubs = assets?.hubJumps(systemId);
  if (hubs === undefined) return null;
  return (
    <IntelSection section="hubs" title="Trade hubs">
      <div data-intel-hubs className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-data text-micro">
        {hubs.map((hub) => (
          <span key={hub.id} className="flex items-center gap-1.5">
            <IntelIcon kind="market" />
            <span className="flex-1 text-name">{hub.name}</span>
            <span className="tabular-nums text-muted" aria-label={hub.jumps === null ? 'Unreachable' : `${hub.jumps} jumps`}>{hub.jumps ?? '—'}</span>
          </span>
        ))}
      </div>
    </IntelSection>
  );
}

function LocationSection({ systemId }: { readonly systemId: number }) {
  const label = useSystemLabel(systemId);
  const whClassId = label?.whClassId ?? null;
  const kind = intelLocationKind({ security: label?.security ?? null, whClassId });
  // A wormhole always has a class; the null check only narrows the type.
  if (kind === 'wormhole' && whClassId !== null) {
    return <WormholeLocation systemId={systemId} effect={label?.effect ?? null} whClassId={whClassId} />;
  }
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
    <IntelSection section="friendlies" title="Pilots">
      <Disclosure icon="pilot" label="Friendlies" count={presence.pilots.length}>
        <FriendlyList pilots={presence.pilots} />
      </Disclosure>
    </IntelSection>
  );
}

function SitesSection({ blocks }: { readonly blocks: readonly IntelCategoryBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <IntelSection section="sites" title="Signatures">
      {blocks.map((block) => <CategoryBlock key={block.bucket} block={block} />)}
    </IntelSection>
  );
}

export function SystemIntelligenceBody({ systemId }: { readonly systemId: number }) {
  const rows = useSignatureRows(systemId);
  const blocks = useMemo(() => intelCategoryBlocks(rows, systemId), [rows, systemId]);
  return (
    <div key={systemId} data-system-intel className="nopan nowheel flex min-w-60 flex-col gap-3 text-left">
      <LocationSection systemId={systemId} />
      <SitesSection blocks={blocks} />
      <FriendliesSection systemId={systemId} />
    </div>
  );
}
