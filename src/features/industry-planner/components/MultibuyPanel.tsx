'use client';

import { useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { chipVariants } from '@/components/ui/chip';
import { cn } from '@/components/ui/cn';
import { CopyButton } from '@/components/ui/copy-button';
import { Popover, PopoverRow } from '@/components/ui/popover';
import { SegmentedControl } from '@/components/ui/segmented';
import { computeMultibuyDemand } from '../build-batch';
import { PLANNER_DISCLOSURE_TRIGGER_CLASS } from '../industry-styles';
import {
  assignBuildTiers,
  buildMultibuyText,
  hasOwnedStock,
  multibuyBuildSet,
  multibuyEntries,
  pluralCount,
  tierRowsFromTierOf,
  type NetMode,
} from '../multibuy';
import type { BlueprintStructure } from '../types';
import { KpiHelp } from './kpi-tile';
import { useBuildPlan, usePlannerConfig } from './planner-contexts';

const NET_MODES = ['Total', 'Remaining'] as const satisfies readonly NetMode[];

export function MultibuyPanel({ structure }: { structure: BlueprintStructure }) {

  const {
    runs,
    multibuyMode: mode,
    setMultibuyMode: setMode,
    multibuyUncheckedTiers: uncheckedTiers,
    setMultibuyUncheckedTiers: setUncheckedTiers,
  } = usePlannerConfig();
  const { ledgerMeOpts, ownedAssets } = useBuildPlan();

  const remainingAvailable = hasOwnedStock(ownedAssets);
  const effectiveMode: NetMode = remainingAvailable ? mode : 'Total';

  const tierOf = useMemo(() => assignBuildTiers(structure.tree), [structure.tree]);
  const tierRows = useMemo(() => tierRowsFromTierOf(tierOf), [tierOf]);

  const entries = useMemo(() => {
    const buildSet = multibuyBuildSet(tierOf, uncheckedTiers);
    const buy = computeMultibuyDemand(structure.tree, runs, ledgerMeOpts, {
      buildSet,
      ownedOf:
        effectiveMode === 'Remaining' && ownedAssets
          ? (typeId) => ownedAssets.get(typeId)?.ownedQty ?? 0
          : undefined,
    });
    return multibuyEntries(
      buy,
      (typeId) => structure.materialNames[typeId] ?? `Type ${typeId}`,
      (typeId) => tierOf.get(typeId),
    );
  }, [structure, runs, ledgerMeOpts, tierOf, uncheckedTiers, effectiveMode, ownedAssets]);

  const toggleTier = (depth: number, build: boolean) => {
    const next = new Set(uncheckedTiers);
    if (build) next.delete(depth);
    else next.add(depth);
    setUncheckedTiers(next);
  };

  const copyValue = buildMultibuyText(entries);
  const entryCount = pluralCount(entries.length, 'item', 'items');

  return (
    <Popover
      label="Multibuy export"
      openOnHover={false}
      className="w-[320px]"
      triggerClassName={cn(
        chipVariants({ tone: 'green' }),
        PLANNER_DISCLOSURE_TRIGGER_CLASS,
        'group cursor-pointer gap-1.5 py-1 transition-colors',
      )}
      trigger={
        <>
          Multibuy
          <span className="inline-block text-micro text-muted">▾</span>

        </>

      }
    >
      <div className="flex items-center justify-between">
        <span className="text-label font-semibold uppercase tracking-eyebrow text-isk">
          Multibuy export
        </span>

        <KpiHelp label="What the multibuy export copies">
          <p className="text-body leading-snug text-muted">
            Check the tiers you&rsquo;ll build yourself.
          </p>

          <PopoverRow label="Total">
            the full shopping list, owned stock ignored
          </PopoverRow>

          <PopoverRow label="Remaining">
            the same list minus what your linked characters already own
          </PopoverRow>

        </KpiHelp>

      </div>

      <SegmentedControl
        options={NET_MODES.map((option) => ({
          value: option,
          label: option,
          disabled: option === 'Remaining' && !remainingAvailable,
        }))}
        value={effectiveMode}
        onChange={(next) => setMode(next as NetMode)}
        label="Net mode"
      />
      {!remainingAvailable && (
        <p className="text-micro leading-snug text-muted">
          No owned stock found for this plan — sign in with linked assets to use Remaining.
        </p>

      )}

      <div className="flex flex-col gap-1.5">
        {tierRows.map(([depth, count]) => (
          <label key={depth} className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={!uncheckedTiers.has(depth)}
              onCheckedChange={(build) => toggleTier(depth, build)}
              label={`Build tier ${depth}`}
            />
            <span className="text-ui text-text">Tier {depth}</span>

            <span className="text-micro text-faint">· {pluralCount(count, 'type', 'types')}</span>

          </label>

        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <CopyButton
          value={copyValue}
          displayValue={entryCount}
          feedbackLabel={entryCount}
          unavailableLabel="Unavailable"
          unavailableAnnouncement="Clipboard unavailable for this export"
          disabled={entries.length === 0}
        />
        <span className="font-data text-micro tabular-nums text-muted">
          {effectiveMode}
        </span>

      </div>

    </Popover>

  );
}
