// The build character's skills→time factors (3.7.19.1) — the first Phase-3
// lever. Pure: the provider feeds the selected character's trained ACTIVE
// levels (Neon, via the skills tracker) + the structure payload's per-node
// activity/required-skill maps; the output closure multiplies into
// computeBuildTimes exactly like structureTeFactorOf (the #187/#191 factor
// discipline: per-node closures, 1 = identity, composed by plain product).
//
// --- Verified game mechanics (each constant source-cited; HIGH confidence) ---
// Sources: local SDE type_dogma (primary — attr values queried 2026-07-09),
// in-game skill descriptions, EVE-Uni wiki (Manufacturing, Skills:Production,
// Reactions), Qoi IndustryFormulas.pdf §1 (productionTime = base × timeModifier
// × skillModifier × runs; "all modifiers are multiplied together").
//   Industry (3380)          attr 440  manufacturingTimeBonus = −4  → −4%/lvl, manufacturing
//   Advanced Industry (3388) attr 1961 advancedIndustrySkill… = −3  → −3%/lvl, manufacturing
//     (also research, out of planner scope; does NOT apply to reactions — EVE-Uni
//     Reactions lists the Reactions skill as the only time skill)
//   Reactions (45746)        attr 2660 reactionTimeBonus      = −4  → −4%/lvl, reactions
//   Per-item skills          attr 1982 manufactureTimePerLevel      → −1%/lvl each
//     (−2 on Mutagenic Stabilization), only on jobs whose blueprint REQUIRES the
//     skill; the signed percent ships per node in structure.nodeTimeSkills.
// Composition is multiplicative with TE and structure/rig factors, full
// precision, no intermediate rounding (display rounding stays in
// formatBuildDuration). Levels are ESI active_skill_level (alpha-capped — what
// the game actually applies). Implants also modify time (hardware attr 440);
// deliberately out of scope this session.
import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from './structure-bonus';
import { formatBonusPct } from './structure-bonus-view';
import type { BlueprintStructure } from './types';

export const INDUSTRY_SKILL_ID = 3380;
export const INDUSTRY_TIME_PCT_PER_LEVEL = -4;
export const ADVANCED_INDUSTRY_SKILL_ID = 3388;
export const ADVANCED_INDUSTRY_TIME_PCT_PER_LEVEL = -3;
export const REACTIONS_SKILL_ID = 45746;
export const REACTIONS_TIME_PCT_PER_LEVEL = -4;

export interface SkillTimeFactors {
  // Per-node time factor (default 1 ⇒ no change), multiplied into the job-time
  // product beside teFactor and structureTeFactorOf.
  skillTimeFactorOf: (blueprintTypeId: number) => number;
  // True when a real levels map is applied (drives the applied indicator).
  active: boolean;
}

export const NO_SKILL_FACTORS: SkillTimeFactors = {
  skillTimeFactorOf: () => 1,
  active: false,
};

// One skill's multiplicative term: (1 + pct·level/100), pct signed negative.
// A level of 0 (untrained, or the skill id absent from a PRESENT levels map —
// correct data, not a partial sync) yields 1.
function term(pctPerLevel: number, level: number): number {
  return 1 + (pctPerLevel * level) / 100;
}

// One applied skill for the hero readout's popover: name, trained level, and
// its own reduction (|pct/lvl|·level — the per-skill line, not the compound).
export interface AppliedTimeSkill {
  name: string;
  level: number;
  reductionPct: number;
}

// The hero readout's popover model: the applied skills listed per activity plus
// the compound total effect. `manufacturing.totalPct` compounds the
// ACTIVITY-WIDE skills only (Industry × Advanced Industry — what every mfg job
// gets); the trained per-item T2 skills present in THIS plan are listed
// separately since they apply only to jobs requiring them. Untrained skills
// (level 0) are not "being applied" and are omitted.
export interface SkillTimeBreakdown {
  manufacturing: { skills: AppliedTimeSkill[]; totalPct: number };
  perItem: AppliedTimeSkill[];
  reaction: { skills: AppliedTimeSkill[]; totalPct: number };
}

export function skillTimeBreakdown(args: {
  levels: Record<string, number>;
  nodeTimeSkills: Record<
    number,
    { skillTypeId: number; skillName: string; timePctPerLevel: number }[]
  >;
}): SkillTimeBreakdown {
  const { levels, nodeTimeSkills } = args;
  const levelOf = (skillTypeId: number): number => levels[String(skillTypeId)] ?? 0;
  const applied = (name: string, pctPerLevel: number, level: number): AppliedTimeSkill[] =>
    level > 0 ? [{ name, level, reductionPct: Math.abs(pctPerLevel) * level }] : [];

  const industryLevel = levelOf(INDUSTRY_SKILL_ID);
  const advancedIndustryLevel = levelOf(ADVANCED_INDUSTRY_SKILL_ID);
  const reactionsLevel = levelOf(REACTIONS_SKILL_ID);

  const perItemById = new Map<number, AppliedTimeSkill>();
  for (const skills of Object.values(nodeTimeSkills)) {
    for (const skill of skills) {
      const level = levelOf(skill.skillTypeId);
      if (level === 0 || perItemById.has(skill.skillTypeId)) continue;
      perItemById.set(skill.skillTypeId, {
        name: skill.skillName,
        level,
        reductionPct: Math.abs(skill.timePctPerLevel) * level,
      });
    }
  }

  return {
    manufacturing: {
      skills: [
        ...applied('Industry', INDUSTRY_TIME_PCT_PER_LEVEL, industryLevel),
        ...applied('Advanced Industry', ADVANCED_INDUSTRY_TIME_PCT_PER_LEVEL, advancedIndustryLevel),
      ],
      totalPct:
        (1 -
          term(INDUSTRY_TIME_PCT_PER_LEVEL, industryLevel) *
            term(ADVANCED_INDUSTRY_TIME_PCT_PER_LEVEL, advancedIndustryLevel)) *
        100,
    },
    perItem: [...perItemById.values()].sort((a, b) => a.name.localeCompare(b.name)),
    reaction: {
      skills: applied('Reactions', REACTIONS_TIME_PCT_PER_LEVEL, reactionsLevel),
      totalPct: (1 - term(REACTIONS_TIME_PCT_PER_LEVEL, reactionsLevel)) * 100,
    },
  };
}

// Build the per-node closure for the selected character. `levels` null ⇒ the
// character's skills are unknown (never synced / pre-0039 row / fetch failed /
// no character selected) ⇒ the identity factors — the ALL-OR-NOTHING fail-open:
// skills apply fully or not at all, never a silent partial mix.
export function skillTimeFactorsFor(args: {
  levels: Record<string, number> | null;
  nodeActivityByBlueprint: Record<number, number>;
  nodeTimeSkills: Record<number, { skillTypeId: number; timePctPerLevel: number }[]>;
}): SkillTimeFactors {
  const { levels, nodeActivityByBlueprint, nodeTimeSkills } = args;
  if (levels === null) return NO_SKILL_FACTORS;

  const levelOf = (skillTypeId: number): number => levels[String(skillTypeId)] ?? 0;
  // The activity-wide factors are per-character, not per-node — compute once.
  const manufacturingFactor =
    term(INDUSTRY_TIME_PCT_PER_LEVEL, levelOf(INDUSTRY_SKILL_ID)) *
    term(ADVANCED_INDUSTRY_TIME_PCT_PER_LEVEL, levelOf(ADVANCED_INDUSTRY_SKILL_ID));
  const reactionFactor = term(REACTIONS_TIME_PCT_PER_LEVEL, levelOf(REACTIONS_SKILL_ID));

  return {
    skillTimeFactorOf: (blueprintTypeId) => {
      const activity = nodeActivityByBlueprint[blueprintTypeId];
      if (activity === MANUFACTURING_ACTIVITY) {
        let factor = manufacturingFactor;
        for (const skill of nodeTimeSkills[blueprintTypeId] ?? []) {
          factor *= term(skill.timePctPerLevel, levelOf(skill.skillTypeId));
        }
        return factor;
      }
      if (activity === REACTION_ACTIVITY) return reactionFactor;
      return 1;
    },
    active: true,
  };
}

// The applied-build-skills hero readout's view (3.7.19.1): null in every
// degraded state (no build character, the lever inactive, levels not loaded, or
// nothing trained for the plan's activities), else the two show-flags, the
// manufacturing headline (never a −0% claim — it reads the strongest per-item
// skill as an "up to" when no activity-wide reduction applies), the character
// name, and the breakdown to render. The component stays a render shell.
export interface BuildSkillsView {
  characterName: string;
  breakdown: SkillTimeBreakdown;
  showMfg: boolean;
  showRxn: boolean;
  mfgHeadline: string;
}

export function buildSkillsView(
  buildCharacter: { name: string } | null,
  skillTimeFactorsActive: boolean,
  levels: Record<string, number> | null,
  structure: BlueprintStructure,
): BuildSkillsView | null {
  if (buildCharacter === null || !skillTimeFactorsActive || levels === null) return null;
  const breakdown = skillTimeBreakdown({ levels, nodeTimeSkills: structure.nodeTimeSkills });
  const activities = new Set<number>([
    structure.activityId,
    ...Object.values(structure.nodeActivityByBlueprint),
  ]);
  const showMfg =
    activities.has(MANUFACTURING_ACTIVITY) &&
    (breakdown.manufacturing.skills.length > 0 || breakdown.perItem.length > 0);
  const showRxn = activities.has(REACTION_ACTIVITY) && breakdown.reaction.skills.length > 0;
  if (!showMfg && !showRxn) return null;
  const activityWidePct = breakdown.manufacturing.totalPct;
  const maxPerItemPct = breakdown.perItem.reduce((max, s) => Math.max(max, s.reductionPct), 0);
  const mfgHeadline =
    activityWidePct > 0 ? `−${formatBonusPct(activityWidePct)}` : `up to −${formatBonusPct(maxPerItemPct)}`;
  return { characterName: buildCharacter.name, breakdown, showMfg, showRxn, mfgHeadline };
}
