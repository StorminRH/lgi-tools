export const CHARACTER_ROLES = ['USER', 'ADMIN'] as const;

export type CharacterRole = (typeof CHARACTER_ROLES)[number];
