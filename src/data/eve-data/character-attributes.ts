export const ATTRIBUTE_KEYS = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

/** Dogma attribute NAMES; the ids are looked up in dgm_attribute_types at read time, never hard-coded. */
export const ATTRIBUTE_BONUS_DOGMA: Record<AttributeKey, string> = {
  intelligence: 'intelligenceBonus',
  memory: 'memoryBonus',
  perception: 'perceptionBonus',
  willpower: 'willpowerBonus',
  charisma: 'charismaBonus',
};
export const IMPLANT_SLOT_DOGMA = 'implantness';
export const SKILL_RANK_DOGMA = 'skillTimeConstant';
