'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@/components/ui/cn';
import { Select } from '@/components/ui/select';
import { SectionLabel } from '@/components/ui/section-label';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { facilityValueFor, parseFacilityValue, structureById } from '../facility-value';
import {
  HERO_LOCATION_CONTROL_WELL_CLASS,
  HERO_LOCATION_GROUP_CLASS,
  HERO_LOCATION_ROW_CLASS,
} from '../industry-styles';
import { deriveReactionSlotView, lockTransition } from '../structure-slots';
import type { AvailableStructure } from '../types';
import { useBuildSetup, type SelectedReactionSystem } from './planner-contexts';
import { SelectedSystemBox } from './SelectedSystemBox';
import { structureOptionGroups } from './structure-options';
import { StructureBonusReadout } from './structure-bonus-readout';
import { useSystemSearch, type SystemErr, type SystemParams } from '@/components/use-system-search';

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
    <div className={HERO_LOCATION_ROW_CLASS}>
      <SectionLabel prefix={false} className="w-[64px] shrink-0">System</SectionLabel>

      {lockedTo ? (
        deducedSystem ? (
          <SelectedSystemBox name={deducedSystem.name} security={deducedSystem.security} locked={lockedTo} />
        ) : (
          <div
            className={cn(
              HERO_LOCATION_CONTROL_WELL_CLASS,
              'flex h-[30px] items-center border border-border bg-bg px-2',
            )}
          >
            <span className="truncate text-label uppercase tracking-wide text-muted">System unavailable</span>

          </div>

        )
      ) : reactionSystem ? (
        <SelectedSystemBox
          name={reactionSystem.systemName}
          security={reactionSystem.security}
          onClear={() => setReactionSystem(null)}
        />
      ) : (
        <div className={HERO_LOCATION_CONTROL_WELL_CLASS}>
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

export function ReactionStructureSelect() {
  const {
    availableStructures,
    selectedStructure,
    reactionStructure,
    setReactionStructure,
    reactionSystem,
    setReactionSystem,
    reactionStructureReadout,
  } = useBuildSetup();
  const { systems } = useSystemSearch();
  const router = useRouter();

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

  const { deducedSystem, refineries, taxPct, lockedTo } = deriveReactionSlotView(
    reactionStructure,
    availableStructures,
    selectedStructure,
    systems,
    reactionSystem,
  );
  return (
    <div className={HERO_LOCATION_GROUP_CLASS}>
      {}
      <div className="flex min-h-4 min-w-0 items-center gap-2.5">
        <span className="shrink-0 text-label uppercase tracking-eyebrow text-text">Reactions</span>

        <StructureBonusReadout readout={reactionStructureReadout} taxPct={taxPct} />
      </div>

      <ReactionSystemRow
        lockedTo={lockedTo}
        deducedSystem={deducedSystem}
        reactionSystem={reactionSystem}
        setReactionSystem={setReactionSystem}
      />
      <div className={HERO_LOCATION_ROW_CLASS}>
        <SectionLabel prefix={false} className="w-[64px] shrink-0">Station</SectionLabel>

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
          className={cn('h-[30px]', HERO_LOCATION_CONTROL_WELL_CLASS)}
        />
      </div>

    </div>

  );
}
