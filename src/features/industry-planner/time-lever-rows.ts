import type { SkillTimeFactors } from './skill-time';

export function timeLeverRows(args: {
  topBlueprintTypeId: number;
  buildCharacterName: string | null;
  skillTimeFactors: SkillTimeFactors;
  structureTeFactorOf: (blueprintTypeId: number) => number;
}): { skills: string; structure: string } {
  const { topBlueprintTypeId, buildCharacterName, skillTimeFactors, structureTeFactorOf } = args;
  const reduction = (factor: number) => `−${((1 - factor) * 100).toFixed(1)}% time`;
  const skillFactor = skillTimeFactors.skillTimeFactorOf(topBlueprintTypeId);
  const structureFactor = structureTeFactorOf(topBlueprintTypeId);
  return {

    skills:
      skillTimeFactors.active && buildCharacterName !== null && skillFactor < 1
        ? `${reduction(skillFactor)} (${buildCharacterName})`
        : 'none applied',
    structure: structureFactor < 1 ? reduction(structureFactor) : 'none applied',
  };
}
