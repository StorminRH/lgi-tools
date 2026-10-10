'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { TypeIcon } from '@/components/type-icon';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { LivePrice } from '@/components/ui/live-price';
import { SidePanel } from '@/components/ui/side-panel';
import { StatFigure } from '@/components/ui/stat-figure';
import { eyebrow } from '@/components/ui/type-roles';
import { useSystemSearch } from '@/components/use-system-search';
import { activityLabel } from '@/data/eve-data/constants';
import { securityStatusTextClass } from '@/data/eve-data/security';
import { formatSec } from '@/data/eve-data/systems-search';
import { nodeImage } from '@/data/eve-data/type-images';
import { formatIsk } from '@/lib/format/isk';
import { formatQuantity } from '@/lib/format/number';
import { isEfficiencyEligible, unitPriceMap } from '../build-plan-view';
import { componentSheet, type ComponentInputRow, type ComponentSheet } from '../component-sheet-view';
import { nodeMeState } from '../me-overrides';
import { nodeTeState } from '../te-overrides';
import { typeName } from '../type-name';
import type { BlueprintStructure } from '../types';
import { GemIcon, HourglassIcon, MeField, TeField } from './MeAdjuster';
import { useBuildPlan, useBuildSetup, useMarketData } from './planner-contexts';
import { UnpricedInputs } from './UnpricedInputs';

function Steppers({ sheet }: { sheet: ComponentSheet }) {
  const plan = useBuildPlan();
  const bp = sheet.blueprintTypeId;
  if (!isEfficiencyEligible(bp, sheet.label)) return null;
  const row = (icon: ReactNode, field: ReactNode) => (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="inline-flex size-3.5 shrink-0">
        {icon}
      </span>
      {field}
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      {row(
        <GemIcon state={nodeMeState(plan.ownedMe?.get(bp), plan.meOverrides.get(bp))} />,
        <MeField
          blueprintTypeId={bp}
          name={sheet.name}
          ownedMe={plan.ownedMe}
          meOverrides={plan.meOverrides}
          setMeOverride={plan.setMeOverride}
          resetMeOverride={plan.resetMeOverride}
          boxed
        />,
      )}
      {row(
        <HourglassIcon state={nodeTeState(plan.ownedTe?.get(bp), plan.teOverrides.get(bp))} />,
        <TeField
          blueprintTypeId={bp}
          name={sheet.name}
          ownedTe={plan.ownedTe}
          teOverrides={plan.teOverrides}
          setTeOverride={plan.setTeOverride}
          resetTeOverride={plan.resetTeOverride}
          boxed
        />,
      )}
    </div>
  );
}

function Identity({ sheet }: { sheet: ComponentSheet }) {
  const activity = sheet.activityId === null ? null : activityLabel(sheet.activityId);
  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-data text-micro uppercase tracking-label text-muted">
        {sheet.label && (
          <>
            <span>{sheet.label}</span>
            <span aria-hidden className="text-faint">·</span>
          </>
        )}
        {activity !== null && activity !== sheet.label && (
          <>
            <span className="text-tone-blue">{activity}</span>
            <span aria-hidden className="text-faint">·</span>
          </>
        )}
        <span>{formatQuantity(sheet.batch)} per run</span>
      </p>
      <div className="flex items-center gap-5">
        <TypeIcon
          {...nodeImage(sheet.blueprintTypeId, sheet.typeId)}
          size={64}
          alt={sheet.name}
          mono={sheet.name.slice(0, 2)}
          className="rounded-card shadow-cta-glow"
        />
        <Steppers sheet={sheet} />
      </div>
    </div>
  );
}

/** Where the profile runs this job, and who runs it. */
function JobRoute({ blueprintTypeId }: { blueprintTypeId: number }) {
  const { profile, profilePlan } = useBuildSetup();
  const { systems } = useSystemSearch();
  if (!profile || !profilePlan) return null;
  const route = profilePlan.routeOf(blueprintTypeId);
  const builder = profile.document.members.find((m) => m.characterId === route.characterId) ?? null;
  const system = systems.find((s) => s.id === route.facility?.systemId) ?? null;
  if (!route.facility && !builder) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {route.facility && (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-ui text-nav text-name">{route.facility.name}</span>
          {system && (
            <span className="font-data text-micro text-muted">
              {system.name} <span className={securityStatusTextClass(system.security)}>{formatSec(system.security)}</span>
            </span>
          )}
        </div>
      )}
      {builder && (
        <div className="flex items-center gap-2">
          <CharacterPortrait characterId={builder.characterId} name={builder.name} size={28} />
          <span className="font-ui text-nav text-name">{builder.name}</span>
        </div>
      )}
    </div>
  );
}

function InputRow({ row, onOpen, refreshing }: { row: ComponentInputRow; onOpen: (typeId: number) => void; refreshing: boolean }) {
  const { ledger } = useBuildPlan();
  const content = (
    <>
      <TypeIcon
        {...nodeImage(ledger.builds.get(row.typeId)?.blueprintTypeId, row.typeId)}
        size={32}
        alt=""
        mono={row.name.slice(0, 2)}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="truncate font-data text-ui text-name">{row.name}</span>
        {row.label && <span className="truncate font-data text-label uppercase tracking-label text-muted">{row.label}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 font-data tabular-nums">
        <span className="text-ui text-name">{formatQuantity(row.quantity)}</span>
        <LivePrice value={formatIsk(row.value)} pending={refreshing} className="text-micro text-isk" />
      </span>
      {row.buildable && <span aria-hidden className="text-muted">›</span>}
    </>
  );
  const rowClass = 'flex w-full items-center gap-3 rounded-ctl px-2 py-2';
  return row.buildable ? (
    <li>
      <Button variant="bare" aria-label={`Open ${row.name}`} onClick={() => onOpen(row.typeId)} className={cn(rowClass, 'cursor-pointer hover:bg-row-hover')}>
        {content}
      </Button>
    </li>
  ) : (
    <li className={rowClass}>{content}</li>
  );
}

/** The job's install fee where the profile runs it; amber where it counts an unpriced input as nothing. */
function InstallFee({ fee, refreshing }: { fee: NonNullable<ComponentSheet['installFee']>; refreshing: boolean }) {
  const { feesPending, locationFailed } = useBuildSetup();
  const status = fee.systemId === null
    ? 'Choose an installation system to calculate fees.'
    : feesPending
      ? 'Loading installation fees…'
      : locationFailed
        ? 'Installation fees could not be loaded. Retry in build setup.'
        : null;
  return (
    <div className="flex flex-col gap-0.5 px-2">
      <div className="flex items-baseline justify-between">
        <span className={eyebrow({ size: 'micro', tone: 'muted' })}>Install fee</span>
        <LivePrice
          value={formatIsk(fee.value)}
          pending={refreshing}
          className={cn('font-data text-ui', status === null && fee.unpriced.length > 0 ? 'text-dps-mid' : 'text-isk')}
        />
      </div>
      {status === null
        ? <UnpricedInputs names={fee.unpriced} className="self-end" />
        : <p className="self-end text-right font-data text-micro text-muted">{status}</p>}
    </div>
  );
}

function Sheet({
  sheet,
  previous,
  onOpen,
  onBack,
  onLeave,
}: {
  sheet: ComponentSheet;
  previous: string | null;
  onOpen: (typeId: number) => void;
  onBack: () => void;
  onLeave: () => void;
}) {
  const { ownedAssets } = useBuildPlan();
  const { refreshing } = useMarketData();
  const owned = ownedAssets?.get(sheet.typeId)?.ownedQty ?? null;
  const cheaper =
    sheet.buildPerUnit === null || sheet.buyPerUnit === null ? null : sheet.buildPerUnit <= sheet.buyPerUnit ? 'build' : 'buy';
  return (
    <div className="flex flex-col gap-6 pb-2">
      {previous !== null && (
        <Button variant="bare" onClick={onBack} className="cursor-pointer self-start font-ui text-ui text-muted hover:text-name">
          ‹ {previous}
        </Button>
      )}
      <Identity sheet={sheet} />
      <dl className="grid grid-cols-3 gap-4">
        <StatFigure label="Needed" className="gap-1">{formatQuantity(sheet.required)}</StatFigure>
        <StatFigure label="Runs" className="gap-1">
          {formatQuantity(sheet.runs)}
          <span className="ml-1.5 text-micro text-muted">× {formatQuantity(sheet.batch)}</span>
        </StatFigure>
        <StatFigure label="Owned" tone={owned !== null && owned >= sheet.required ? 'text-isk' : undefined} className="gap-1">
          {formatQuantity(owned)}
        </StatFigure>
      </dl>
      <dl className="grid grid-cols-2 gap-4">
        <StatFigure label="Build · per unit" tone={cheaper === 'build' ? 'text-isk' : undefined} className="gap-1">
          <LivePrice value={formatIsk(sheet.buildPerUnit)} pending={refreshing} />
        </StatFigure>
        <StatFigure label="Buy · per unit" tone={cheaper === 'buy' ? 'text-isk' : undefined} className="gap-1">
          <LivePrice value={formatIsk(sheet.buyPerUnit)} pending={refreshing} />
        </StatFigure>
      </dl>
      <JobRoute blueprintTypeId={sheet.blueprintTypeId} />
      {sheet.installFee && <InstallFee fee={sheet.installFee} refreshing={refreshing} />}
      <section aria-label="Inputs" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-2">
          <h3 className={eyebrow({ size: 'micro', tone: 'muted' })}>Inputs</h3>
          <LivePrice value={formatIsk(sheet.buildCost)} pending={refreshing} className="font-data text-ui text-isk" />
        </div>
        <ul className="flex flex-col divide-y divide-border-soft">
          {sheet.inputs.map((row) => (
            <InputRow key={row.typeId} row={row} onOpen={onOpen} refreshing={refreshing} />
          ))}
        </ul>
      </section>
      <Link
        href={`/industry/${sheet.blueprintTypeId}`}
        // Opening the drawer is the intent: carry the blueprint's cached plan ahead of the click.
        prefetch
        transitionTypes={['industry-tab']}
        onClick={onLeave}
        className={cn(buttonVariants({ variant: 'primary' }), 'self-start')}
      >
        Open in planner
      </Link>
    </div>
  );
}

/**
 * One built item's job, condensed from the planner: its research, the
 * runs it takes, what it costs against buying, where and by whom the
 * profile builds it, and its inputs, each built one a step deeper.
 */
export function ComponentDrawer({
  structure,
  stack,
  onStackChange,
}: {
  structure: BlueprintStructure;
  /** The jobs opened, the shown one last. */
  stack: readonly number[];
  onStackChange: (next: number[]) => void;
}) {
  const { ledger, ledgerMeOpts } = useBuildPlan();
  const { pricing } = useMarketData();
  // Keep the last job on screen while the panel slides away.
  const [shownId, setShownId] = useState<number | null>(null);
  const topId = stack.at(-1) ?? null;
  if (topId !== null && topId !== shownId) setShownId(topId);
  const unitPriceOf = useMemo(() => unitPriceMap(pricing), [pricing]);
  const id = topId ?? shownId;
  const sheet =
    id === null
      ? null
      : componentSheet(structure, id, ledger, {
          unitPriceOf,
          structureMeFactorOf: ledgerMeOpts.structureMeFactorOf,
          jobFee: pricing?.net?.componentJobs?.jobs.find((job) => job.typeId === id),
        });
  const previousId = stack.length > 1 ? stack[stack.length - 2]! : null;
  const previous = previousId === null ? null : typeName(structure, previousId);
  return (
    <SidePanel open={stack.length > 0} onOpenChange={(open) => !open && onStackChange([])} title={sheet?.name ?? ''}>
      {sheet && (
        <Sheet
          sheet={sheet}
          previous={previous}
          onOpen={(typeId) => onStackChange([...stack, typeId])}
          onBack={() => onStackChange(stack.slice(0, -1))}
          onLeave={() => onStackChange([])}
        />
      )}
    </SidePanel>
  );
}
