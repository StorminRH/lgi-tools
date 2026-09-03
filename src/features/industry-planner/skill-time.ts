import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from './structure-bonus';
import { formatBonusPct } from './structure-bonus-view';
import type { BlueprintStructure } from './types';

export const INDUSTRY_SKILL_ID = 3380;

const INDUSTRY_TIME_PCT_PER_LEVEL = -4;

export const ADVANCED_INDUSTRY_SKILL_ID = 3388;

const ADVANCED_INDUSTRY_TIME_PCT_PER_LEVEL = -3;

export const REACTIONS_SKILL_ID = 45746;

const REACTIONS_TIME_PCT_PER_LEVEL = -4;

export interface SkillTimeFactors {

  skillTimeFactorOf: (blueprintTypeId: number) => number;

  active: boolean;
}

export const NO_SKILL_FACTORS: SkillTimeFactors = {
  skillTimeFactorOf: () => 1,
  active: false,
};

function term(pctPerLevel: number, level: number): number {
  return 1 + (pctPerLevel * level) / 100;
}

export interface AppliedTimeSkill {
  name: string;
  level: number;
  reductionPct: number;
}

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

export function skillTimeFactorsFor(args: {
  levels: Record<string, number> | null;
  nodeActivityByBlueprint: Record<number, number>;
  nodeTimeSkills: Record<number, { skillTypeId: number; timePctPerLevel: number }[]>;
}): SkillTimeFactors {
  const { levels, nodeActivityByBlueprint, nodeTimeSkills } = args;
  if (levels === null) return NO_SKILL_FACTORS;

  const levelOf = (skillTypeId: number): number => levels[String(skillTypeId)] ?? 0;

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
