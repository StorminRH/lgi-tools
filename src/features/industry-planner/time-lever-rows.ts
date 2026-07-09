import type { SkillTimeFactors } from './skill-time';

// The Build-time hover's lever rows (3.7.19.1), pure so the copy logic is
// tested away from the tile (the Humble Component pattern). Each row shows the
// TOP job's actual reduction — derived from the same factor closures the
// figure multiplies, so the copy can't drift from the math — or 'none
// applied'. Pre-3.7.19 this was one static 'none applied' row, which had been
// false for structures since 3.7.9.1.3.
export function timeLeverRows(args: {
  topBlueprintTypeId: number;
  buildCharacterName: string | null; // null = no build character selected
  skillTimeFactors: SkillTimeFactors;
  structureTeFactorOf: (blueprintTypeId: number) => number;
}): { skills: string; structure: string } {
  const { topBlueprintTypeId, buildCharacterName, skillTimeFactors, structureTeFactorOf } = args;
  const reduction = (factor: number) => `−${((1 - factor) * 100).toFixed(1)}% time`;
  const skillFactor = skillTimeFactors.skillTimeFactorOf(topBlueprintTypeId);
  const structureFactor = structureTeFactorOf(topBlueprintTypeId);
  return {
    skills:
      skillTimeFactors.active && buildCharacterName !== null
        ? `${reduction(skillFactor)} (${buildCharacterName})`
        : 'none applied',
    structure: structureFactor < 1 ? reduction(structureFactor) : 'none applied',
  };
}
