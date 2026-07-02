'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { Pill } from '@/components/ui/pill';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { formatSec } from '@/data/eve-data/systems-search';
import { hostsReactions } from '../structure-factors';
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
// structure (no double-select). Reactions build here; a lone refinery here also does
// the manufacturing chain (the smart routing in structureFactorsFor). A corp refinery
// deduce-locks its own system; a custom one scales against the row's picked system.
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

  // Picking a refinery: a corp refinery carries its home system — deduce-and-lock it.
  // A custom (or cleared) pick keeps a USER-picked system (so system-first and
  // refinery-first both work), but drops a system the OUTGOING corp refinery had
  // deduce-locked — that one was never the user's choice, and leaving it would render
  // a ghost pick beside an empty refinery select.
  const onSelectRefinery = useCallback(
    (structure: AvailableStructure | null) => {
      const prevDeduced = reactionStructure?.source === 'corp' && reactionStructure.systemId !== null;
      setReactionStructure(structure);
      if (structure?.source === 'corp' && structure.systemId !== null) {
        const sys = systems.find((s) => s.id === structure.systemId);
        setReactionSystem(
          sys ? { systemId: sys.id, systemName: sys.name, security: sys.security } : null,
        );
      } else if (prevDeduced) {
        setReactionSystem(null);
      }
    },
    [systems, reactionStructure, setReactionStructure, setReactionSystem],
  );

  if (availableStructures === null) return null;

  // Refineries only, excluding the build structure (no double-select).
  const refineries = availableStructures.filter(
    (s) => hostsReactions(s.groupId) && s.id !== selectedStructure?.id,
  );

  const lockedCorp =
    reactionStructure?.source === 'corp' && reactionStructure.systemId !== null ? reactionStructure : null;
  const deducedSystem = lockedCorp ? systems.find((s) => s.id === lockedCorp.systemId) ?? null : null;

  return (
    <div className="flex flex-col gap-2">
      <ReactionSystemRow
        lockedTo={lockedCorp?.name ?? null}
        deducedSystem={deducedSystem}
        reactionSystem={reactionSystem}
        setReactionSystem={setReactionSystem}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-[64px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted">Refinery</span>
        {refineries.length === 0 ? (
          <Link
            href="/structures"
            className="self-start text-[10px] uppercase tracking-[0.12em] text-muted hover:text-text"
          >
            Add a refinery →
          </Link>
        ) : (
          <select
            value={reactionStructure ? `structure:${reactionStructure.id}` : ''}
            onChange={(e) => {
              const v = e.target.value;
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
            {refineries.map((s) => (
              <option key={s.id} value={`structure:${s.id}`}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <StructureBonusPills readout={reactionStructureReadout} />
      </div>
    </div>
  );
}
