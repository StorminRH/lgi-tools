'use client';

import { useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyButton } from '@/components/ui/copy-button';
import { ChevronDownIcon } from '@/components/ui/icons';
import { Popover, PopoverHeading, PopoverRow } from '@/components/ui/popover';
import { SegmentedControl } from '@/components/ui/segmented';
import { formatCount } from '@/lib/format/number';
import { computeMultibuyDemand } from '../build-batch';
import { PLANNER_TOOL_TRIGGER_CLASS } from '../industry-styles';
import {
  assignBuildTiers,
  buildMultibuyText,
  hasOwnedStock,
  multibuyBuildSet,
  multibuyEntries,
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
  const entryCount = formatCount(entries.length, 'item');

  return (
    <Popover
      label="Multibuy export"
      openOnHover={false}
      align="start"
      className="w-80"
      triggerClassName={PLANNER_TOOL_TRIGGER_CLASS}
      trigger={
        <>
          Multibuy
          <span className="field-chevron inline-flex shrink-0">
            <ChevronDownIcon />
          </span>
        </>
      }
    >
      <div className="flex items-center justify-between">
        <PopoverHeading>Multibuy export</PopoverHeading>
        <KpiHelp label="What the multibuy export copies">
          <p className="text-ui leading-snug text-muted">
            Check the tiers you&rsquo;ll build yourself.
          </p>
          <PopoverRow layout="description" label="Total">
            the full shopping list, owned stock ignored
          </PopoverRow>
          <PopoverRow layout="description" label="Remaining">
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
            <span className="text-micro text-faint">· {formatCount(count, 'type')}</span>
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
