export const ATTRIBUTE_KEYS = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export const ATTRIBUTE_BONUS_DOGMA_NAMES: Record<AttributeKey, string> = {
  intelligence: 'intelligenceBonus',
  memory: 'memoryBonus',
  perception: 'perceptionBonus',
  willpower: 'willpowerBonus',
  charisma: 'charismaBonus',
};
export const IMPLANT_SLOT_DOGMA = 'implantness';
export const SKILL_RANK_DOGMA = 'skillTimeConstant';
