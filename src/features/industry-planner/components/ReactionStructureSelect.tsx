'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { Select } from '@/components/ui/select';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { facilityValueFor, parseFacilityValue, structureById } from '../facility-value';
import { deriveReactionSlotView, lockTransition } from '../structure-slots';
import type { AvailableStructure } from '../types';
import { usePricing, type SelectedReactionSystem } from './PricingProvider';
import { SelectedSystemBox } from './SelectedSystemBox';
import { structureOptionGroups } from './structure-options';
import { StructureBonusReadout } from './structure-bonus-readout';
import { useSystemSearch, type SystemErr, type SystemParams } from '@/components/use-system-search';

// The reaction group's SYSTEM row (3.7.12.2), ALWAYS visible — the mirror of the
// Manufacturing group's row beside it, so the reaction side has its own independent
// system at all times, pickable before or after the refinery. It supplies the
// security the refinery's reaction rigs scale against, and for a REACTION
// blueprint it also keys the provider's reaction build-location fetch (3.7.13.3)
// so the top job fees against this system's reaction index. `lockedTo` carries a locked
// refinery's name when its home system deduce-locks the row. Every state renders
// at the same fixed 260×30 box, so picking never shifts the hero's plane.
function ReactionSystemRow({
  lockedTo,
  deducedSystem,
  reactionSystem,
  setReactionSystem,
}: {
  lockedTo: string | null;
  deducedSystem: { name: string; security: number | null } | null;
  reactionSystem: SelectedReactionSystem | null;
  setReactionSystem: (system: SelectedReactionSystem | null) => void;
}) {
  const { parse, suggest } = useSystemSearch();
  const onSubmit = useCallback(
    ({ system }: SystemParams) =>
      setReactionSystem({ systemId: system.id, systemName: system.name, security: system.security }),
    [setReactionSystem],
  );

  return (
    <div className="flex items-center gap-2">
      <span className="w-[64px] shrink-0 text-label uppercase tracking-[0.12em] text-muted">System</span>
      {lockedTo ? (
        deducedSystem ? (
          <SelectedSystemBox name={deducedSystem.name} security={deducedSystem.security} locked={lockedTo} />
        ) : (
          <div className="flex h-[30px] w-[260px] shrink-0 items-center border border-border bg-bg px-2">
            <span className="truncate text-label uppercase tracking-[0.12em] text-muted">System unavailable</span>
          </div>
        )
      ) : reactionSystem ? (
        <SelectedSystemBox
          name={reactionSystem.systemName}
          security={reactionSystem.security}
          onClear={() => setReactionSystem(null)}
        />
      ) : (
        <div className="w-[260px] max-w-full">
          <TerminalSearch<SystemParams, SystemErr>
            initialValue=""
            placeholder="Reaction system — type a name"
            parse={parse}
            suggest={suggest}
            errorMessage={() => 'No system matches that name.'}
            onSubmit={onSubmit}
            onClear={() => setReactionSystem(null)}
            errorLabel="System"
          />
        </div>
      )}
    </div>
  );
}

// The reaction location group (3.7.12.2) — the SECOND of the two always-visible
// location groups, stacked below the build group and mirroring its shape: a system row
// ("React at") over a facility row ("Refinery"), both shown at all times. It offers
// the caller's refineries (custom + corp) EXCEPT the one already picked as the build
// structure (no double-select), per-source segmented against the row's system
// (3.7.13.2: a locked refinery — corp or pinned custom — shows only in its own
// system's list). Reactions build here; a lone refinery here also does the
// manufacturing chain (the smart routing in structureFactorsFor). A locked refinery
// deduce-locks its own system; a portable one scales against the row's picked system.
export function ReactionStructureSelect() {
  const {
    availableStructures,
    selectedStructure,
    reactionStructure,
    setReactionStructure,
    reactionSystem,
    setReactionSystem,
    reactionStructureReadout,
  } = usePricing();
  const { systems } = useSystemSearch();
  const router = useRouter();

  // Picking a refinery: a LOCKED refinery (corp, or a pinned custom) carries its
  // home system — deduce-and-lock it (synchronous: the row is security-only, no
  // fetch). A portable (or cleared) pick keeps a USER-picked system (so
  // system-first and refinery-first both work), but drops a system the OUTGOING
  // locked refinery had deduced — that one was never the user's choice, and
  // leaving it would render a ghost pick beside an empty refinery select.
  // Picking a refinery: a LOCKED refinery (corp, or a pinned custom) carries its
  // home system — deduce-and-lock it (synchronous: the row is security-only, no
  // fetch). A portable (or cleared) pick keeps a USER-picked system (so
  // system-first and refinery-first both work), but drops a system the OUTGOING
  // locked refinery had deduced — a ghost pick beside an empty refinery select.
  // The shared lockTransition classifies the change; the reaction slot dispatches
  // its own setter (lock → the deduced system; unlock/unresolved → clear it).
  const onSelectRefinery = useCallback(
    (structure: AvailableStructure | null) => {
      const transition = lockTransition(reactionStructure, structure, systems);
      setReactionStructure(structure);
      if (transition.kind === 'lock') {
        const s = transition.system;
        setReactionSystem({ systemId: s.id, systemName: s.name, security: s.security });
      } else if (transition.kind !== 'none') {
        setReactionSystem(null);
      }
    },
    [systems, reactionStructure, setReactionStructure, setReactionSystem],
  );

  if (availableStructures === null) return null;

  // Refineries only, excluding the build structure (no double-select), then
  // segmented against the row's effective system (a lock's own system wins).
  const { deducedSystem, refineries, taxPct, lockedTo } = deriveReactionSlotView(
    reactionStructure,
    availableStructures,
    selectedStructure,
    systems,
    reactionSystem,
  );
  return (
    // FIXED group width, mirroring the Manufacturing group — see its note: an
    // unconstrained group would widen to a long readout and rewrap the plane.
    <div className="flex w-[332px] flex-col justify-center gap-1.5">
      {/* The group header carries the bonus readout on its own fixed-height
          line, right of the title. */}
      <div className="flex min-h-4 min-w-0 items-center gap-2.5">
        <span className="shrink-0 font-mono text-label uppercase tracking-[0.16em] text-text">Reactions</span>
        <StructureBonusReadout readout={reactionStructureReadout} taxPct={taxPct} />
      </div>
      <ReactionSystemRow
        lockedTo={lockedTo}
        deducedSystem={deducedSystem}
        reactionSystem={reactionSystem}
        setReactionSystem={setReactionSystem}
      />
      <div className="flex items-center gap-2">
        <span className="w-[64px] shrink-0 text-label uppercase tracking-[0.12em] text-muted">Station</span>
        <Select
          value={facilityValueFor(reactionStructure, null)}
          onValueChange={(v) => {
            const sel = parseFacilityValue(v);
            if (sel.kind === 'add-custom') {
              router.push('/structures');
              return;
            }
            onSelectRefinery(sel.kind === 'structure' ? structureById(refineries, sel.id) : null);
          }}
          items={[
            { value: '', label: '— none —' },
            ...structureOptionGroups(refineries),
            { value: 'add-custom', label: '+ Add custom structure…' },
          ]}
          ariaLabel="Reaction refinery"
          className="h-[30px] w-[260px] shrink-0"
        />
      </div>
    </div>
  );
}
