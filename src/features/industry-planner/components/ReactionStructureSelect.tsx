'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { Pill } from '@/components/ui/pill';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { formatSec } from '@/data/eve-data/systems-search';
import { hostsReactions } from '../structure-factors';
import { isSystemLocked, visibleStructuresForSlot } from '../structure-slots';
import type { AvailableStructure } from '../types';
import { usePricing, type SelectedReactionSystem } from './PricingProvider';
import { StructureBonusPills } from './structure-bonus-pills';
import { useSystemSearch, type SystemErr, type SystemParams } from './use-system-search';

// The reaction group's SYSTEM row (3.7.12.2), ALWAYS visible — the mirror of the
// "Build at" row above it, so the reaction side has its own independent system at all
// times, pickable before or after the refinery. SECURITY-ONLY — reactions carry no
// install fee, so this loads nothing; it just supplies the security the refinery's
// reaction rigs scale against. `lockedTo` carries a corp refinery's name when its home
// system deduce-locks the row.
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
    <div className="flex items-center gap-2 flex-wrap">
      <span className="w-[64px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted">React at</span>
      {lockedTo ? (
        deducedSystem ? (
          <>
            <Pill tone="blue">
              {deducedSystem.name} {formatSec(deducedSystem.security)}
            </Pill>
            <span className="text-[10px] tracking-[0.12em] uppercase text-muted">↳ locked to {lockedTo}</span>
          </>
        ) : (
          <span className="text-[10px] tracking-[0.12em] uppercase text-muted">System unavailable</span>
        )
      ) : reactionSystem ? (
        <>
          <Pill tone="blue">
            {reactionSystem.systemName} {formatSec(reactionSystem.security)}
          </Pill>
          <button
            type="button"
            onClick={() => setReactionSystem(null)}
            className="text-[10px] tracking-[0.12em] uppercase text-muted hover:text-text"
          >
            Clear
          </button>
        </>
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
            hint="Pick the system reactions run in"
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
  const onSelectRefinery = useCallback(
    (structure: AvailableStructure | null) => {
      const prevLocked = reactionStructure !== null && isSystemLocked(reactionStructure);
      setReactionStructure(structure);
      if (structure && isSystemLocked(structure)) {
        const sys = systems.find((s) => s.id === structure.systemId);
        setReactionSystem(
          sys ? { systemId: sys.id, systemName: sys.name, security: sys.security } : null,
        );
      } else if (prevLocked) {
        setReactionSystem(null);
      }
    },
    [systems, reactionStructure, setReactionStructure, setReactionSystem],
  );

  if (availableStructures === null) return null;

  const lockedRefinery =
    reactionStructure !== null && isSystemLocked(reactionStructure) ? reactionStructure : null;
  const deducedSystem = lockedRefinery ? systems.find((s) => s.id === lockedRefinery.systemId) ?? null : null;

  // Refineries only, excluding the build structure (no double-select), then
  // segmented against the row's effective system (a lock's own system wins).
  const effectiveSystemId = lockedRefinery?.systemId ?? reactionSystem?.systemId ?? null;
  const refineries = visibleStructuresForSlot(
    availableStructures.filter((s) => hostsReactions(s.groupId) && s.id !== selectedStructure?.id),
    effectiveSystemId,
    reactionStructure?.id ?? null,
  );
  const corp = refineries.filter((s) => s.source === 'corp');
  const custom = refineries.filter((s) => s.source === 'custom');

  return (
    <div className="flex flex-col gap-2">
      <ReactionSystemRow
        lockedTo={lockedRefinery?.name ?? null}
        deducedSystem={deducedSystem}
        reactionSystem={reactionSystem}
        setReactionSystem={setReactionSystem}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-[64px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted">Refinery</span>
        <select
          value={reactionStructure ? `structure:${reactionStructure.id}` : ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'add-custom') {
              router.push('/structures');
              return;
            }
            onSelectRefinery(
              v.startsWith('structure:')
                ? refineries.find((s) => s.id === v.slice('structure:'.length)) ?? null
                : null,
            );
          }}
          aria-label="Reaction refinery"
          className="w-[260px] shrink-0 border border-border bg-bg px-2 py-1 font-mono text-[11px] text-text focus:border-border-active focus:outline-none"
        >
          <option value="">— none —</option>
          {corp.length > 0 && (
            <optgroup label="Corp structures">
              {corp.map((s) => (
                <option key={s.id} value={`structure:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
          {custom.length > 0 && (
            <optgroup label="Custom structures">
              {custom.map((s) => (
                <option key={s.id} value={`structure:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
          <option value="add-custom">+ Add custom structure…</option>
        </select>
        <StructureBonusPills readout={reactionStructureReadout} />
      </div>
    </div>
  );
}
