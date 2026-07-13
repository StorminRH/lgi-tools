## Corps & Roles
<!-- updated: 2026-07-12 -->

Corporation data looks like character data until the first permission question shows up.

A personal skill queue or job board asks a fairly direct question: does this signed-in user have this character linked, and did that character grant the right read-only scope? Corporation data has more layers. A linked character can be in the corporation, but still lack the in-game role for the endpoint. A user can have multiple characters in the same corporation, only one of which has the useful role. A corporation can have data that is private to one viewer, like the board that user is allowed to see, and data that is shared by the corporation itself, like owned structures. And some corporation data should not be fetched at all unless the corporation has explicitly opted in.

That is the shape I want the code to preserve: **scope is not membership, membership is not role, and role is not consent.**

The first rail is membership. LGI.tools caches each linked character’s corporation, alliance, and faction on the character profile row. That data is character-intrinsic and public from EVE’s affiliation endpoint, so it lives beside the character’s name and portrait rather than on the per-user EVE token link. But the membership predicate is fail-closed. A missing or stale affiliation does not count as membership. Before a corporation access decision, the app refreshes stale affiliations best-effort, then decides on fresh-enough cached data. If the refresh fails, the stale row still fails closed instead of granting access from old information.<sup><a href="#code-corp-affiliation-schema">1</a></sup><sup><a href="#code-corp-membership">2</a></sup>

[PR #168](https://github.com/StorminRH/lgi-tools/pull/168) turned that into an audited access gate. The gate does not just return true or false. It records every decision, allow and deny, with the user, corporation, decision reason, and the linked character whose fresh affiliation granted access. That is not analytics. It is an authorization trail. Denied attempts matter, and the audit row is deliberately retained even if the user or character is later deleted.<sup><a href="#code-corp-access-gate">3</a></sup><sup><a href="#code-corp-audit-schema">4</a></sup><sup><a href="#code-corp-audit-retention">5</a></sup>

The next mistake would have been treating EVE scopes as the whole answer. They are not. A character can grant `esi-industry.read_corporation_jobs.v1`, but EVE can still reject the corporation jobs endpoint if that character does not have the in-game Factory Manager or Director role. A character can grant `esi-corporations.read_structures.v1`, but the structures endpoint needs Station Manager. The code keeps those as separate axes: the eligibility file checks refresh-token and scope health; the owner-sync engine resolves in-game role holders later, by vending tokens for linked members and reading their roles. That split is important because reconnecting can fix a missing scope, but it cannot give someone an in-game corporation role.<sup><a href="#code-corp-scope-vs-role">6</a></sup><sup><a href="#code-corp-role-resolution">7</a></sup>

Corporation industry jobs are the private version of corporation data. The board is keyed by `(user_id, corporation_id)`, not by corporation alone. That is intentional. Two members of the same corporation may have different linked characters, different token health, and different role outcomes. The board belongs to the viewer’s account boundary, not to the corporation as a public object. The sync state can also carry `needs_role`, which is a user-specific condition: this user has a character in the corp, but none of their linked characters can read the corp job endpoint.<sup><a href="#code-corp-jobs-schema">8</a></sup>

The refresh path preserves that distinction. The shared owner-sync engine groups eligible linked characters by corporation, resolves a role-bearing token, and then reads one corporation endpoint. If no usable member token exists, the refresh skips as a transient miss. If member tokens exist but none has the needed role, the refresh records `needs_role`. If EVE returns `403` mid-run because the role changed after resolution, the planner maps that to the same graceful state instead of pretending it is a network error. A role problem should show as a role problem.<sup><a href="#code-corp-jobs-refresh">9</a></sup>

Corporation structures forced a different rule because the data is not private per viewer. A corporation’s owned Upwell structures are the same structures no matter which member is looking. For that feature, the store is keyed by `corporation_id` alone, and the staleness stamp is shared. The first eligible member view in a cache window can refresh the catalogue; every other member reads the same refreshed rows without spending another ESI call. But that shared shape raised a privacy problem: if the first Station Manager page view automatically pulled structures, then a corporation’s infrastructure could become visible to every member just because one authorized member opened a page.

That was the branch-level mistake that changed the rule. The final implementation made sharing default off. No row means disabled. A disabled corporation dispatches zero ESI, stores zero structures, and returns no structures even if leftover rows somehow exist. A Station Manager has to opt the corporation in before the pull runs. Only then do shared structures become build locations for members.<sup><a href="#code-corp-structures-schema">10</a></sup><sup><a href="#code-corp-structures-refresh">11</a></sup><sup><a href="#code-corp-structures-read">12</a></sup>

The route that flips structure sharing is deliberately a trust boundary. The user ID comes from the session, never from the request body. The route first runs the audited corporation membership decision, then checks whether any linked member character holds `Station_Manager`. Enabling sharing records consent. Disabling sharing flips consent off and wipes the corporation’s pulled structures, sync state, and authored rig fits. The order matters: consent is turned off first so every read filter, sync precondition, and late save re-check fails closed before cleanup finishes.<sup><a href="#code-corp-sharing-route">13</a></sup><sup><a href="#code-corp-sharing-write">14</a></sup>

That last re-check is one of the details I care about most. The refresh path is write-behind. A member can open the structures page, start an ESI pull, and then a Station Manager can disable sharing before the pull finishes. Without a second consent read immediately before saving, that late refresh could resurrect the catalogue after it had been wiped. The repo now treats that as a resurrection bug: `saveCorpStructures` reads consent again right before delete-and-insert, and no-ops when sharing is no longer enabled.<sup><a href="#code-corp-sharing-write">14</a></sup>

Structure rigs added one more app-authored layer. EVE exposes the corporation’s structures, but not their fitted rigs. A Station Manager can record rigs so the planner bonus math is exact. That authored data survives the hourly full-replace pull because it is not regenerable from EVE. It is wiped only when sharing is disabled. The rig route uses the same membership-plus-Station-Manager gate, and then validates that the structure belongs to the corporation and that the rig actually fits that structure type. A bad rig should not silently add a zero bonus and look accepted.<sup><a href="#code-corp-rigs-route">15</a></sup><sup><a href="#code-corp-structures-schema">10</a></sup>

The planner consumes the result through a source-agnostic structure seam. Custom structures and corporation structures both become `AvailableStructure` rows. Custom structures have no fixed system. Corporation structures carry their real system and SDE-derived security band, so selecting one locks the build to that structure’s home system and applies the correct structure and rig bonuses. That is the right boundary: the planner does not need to know how the corporation catalogue was authorized, only that the available row is already scoped to what the user may use.<sup><a href="#code-corp-planner-structures">16</a></sup>

Looking back, corporation data is where “least privilege” stopped being only an OAuth phrase. The site can ask for read-only scopes and still be wrong if it ignores membership freshness, in-game roles, consent, per-user versus shared storage, late write-behind races, or purge/retention rules. The rule I use now is: corporation features need an explicit data-class decision before the first fetch. Is this private to the viewer, shared by the corporation, or app-authored consent? Who can turn it on? Who can see it? What happens when a role changes, a character leaves, or sharing is disabled?

That is exactly the kind of boundary AI will flatten if the repo lets it. “Fetch corp data” is too vague. The code has to make the safer question unavoidable: which corporation, which member, which role, which consent state, which storage key, and which teardown rule?

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-corp-affiliation-schema" file="src/features/auth/schema.ts" lines="24-41" lang="ts" ref="5d16c056340da1fa70ad385dd7bab0b1140f7282" -->
```ts
export const characters = pgTable('characters', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  portraitUrl: text('portrait_url').notNull(),
  role: characterRoleEnum('role').default('USER').notNull(),
  preferences: jsonb('preferences').$type<Record<string, unknown>>().default({}).notNull(),
  // Corp affiliation cache. Character-INTRINSIC public data, so it lives here
  // beside name/portrait — NOT a per-link custody fact like account.owner_hash.
  corporationId: bigint('corporation_id', { mode: 'number' }),
  allianceId: bigint('alliance_id', { mode: 'number' }),
  factionId: bigint('faction_id', { mode: 'number' }),
  affiliationRefreshedAt: timestamp('affiliation_refreshed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at').defaultNow().notNull(),
});
```

<!-- uth:code id="code-corp-membership" file="src/features/auth/membership.ts" lines="13-18,32-43,45-58,61-87" lang="ts" -->
```ts
// FAIL CLOSED: a null or stale affiliation reads as "not a member", so an
// un-refreshed character never leaks corp access.
export const AFFILIATION_TTL_MS = 60 * 60 * 1000;

export function isAffiliationStale(refreshedAt: Date | null, now: Date): boolean {
  if (refreshedAt === null) return true;
  return now.getTime() - refreshedAt.getTime() > AFFILIATION_TTL_MS;
}

export function memberCharacterIdInCorp(
  affiliations: CachedAffiliation[],
  corporationId: number,
  now: Date,
): number | null {
  const match = affiliations.find(
    (a) => a.corporationId === corporationId && !isAffiliationStale(a.refreshedAt, now),
  );
  return match ? match.characterId : null;
}

export function memberCorpIds(affiliations: CachedAffiliation[], now: Date): number[] {
  const ids = new Set<number>();
  for (const a of affiliations) {
    if (a.corporationId !== null && !isAffiliationStale(a.refreshedAt, now)) {
      ids.add(a.corporationId);
    }
  }
  return [...ids];
}
```

<!-- uth:code id="code-corp-access-gate" file="src/features/auth/corp-access.ts" lines="3-13,33-49" lang="ts" -->
```ts
// Audited corp-access gate. A standalone, corp-id-parameterized, FAIL-CLOSED
// decision: refresh stale affiliations → decide on ≤1h-fresh data → record.

export async function decideCorpAccess(input: {
  userId: string;
  corporationId: number;
}): Promise<CorpAccessDecision> {
  const { userId, corporationId } = input;
  await refreshStaleAffiliationsForUser(userId);
  const affiliations = await getUserAffiliations(userId);
  const characterId = memberCharacterIdInCorp(affiliations, corporationId, new Date());
  const allowed = characterId !== null;
  const reason: CorpAccessReason = allowed ? 'member' : 'not_member';
  await recordCorpAccessDecision({ userId, corporationId, characterId, allowed, reason });
  return { allowed, reason, characterId };
}
```

<!-- uth:code id="code-corp-audit-schema" file="src/features/auth/schema.ts" lines="167-190" lang="ts" -->
```ts
// Corp-access decision ledger — one row per decision made by the audited gate,
// allow AND deny. A security/authz audit trail, NOT analytics telemetry.
export const corpAccessAudit = pgTable(
  'corp_access_audit',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
    userId: text('user_id').notNull(),
    characterId: bigint('character_id', { mode: 'number' }),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    allowed: boolean('allowed').notNull(),
    reason: text('reason').notNull(),
  },
  (t) => [
    index('corp_access_audit_corp_decided_idx').on(t.corporationId, t.decidedAt.desc()),
    index('corp_access_audit_allowed_decided_idx').on(t.allowed, t.decidedAt.desc()),
  ],
);
```

<!-- uth:code id="code-corp-audit-retention" file="src/features/auth/purge.ts" lines="25-35" lang="ts" -->
```ts
export const authPurgeContributor: PurgeContributor = {
  name: 'auth',
  tier: 'credential',
  claims: [account, session, characters],
  retained: [
    {
      table: corpAccessAudit,
      reason:
        'FK-less corp-access authz trail (3.7.3.3) — denials/decisions must outlive the user or character they record, so it is deliberately never purged.',
    },
  ],
};
```

<!-- uth:code id="code-corp-scope-vs-role" file="src/features/industry-jobs/corp-sync-eligibility.ts, src/features/owned-structures/corp-sync-eligibility.ts" lines="3-13,20-29,3-13,20-29" lang="ts" -->
```ts
// Corp jobs: scope is separate from in-game role.
export const CORP_INDUSTRY_JOBS_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-industry.read_corporation_jobs.v1',
] as const;

export const CORP_INDUSTRY_JOBS_REQUIRED_ROLES = ['Factory_Manager', 'Director'] as const;

// Corp structures: scope is separate from Station_Manager.
export const CORP_STRUCTURES_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-corporations.read_structures.v1',
] as const;

export const CORP_STRUCTURES_REQUIRED_ROLES = ['Station_Manager'] as const;
```

<!-- uth:code id="code-corp-role-resolution" file="src/lib/owner-sync/engine.ts" lines="130-155" lang="ts" -->
```ts
async function resolveCorpToken<TOwner, TState, TSave>(
  descriptor: OwnerSyncDescriptor<TOwner, TState, TSave>,
  axis: CorpOwnerAxis<TOwner>,
  members: EnumeratedOwner[],
): Promise<TokenOutcome> {
  const resolved = await Promise.all(
    members.map(async (member): Promise<CorpMemberCandidate | null> => {
      const accessToken = await descriptor.vendToken(member.characterId);
      if (accessToken === null) return null;
      const roles = await axis.readRoles(member.characterId, accessToken);
      if (roles === null) return null;
      const hasRole = axis.requiredRoles.some((role) => roles.includes(role));
      return { vendingCharacterId: member.characterId, accessToken, hasRole };
    }),
  );
  const candidates = resolved.filter((candidate): candidate is CorpMemberCandidate => candidate !== null);
  const resolution = classifyCorpDirector(candidates);
  if (resolution.kind === 'unavailable') return { kind: 'skip' };
  if (resolution.kind === 'needs_role') return { kind: 'needs_role' };
  return { kind: 'token', accessToken: resolution.accessToken };
}
```

<!-- uth:code id="code-corp-jobs-schema" file="src/features/industry-jobs/schema.ts" lines="44-91" lang="ts" -->
```ts
// Corp jobs are keyed by (user_id, corporation_id), NOT corp alone: a corp board
// is per-user and private here, and the role verdict is per-user.
export const corpIndustryJobs = pgTable(
  'corp_industry_jobs',
  {
    userId: text('user_id').notNull(),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    jobs: jsonb('jobs').$type<IndustryJob[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.userId, t.corporationId] })],
);

export const corpIndustryJobSyncs = pgTable(
  'corp_industry_job_syncs',
  {
    userId: text('user_id').notNull(),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
    jobsEtag: text('jobs_etag'),
    syncError: text('sync_error'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.corporationId] })],
);
```

<!-- uth:code id="code-corp-jobs-refresh" file="src/features/industry-jobs/corp-refresh.ts" lines="10-16,23-45,60-80" lang="ts" -->
```ts
// Corp jobs is keyed (userId, corporationId). The engine checks staleness before
// any vend or roles read, resolves a Director among member characters, and
// surfaces needs_role through saveGateState.
export function planCorpJobsPersist(read: JobsEsiRead): CorpJobsPersistPlan {
  if (read.kind === 'error') {
    return read.code === 'esi_403' ? { kind: 'needs_role' } : { kind: 'skip' };
  }
  if (read.kind === 'unchanged') return { kind: 'stamp' };
  const jobs = parseIndustryJobsBody(read.body);
  if (jobs === null) return { kind: 'skip' };
  return { kind: 'save', jobs, etag: read.etag };
}

function makeDescriptor(port: CorpJobsPort): OwnerSyncDescriptor<CorpOwner, CorpJobsSyncState, CorpJobsSave> {
  return {
    isStale: (state, now) => isJobsStale(state?.lastRefreshedAt ?? null, now),
    corpAxis: {
      eligible: (owner) => canSyncCorpIndustryJobs(owner),
      ownerOf: (userId, corporationId) => ({ userId, corporationId }),
      requiredRoles: CORP_INDUSTRY_JOBS_REQUIRED_ROLES,
      readRoles: (characterId, accessToken) => port.readRoles(characterId, accessToken),
    },
    saveGateState: (owner) => port.saveNeedsRole(owner.userId, owner.corporationId),
  };
}
```

<!-- uth:code id="code-corp-structures-schema" file="src/features/owned-structures/schema.ts" lines="3-18,40-70,72-106" lang="ts" -->
```ts
// Corp owned structures are keyed by corporation_id ALONE, shared by all members.
export const corpStructures = pgTable(
  'corp_structures',
  {
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    structureId: bigint('structure_id', { mode: 'number' }).notNull(),
    typeId: integer('type_id').notNull(),
    systemId: integer('system_id').notNull(),
    securityClass: securityClassEnum('security_class').notNull(),
    name: text('name'),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.structureId] })],
);

export const corpStructureSyncs = pgTable('corp_structure_syncs', {
  corporationId: bigint('corporation_id', { mode: 'number' }).primaryKey(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
  pageEtags: jsonb('page_etags').$type<string[]>().default([]).notNull(),
});

// Sharing consent is app-authored system-of-record. Default OFF.
export const corpStructureSharing = pgTable('corp_structure_sharing', {
  corporationId: bigint('corporation_id', { mode: 'number' }).primaryKey(),
  enabled: boolean('enabled').default(false).notNull(),
  setBy: bigint('set_by', { mode: 'number' }),
  setAt: timestamp('set_at', { withTimezone: true }).defaultNow().notNull(),
});

// Authored rig fits survive the full-replace ESI pull and are wiped only when
// sharing is disabled.
export const corpStructureRigs = pgTable(
  'corp_structure_rigs',
  {
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    structureId: bigint('structure_id', { mode: 'number' }).notNull(),
    rigTypeIds: jsonb('rig_type_ids').$type<number[]>().default([]).notNull(),
    setAt: timestamp('set_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.structureId] })],
);
```

<!-- uth:code id="code-corp-structures-refresh" file="src/features/owned-structures/refresh.ts" lines="30-62" lang="ts" -->
```ts
function makeDescriptor(
  port: CorpStructuresPort,
): OwnerSyncDescriptor<CorpOwner, CorpStructuresSyncState, StructuresSave> {
  return {
    now: () => port.now(),
    enumerate: (userId) => port.listMembers(userId),
    vendToken: (characterId) => port.vendToken(characterId),
    // Consent gate, FIRST in the engine — skipped before staleness, vend, or roles.
    precondition: (owner) => port.isSharingEnabled(owner.corporationId),
    isStale: (state, now) => isStructuresStale(state?.lastRefreshedAt ?? null, now),
    corpAxis: {
      eligible: (owner) => canSyncCorpStructures(owner),
      // userId ignored: the owner key is the corporation alone.
      ownerOf: (_userId, corporationId) => ({ corporationId }),
      requiredRoles: CORP_STRUCTURES_REQUIRED_ROLES,
      readRoles: (characterId, accessToken) => port.readRoles(characterId, accessToken),
    },
    readState: (owner) => port.readSyncState(owner.corporationId),
    save: (owner, payload) => port.saveStructures(owner.corporationId, payload.rows, payload.etags),
    stampFresh: (owner) => port.stampFresh(owner.corporationId),
    // NO saveGateState: a role-less member's needs_role is a skip.
  };
}
```

<!-- uth:code id="code-corp-structures-read" file="src/db/corp-structures-sync.ts" lines="73-103,116-138" lang="ts" -->
```ts
export async function getCorpStructuresForUserOnView(userId: string): Promise<ViewerCorpStructuresResult> {
  await refreshStaleAffiliationsForUser(userId);
  const affiliations = await getUserAffiliations(userId);
  const corporationIds = memberCorpIds(affiliations, new Date());
  const [structuresByCorp, syncStates, sharings] = await Promise.all([
    getCorpStructures(corporationIds),
    listCorpStructureSyncStates(corporationIds),
    readCorpStructureSharings(corporationIds),
  ]);
  after(() => refreshCorpStructuresForUser(makeCorpStructuresPort(), userId));

  // Fail reads closed on consent.
  const corporations: ViewerCorpStructures[] = corporationIds.map((corporationId) => ({
    corporationId,
    structures: sharings.get(corporationId)?.enabled ? structuresByCorp.get(corporationId) ?? [] : [],
    lastRefreshedAt: freshnessByCorp.get(corporationId) ?? null,
  }));

  return { corporations };
}

export async function getAvailableCorpStructuresForUser(userId: string): Promise<AvailableCorpStructure[]> {
  const { corporations } = await getCorpStructuresForUserOnView(userId);
  const rigsByStructure = await getCorpStructureRigs(corporations.map((c) => c.corporationId));
  // flatten sharing-enabled corp rows for the planner
}
```

<!-- uth:code id="code-corp-sharing-route" file="src/app/api/account/corp-structures/sharing/route.ts" lines="15-40" lang="ts" -->
```ts
// POST /api/account/corp-structures/sharing — flip a corp's structure-sharing consent.
// The user id comes from the session, never the body.
export async function POST(request: NextRequest): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseJsonBody(request, setCorpStructureSharingRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { corporationId, enabled } = parsed.data;

  const access = await decideCorpAccess({ userId, corporationId });
  if (!access.allowed) return new Response('Not a member of this corporation', { status: 403 });
  if (!(await userHoldsCorpRole(userId, corporationId, CORP_STRUCTURES_REQUIRED_ROLES))) {
    return new Response('Requires the Station Manager role', { status: 403 });
  }

  await setCorpStructureSharing(corporationId, enabled, await getSessionCharacterId());
  return Response.json({ corporationId, enabled } satisfies CorpStructureSharingResponse);
}
```

<!-- uth:code id="code-corp-sharing-write" file="src/features/owned-structures/queries.ts" lines="113-147,190-216" lang="ts" -->
```ts
export async function saveCorpStructures(
  corporationId: number,
  rows: ParsedCorpStructure[],
  etags: string[],
): Promise<void> {
  // Resurrection guard: a late write-behind refresh cannot reinsert rows after
  // sharing has been disabled and wiped.
  if (!(await isCorpStructureSharingEnabled(corporationId))) return;
  const now = new Date();
  await db.delete(corpStructures).where(eq(corpStructures.corporationId, corporationId));
  if (rows.length > 0) await db.insert(corpStructures).values(/* projected rows */);
  await db.insert(corpStructureSyncs).values({ corporationId, lastRefreshedAt: now, pageEtags: etags })
    .onConflictDoUpdate({ target: corpStructureSyncs.corporationId, set: { lastRefreshedAt: now, pageEtags: etags } });
  revalidateTag(corpStructuresTag(corporationId), 'max');
}

export async function setCorpStructureSharing(
  corporationId: number,
  enabled: boolean,
  setBy: number | null,
): Promise<void> {
  await db.insert(corpStructureSharing).values({ corporationId, enabled, setBy, setAt: new Date() })
    .onConflictDoUpdate({ target: corpStructureSharing.corporationId, set: { enabled, setBy, setAt: new Date() } });
  if (enabled) return;
  await db.delete(corpStructures).where(eq(corpStructures.corporationId, corporationId));
  await db.delete(corpStructureSyncs).where(eq(corpStructureSyncs.corporationId, corporationId));
  await db.delete(corpStructureRigs).where(eq(corpStructureRigs.corporationId, corporationId));
  revalidateTag(corpStructuresTag(corporationId), 'max');
}
```

<!-- uth:code id="code-corp-rigs-route" file="src/app/api/account/corp-structures/rigs/route.ts" lines="17-54" lang="ts" -->
```ts
export async function POST(request: NextRequest): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseJsonBody(request, setCorpStructureRigsRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { corporationId, structureId, rigTypeIds } = parsed.data;

  const access = await decideCorpAccess({ userId, corporationId });
  if (!access.allowed) return new Response('Not a member of this corporation', { status: 403 });
  if (!(await userHoldsCorpRole(userId, corporationId, CORP_STRUCTURES_REQUIRED_ROLES))) {
    return new Response('Requires the Station Manager role', { status: 403 });
  }

  const structure = (await getCorpStructures([corporationId]))
    .get(corporationId)
    ?.find((s) => s.structureId === structureId);
  if (!structure) return new Response('Unknown structure for this corporation', { status: 400 });

  const fittingRigIds = new Set(rigs.filter((r) => rigFitsStructure(r, structureType)).map((r) => r.typeId));
  if (rigTypeIds.some((id) => !fittingRigIds.has(id))) {
    return new Response('One or more rigs do not fit this structure', { status: 400 });
  }

  await upsertCorpStructureRigs(corporationId, structureId, rigTypeIds);
  return Response.json({ structureId, rigTypeIds } satisfies CorpStructureRigsResponse);
}
```

<!-- uth:code id="code-corp-planner-structures" file="src/app/api/account/structures/route.ts" lines="15-24,29-36,52-89" lang="ts" -->
```ts
// GET /api/account/structures. Custom structures and corp-pulled structures are
// merged into the planner's source-agnostic AvailableStructure seam.
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return Response.json({ structures: [] } satisfies AvailableStructuresResponse);

  const [custom, corp, structureTypes] = await Promise.all([
    listCustomStructures(userId),
    getAvailableCorpStructuresForUser(userId),
    getStructureTypes(),
  ]);

  const structures: AvailableStructure[] = [];
  for (const c of custom) {
    structures.push({
      id: c.id,
      source: 'custom',
      name: c.name,
      structureTypeId: c.structureTypeId,
      systemId: null,
      securityClass: null,
      structureAttrs: dogma.get(c.structureTypeId) ?? {},
      rigAttrs: c.rigTypeIds.map((r) => dogma.get(r) ?? {}),
    });
  }
  for (const s of corp) {
    structures.push({
      id: `corp:${s.structureId}`,
      source: 'corp',
      name: s.name ?? typeNameById.get(s.typeId) ?? `Structure ${s.structureId}`,
      structureTypeId: s.typeId,
      systemId: s.systemId,
      securityClass: s.securityClass,
      structureAttrs: dogma.get(s.typeId) ?? {},
      rigAttrs: s.rigTypeIds.map((r) => dogma.get(r) ?? {}),
    });
  }
  return Response.json({ structures } satisfies AvailableStructuresResponse);
}
```
<!-- uth:code-excerpts:end -->
