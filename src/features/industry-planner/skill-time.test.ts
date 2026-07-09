import { describe, expect, it } from 'vitest';
import {
  ADVANCED_INDUSTRY_SKILL_ID,
  INDUSTRY_SKILL_ID,
  NO_SKILL_FACTORS,
  REACTIONS_SKILL_ID,
  skillTimeBreakdown,
  skillTimeFactorsFor,
} from './skill-time';

// bp 1 manufactures, bp 2 reacts, bp 3 is unknown to the maps.
const MFG_BP = 1;
const REACTION_BP = 2;
const nodeActivityByBlueprint = { [MFG_BP]: 1, [REACTION_BP]: 11 };

const levels = (map: Record<number, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [id, level] of Object.entries(map)) out[id] = level;
  return out;
};

const factors = (
  charLevels: Record<number, number> | null,
  nodeTimeSkills: Record<number, { skillTypeId: number; timePctPerLevel: number }[]> = {},
) =>
  skillTimeFactorsFor({
    levels: charLevels === null ? null : levels(charLevels),
    nodeActivityByBlueprint,
    nodeTimeSkills,
  });

describe('skillTimeFactorsFor', () => {
  it('fails open to the identity factors when levels are unknown (all-or-nothing)', () => {
    const f = factors(null);
    expect(f).toBe(NO_SKILL_FACTORS);
    expect(f.skillTimeFactorOf(MFG_BP)).toBe(1);
    expect(f.skillTimeFactorOf(REACTION_BP)).toBe(1);
    expect(f.active).toBe(false);
  });

  it('an untrained skill (id absent from a PRESENT map) is level 0, factor 1', () => {
    const f = factors({});
    expect(f.active).toBe(true);
    expect(f.skillTimeFactorOf(MFG_BP)).toBe(1);
    expect(f.skillTimeFactorOf(REACTION_BP)).toBe(1);
  });

  it('applies Industry −4%/lvl and Advanced Industry −3%/lvl to manufacturing nodes', () => {
    // Industry III alone: 1 − 0.04·3 = 0.88.
    expect(factors({ [INDUSTRY_SKILL_ID]: 3 }).skillTimeFactorOf(MFG_BP)).toBeCloseTo(0.88, 10);
    // Industry V × Advanced Industry V: 0.8 × 0.85 = 0.68.
    expect(
      factors({ [INDUSTRY_SKILL_ID]: 5, [ADVANCED_INDUSTRY_SKILL_ID]: 5 }).skillTimeFactorOf(MFG_BP),
    ).toBeCloseTo(0.68, 10);
  });

  it('applies Reactions −4%/lvl to reaction nodes', () => {
    expect(factors({ [REACTIONS_SKILL_ID]: 4 }).skillTimeFactorOf(REACTION_BP)).toBeCloseTo(0.84, 10);
    expect(factors({ [REACTIONS_SKILL_ID]: 5 }).skillTimeFactorOf(REACTION_BP)).toBeCloseTo(0.8, 10);
  });

  it('Industry and Advanced Industry do NOT touch reaction nodes (verified: Reactions is the only reaction time skill)', () => {
    const f = factors({ [INDUSTRY_SKILL_ID]: 5, [ADVANCED_INDUSTRY_SKILL_ID]: 5 });
    expect(f.skillTimeFactorOf(REACTION_BP)).toBe(1);
  });

  it('Reactions does not touch manufacturing nodes', () => {
    expect(factors({ [REACTIONS_SKILL_ID]: 5 }).skillTimeFactorOf(MFG_BP)).toBe(1);
  });

  it('multiplies the per-item required-skill terms (attr 1982) into manufacturing nodes only', () => {
    // A −1%/lvl science skill at V on top of Industry V + Adv Industry V:
    // 0.8 × 0.85 × 0.95 = 0.646.
    const f = factors(
      { [INDUSTRY_SKILL_ID]: 5, [ADVANCED_INDUSTRY_SKILL_ID]: 5, 11441: 5 },
      { [MFG_BP]: [{ skillTypeId: 11441, timePctPerLevel: -1 }] },
    );
    expect(f.skillTimeFactorOf(MFG_BP)).toBeCloseTo(0.646, 10);
  });

  it('handles a −2%/lvl per-item skill (Mutagenic Stabilization) and multiple per-item skills', () => {
    // 81896 at IV: 1 − 0.02·4 = 0.92; plus 11450 (−1%/lvl) at III: × 0.97.
    const f = factors(
      { 81896: 4, 11450: 3 },
      {
        [MFG_BP]: [
          { skillTypeId: 81896, timePctPerLevel: -2 },
          { skillTypeId: 11450, timePctPerLevel: -1 },
        ],
      },
    );
    expect(f.skillTimeFactorOf(MFG_BP)).toBeCloseTo(0.92 * 0.97, 10);
  });

  it('a blueprint absent from nodeTimeSkills gets only the activity-wide skills', () => {
    const f = factors(
      { [INDUSTRY_SKILL_ID]: 5, 11441: 5 },
      { [REACTION_BP]: [{ skillTypeId: 11441, timePctPerLevel: -1 }] }, // wrong node on purpose
    );
    expect(f.skillTimeFactorOf(MFG_BP)).toBeCloseTo(0.8, 10);
  });

  it('an unknown activity yields the identity factor', () => {
    expect(factors({ [INDUSTRY_SKILL_ID]: 5 }).skillTimeFactorOf(3)).toBe(1);
  });
});

describe('skillTimeBreakdown', () => {
  it('lists the applied activity-wide skills with per-skill and compound reductions', () => {
    const b = skillTimeBreakdown({
      levels: levels({
        [INDUSTRY_SKILL_ID]: 5,
        [ADVANCED_INDUSTRY_SKILL_ID]: 4,
        [REACTIONS_SKILL_ID]: 4,
      }),
      nodeTimeSkills: {},
    });
    expect(b.manufacturing.skills).toEqual([
      { name: 'Industry', level: 5, reductionPct: 20 },
      { name: 'Advanced Industry', level: 4, reductionPct: 12 },
    ]);
    // 1 − 0.8 × 0.88 = 0.296 compound manufacturing reduction.
    expect(b.manufacturing.totalPct).toBeCloseTo(29.6, 10);
    expect(b.reaction.skills).toEqual([{ name: 'Reactions', level: 4, reductionPct: 16 }]);
    expect(b.reaction.totalPct).toBeCloseTo(16, 10);
    expect(b.perItem).toEqual([]);
  });

  it('omits untrained skills entirely and reports zero totals for an untrained character', () => {
    const b = skillTimeBreakdown({ levels: {}, nodeTimeSkills: {} });
    expect(b.manufacturing.skills).toEqual([]);
    expect(b.manufacturing.totalPct).toBe(0);
    expect(b.reaction.skills).toEqual([]);
    expect(b.reaction.totalPct).toBe(0);
  });

  it('dedupes trained per-item skills across nodes, sorted by name, dropping untrained ones', () => {
    const b = skillTimeBreakdown({
      levels: levels({ 11441: 5, 81896: 4 }),
      nodeTimeSkills: {
        1: [
          { skillTypeId: 11441, skillName: 'Plasma Physics', timePctPerLevel: -1 },
          { skillTypeId: 11450, skillName: 'Gallente Starship Engineering', timePctPerLevel: -1 },
        ],
        7: [
          { skillTypeId: 11441, skillName: 'Plasma Physics', timePctPerLevel: -1 },
          { skillTypeId: 81896, skillName: 'Mutagenic Stabilization', timePctPerLevel: -2 },
        ],
      },
    });
    expect(b.perItem).toEqual([
      { name: 'Mutagenic Stabilization', level: 4, reductionPct: 8 },
      { name: 'Plasma Physics', level: 5, reductionPct: 5 },
    ]);
  });
});
