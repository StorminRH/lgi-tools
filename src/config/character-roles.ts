/**
 * Closed, canonically ordered set of character roles; consumers derive validation, unions, and
 * iteration from this one list.
 */
export const CHARACTER_ROLES = ['USER', 'ADMIN'] as const;

/** Closed corporation-role vocabulary retained for access eligibility decisions. */
export type CharacterRole = (typeof CHARACTER_ROLES)[number];
