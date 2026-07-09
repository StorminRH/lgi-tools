import { describe, expect, it } from 'vitest';
import { NO_SKILL_FACTORS } from './skill-time';
import { timeLeverRows } from './time-lever-rows';

const base = {
  topBlueprintTypeId: 1,
  buildCharacterName: null,
  skillTimeFactors: NO_SKILL_FACTORS,
  structureTeFactorOf: () => 1,
};

describe('timeLeverRows', () => {
  it("shows 'none applied' for both rows in the unset baseline", () => {
    expect(timeLeverRows(base)).toEqual({ skills: 'none applied', structure: 'none applied' });
  });

  it("names the character and the top job's skill reduction when skills apply", () => {
    const rows = timeLeverRows({
      ...base,
      buildCharacterName: 'Alice',
      skillTimeFactors: { skillTimeFactorOf: () => 0.68, active: true },
    });
    expect(rows.skills).toBe('−32.0% time (Alice)');
  });

  it("shows 'none applied' for skills when the factors are active but no character is named (fail-open transition)", () => {
    const rows = timeLeverRows({
      ...base,
      skillTimeFactors: { skillTimeFactorOf: () => 0.68, active: true },
    });
    expect(rows.skills).toBe('none applied');
  });

  it("shows the structure's top-job time reduction when a structure applies", () => {
    const rows = timeLeverRows({ ...base, structureTeFactorOf: () => 0.85 });
    expect(rows.structure).toBe('−15.0% time');
  });
});
