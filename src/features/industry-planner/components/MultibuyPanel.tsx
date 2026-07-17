'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverRow } from '@/components/ui/popover';
import { SegmentedControl } from '@/components/ui/segmented';
import { toast } from '@/components/ui/toast';
import { computeMultibuyDemand } from '../build-batch';
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

// The multibuy export (3.7.22.1): a click-popover panel in the build-plan header
// that copies the in-game Multibuy shopping string. One Net toggle — Total (build
// the checked chain from scratch, owned stock ignored) | Remaining (the same
// minus owned) — plus per-tier scope checkboxes over the min-depth tier cut
// (assignBuildTiers). Always net: both modes run the same cascade
// (computeMultibuyDemand), fed the EXACT ME inputs of the shared ledger
// (ledgerMeOpts), so the list can never disagree with the build plan. Read-only:
// nothing here feeds back into pricing, times, or the displayed materials.

const NET_MODES = ['Total', 'Remaining'] as const satisfies readonly NetMode[];

/** Renders tier selection and the resulting EVE multibuy text without owning build consolidation. */
export function MultibuyPanel({ structure }: { structure: BlueprintStructure }) {
  // The panel's scope state (net mode + unchecked tiers) is provider-owned
  // since 3.7.23.1 (template state); Remaining stays the default for anyone
  // with owned stock (effectiveMode falls back to Total when there is none —
  // signed out, no scopes, or empty hangars).
  const {
    runs,
    multibuyMode: mode,
    setMultibuyMode: setMode,
    multibuyUncheckedTiers: uncheckedTiers,
    setMultibuyUncheckedTiers: setUncheckedTiers,
  } = usePlannerConfig();
  const { ledgerMeOpts, ownedAssets } = useBuildPlan();

  // Remaining needs owned stock to net. The overlay settles to an EMPTY map for
  // a logged-out caller or one owning none of this plan's items (null = not
  // settled yet) — in every no-stock case Remaining would equal Total, so it's
  // disabled with a hint rather than offered as a distinction without one.
  const remainingAvailable = hasOwnedStock(ownedAssets);
  const effectiveMode: NetMode = remainingAvailable ? mode : 'Total';

  // Every buildable's home tier (min occurrence depth) and the checkbox rows:
  // one per tier that owns at least one buildable, with its type count.
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

  const copy = () => {
    const text = buildMultibuyText(entries);
    if (!navigator.clipboard) {
      toast.error('Clipboard unavailable — copy needs a secure (https) context');
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => toast(`Copied ${pluralCount(entries.length, 'item', 'items')} to clipboard`),
      () => toast.error('Copy failed — check the browser clipboard permission'),
    );
  };

  return (
    <Popover
      label="Multibuy export"
      openOnHover={false}
      className="w-[320px]"
      triggerClassName="group inline-flex cursor-pointer items-baseline gap-2"
      trigger={
        <span className="inline-flex items-baseline gap-2 font-mono text-label font-semibold uppercase tracking-display text-muted group-hover:text-name">
          <span className="tracking-normal text-isk">{'//'}</span>
          Multibuy
          <span className="inline-block text-micro text-muted">▾</span>
        </span>
      }
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-label font-semibold uppercase tracking-display text-isk">
          Multibuy export
        </span>
        <KpiHelp label="What the multibuy export copies">
          <p className="font-body text-body leading-snug text-muted">
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
            <span className="font-mono text-ui text-text">Tier {depth}</span>
            <span className="font-mono text-micro text-faint">· {pluralCount(count, 'type', 'types')}</span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="primary" size="sm" onClick={copy} disabled={entries.length === 0}>
          Copy
        </Button>
        <span className="font-mono text-micro tabular-nums text-muted">
          {pluralCount(entries.length, 'item', 'items')} · {effectiveMode}
        </span>
      </div>
    </Popover>
  );
}
