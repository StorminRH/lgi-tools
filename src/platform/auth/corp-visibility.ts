import type { CorpHoldingContext, Knowable, Placement } from '@/data/corp-holdings/placement';
import type { CharacterCorpRoles, CorpRole } from './corp-roles';

/** No `corp_data_sharing` row reads as 'off'. */
export type SharingState = 'on' | 'off';
export type Tier = 'hq' | 'base' | 'other';

export type MemberRoles =
  | { readonly kind: 'known'; readonly roles: CharacterCorpRoles }
  | { readonly kind: 'unknown' };

/** A viewer character whose roles are known for this corp. Unknown characters never reach a grant. */
export interface KnownMember {
  readonly characterId: number;
  readonly roles: CharacterCorpRoles;
  /** null = the member has no base set. */
  readonly base: Knowable<number | null>;
}

export interface CorpGrantInput {
  readonly corporationId: number;
  readonly sharing: SharingState;
  readonly context: CorpHoldingContext;
  readonly members: readonly {
    readonly characterId: number;
    readonly roles: MemberRoles;
    readonly base: Knowable<number | null>;
  }[];
}

export type HoldingRule =
  | { readonly kind: 'none' }
  | { readonly kind: 'all' }
  | { readonly kind: 'by-location'; readonly hq: Knowable<number>; readonly members: readonly KnownMember[] };

export type StructuresAccess = 'none' | 'use' | 'manage';
export type JobsAccess = 'none' | 'own-token';

const grantBrand: unique symbol = Symbol('CorpGrant');
const scopeBrand: unique symbol = Symbol('OwnedReadScope');

export interface CorpGrant {
  readonly [grantBrand]: true;
  readonly corporationId: number;
  readonly holdings: HoldingRule;
  readonly blueprints: HoldingRule;
  readonly structures: StructuresAccess;
  readonly jobs: JobsAccess;
  readonly manageSharing: boolean;
  readonly context: CorpHoldingContext;
}

/** The only argument the owned-data queries accept. Minted by compileReadScope alone. */
export interface OwnedReadScope {
  readonly [scopeBrand]: true;
  readonly characterIds: readonly number[];
  readonly corps: readonly CorpGrant[];
}

const ALL: HoldingRule = { kind: 'all' };
const NONE: HoldingRule = { kind: 'none' };

const DELIVERIES_VIEW: readonly CorpRole[] = [
  'Deliveries_Query',
  'Accountant',
  'Trader',
  'Junior_Accountant',
  'Director',
];

type Holds = (role: CorpRole) => boolean;

function knownMembers(members: CorpGrantInput['members']): KnownMember[] {
  return members.flatMap((member) =>
    member.roles.kind === 'known'
      ? [{ characterId: member.characterId, roles: member.roles.roles, base: member.base }]
      : [],
  );
}

/**
 * Switch off is self-service parity: a viewer sees only what one of their
 * characters could pull from ESI. Switch on mirrors the in-game view, and a
 * viewer with no known-roles character sees nothing rather than an empty
 * by-location rule, so the read scope drops the corp outright.
 */
function holdingsRule(on: boolean, holds: Holds, byLocation: HoldingRule & { kind: 'by-location' }): HoldingRule {
  if (holds('Director')) return ALL;
  if (!on || byLocation.members.length === 0) return NONE;
  return holds('Accountant') ? ALL : byLocation;
}

function blueprintsRule(on: boolean, holds: Holds, holdings: HoldingRule): HoldingRule {
  return on && holds('Factory_Manager') ? ALL : holdings;
}

function structuresAccess(on: boolean, holds: Holds): StructuresAccess {
  if (holds('Station_Manager') || holds('Director')) return 'manage';
  return on ? 'use' : 'none';
}

function jobsAccess(holds: Holds): JobsAccess {
  return holds('Factory_Manager') || holds('Director') ? 'own-token' : 'none';
}

export function compileCorpGrant(input: CorpGrantInput): CorpGrant {
  const members = knownMembers(input.members);
  const holds: Holds = (role) => members.some((member) => member.roles.global.has(role));
  const on = input.sharing === 'on';
  const holdings = holdingsRule(on, holds, { kind: 'by-location', hq: input.context.hq, members });
  return {
    [grantBrand]: true,
    corporationId: input.corporationId,
    holdings,
    blueprints: blueprintsRule(on, holds, holdings),
    structures: structuresAccess(on, holds),
    jobs: jobsAccess(holds),
    manageSharing: holds('Director'),
    context: input.context,
  };
}

export function compileReadScope(characterIds: readonly number[], grants: readonly CorpGrant[]): OwnedReadScope {
  return {
    [scopeBrand]: true,
    characterIds,
    corps: grants.filter((grant) => grant.holdings.kind !== 'none' || grant.blueprints.kind !== 'none'),
  };
}

/**
 * The tiers `rootId` might be. A grant holds only when every possible tier
 * grants, so an unknown base or HQ withholds tier-specific roles and keeps
 * global ones. A known base overrides the HQ.
 */
export function possibleTiers(rootId: number, hq: Knowable<number>, base: Knowable<number | null>): readonly Tier[] {
  if (base.kind === 'known' && base.value === rootId) return ['base'];
  const tiers: Tier[] = base.kind === 'unknown' ? ['base'] : [];
  if (hq.kind === 'known' && hq.value === rootId) return [...tiers, 'hq'];
  if (hq.kind === 'unknown') tiers.push('hq');
  return [...tiers, 'other'];
}

const TIER_ROLES: Record<Tier, keyof Omit<CharacterCorpRoles, 'global'>> = {
  hq: 'atHq',
  base: 'atBase',
  other: 'atOther',
};

export function rolesAt(roles: CharacterCorpRoles, tier: Tier): ReadonlySet<CorpRole> {
  return new Set([...roles.global, ...roles[TIER_ROLES[tier]]]);
}

function grants(roles: ReadonlySet<CorpRole>, placement: Exclude<Placement, { kind: 'unplaced' }>): boolean {
  if (placement.kind === 'hangar') return roles.has(`Hangar_Query_${placement.division}`);
  return DELIVERIES_VIEW.some((role) => roles.has(role));
}

function memberSees(member: KnownMember, hq: Knowable<number>, placement: Exclude<Placement, { kind: 'unplaced' }>) {
  return possibleTiers(placement.rootId, hq, member.base).every((tier) =>
    grants(rolesAt(member.roles, tier), placement),
  );
}

export function canSeeHolding(rule: HoldingRule, placement: Placement): boolean {
  if (rule.kind === 'none') return false;
  if (rule.kind === 'all') return true;
  if (placement.kind === 'unplaced') return false;
  return rule.members.some((member) => memberSees(member, rule.hq, placement));
}
