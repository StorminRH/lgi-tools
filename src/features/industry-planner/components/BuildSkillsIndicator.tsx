'use client';

import { HourglassIcon } from './MeAdjuster';
import { usePricing } from './PricingProvider';
import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from '../structure-bonus';
import { skillTimeSummary } from '../skill-time';
import type { BlueprintStructure } from '../types';

// The structure-bonus readout's percent style — small values keep a decimal.
function pct(n: number): string {
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
}

// The build character's skills-applied indicator (3.7.19.1), filling the hero
// seam RIGHT of the Run-As frame that ACCOUNT.8 reserved for exactly this. The
// ME/TE icon language, one hourglass metric per activity the plan contains
// (time-only lever ⇒ hourglass only, no gem), in the OWNED evb-bright tone —
// character-real data, distinct from the structure readout's bonus green. The
// title names the character + the levels behind the number.
//
// Absolutely positioned off the frame wrapper so it has ZERO layout footprint —
// it spills into the band's reserved cluster gap and nothing reflows when it
// appears (Ryan's spec: fit the existing space, shift nothing). Renders nothing
// in EVERY degraded state (unset, pending roster, levels loading or fail-open,
// nothing trained for the plan's activities) — the indicator never claims an
// effect the time figures don't carry.
export function BuildSkillsIndicator({ structure }: { structure: BlueprintStructure }) {
  const { buildCharacter, skillTimeFactors, buildCharacterSkillLevels } = usePricing();
  if (buildCharacter === null || !skillTimeFactors.active || buildCharacterSkillLevels === null) {
    return null;
  }

  const summary = skillTimeSummary(buildCharacterSkillLevels);
  const activities = new Set<number>([
    structure.activityId,
    ...Object.values(structure.nodeActivityByBlueprint),
  ]);
  const showMfg = activities.has(MANUFACTURING_ACTIVITY) && summary.manufacturingPct > 0;
  const showRxn = activities.has(REACTION_ACTIVITY) && summary.reactionPct > 0;
  if (!showMfg && !showRxn) return null;

  return (
    <div className="absolute left-full top-1/2 ml-2 flex -translate-y-1/2 flex-col items-start gap-1.5">
      {showMfg && (
        <span
          title={`${buildCharacter.name}'s skills — manufacturing time −${pct(summary.manufacturingPct)} (Industry ${summary.industryLevel}, Advanced Industry ${summary.advancedIndustryLevel}; per-item skills apply per node)`}
          className="inline-flex items-center gap-1 font-mono text-[10px] leading-none text-evb-bright"
        >
          <span aria-hidden className="inline-flex h-3 w-3 shrink-0">
            <HourglassIcon state="owned" />
          </span>
          −{pct(summary.manufacturingPct)}
        </span>
      )}
      {showRxn && (
        <span
          title={`${buildCharacter.name}'s skills — reaction time −${pct(summary.reactionPct)} (Reactions ${summary.reactionsLevel})`}
          className="inline-flex items-center gap-1 font-mono text-[10px] leading-none text-evb-bright"
        >
          {showMfg && (
            <span className="font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-muted">
              rxn
            </span>
          )}
          <span aria-hidden className="inline-flex h-3 w-3 shrink-0">
            <HourglassIcon state="owned" />
          </span>
          −{pct(summary.reactionPct)}
        </span>
      )}
    </div>
  );
}
