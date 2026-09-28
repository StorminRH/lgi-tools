import { z } from 'zod';

/** The roles the access model reads. Every other ESI role grants nothing here. */
export const VISIBILITY_ROLES = [
  'Director',
  'Accountant',
  'Junior_Accountant',
  'Trader',
  'Factory_Manager',
  'Station_Manager',
  'Deliveries_Query',
  'Hangar_Query_1',
  'Hangar_Query_2',
  'Hangar_Query_3',
  'Hangar_Query_4',
  'Hangar_Query_5',
  'Hangar_Query_6',
  'Hangar_Query_7',
] as const;

export type CorpRole = (typeof VISIBILITY_ROLES)[number];

export interface CharacterCorpRoles {
  readonly global: ReadonlySet<CorpRole>;
  readonly atHq: ReadonlySet<CorpRole>;
  readonly atBase: ReadonlySet<CorpRole>;
  readonly atOther: ReadonlySet<CorpRole>;
}

/**
 * The four ESI role arrays as ESI sent them. This is what gets stored, so a role
 * added to VISIBILITY_ROLES later needs no refetch; narrowing happens on read.
 */
export interface CorpRolesRecord {
  readonly roles: readonly string[];
  readonly rolesAtHq: readonly string[];
  readonly rolesAtBase: readonly string[];
  readonly rolesAtOther: readonly string[];
}

const roleList = z.array(z.string()).default([]);

const rolesBodySchema = z
  .object({
    roles: roleList,
    roles_at_hq: roleList,
    roles_at_base: roleList,
    roles_at_other: roleList,
  })
  .transform(
    (raw): CorpRolesRecord => ({
      roles: raw.roles,
      rolesAtHq: raw.roles_at_hq,
      rolesAtBase: raw.roles_at_base,
      rolesAtOther: raw.roles_at_other,
    }),
  );

export function parseCharacterRolesBody(body: unknown): CorpRolesRecord | null {
  const parsed = rolesBodySchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

const VISIBILITY_ROLE_SET: ReadonlySet<string> = new Set(VISIBILITY_ROLES);

function visibilityRoles(names: readonly string[]): ReadonlySet<CorpRole> {
  return new Set(names.filter((name): name is CorpRole => VISIBILITY_ROLE_SET.has(name)));
}

/** Narrows a stored record to the roles the access model reads. */
export function narrowCorpRoles(record: CorpRolesRecord): CharacterCorpRoles {
  return {
    global: visibilityRoles(record.roles),
    atHq: visibilityRoles(record.rolesAtHq),
    atBase: visibilityRoles(record.rolesAtBase),
    atOther: visibilityRoles(record.rolesAtOther),
  };
}
