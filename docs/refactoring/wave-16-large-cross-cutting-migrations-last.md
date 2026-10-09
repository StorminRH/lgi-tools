# Wave 16: Large cross-cutting migrations (last)

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 15: Mapper client: canvas, tracking, scanner and authoring](wave-15-mapper-client-canvas-tracking-scanner-and.md) · [Index](README.md#roadmap)

The four items with the widest blast radius or highest risk, landed once everything they touch has settled:
- P219: serializable capped inserts, with concurrency DB tests.
- P138: typed failureCode/failureMessage tables for every apiFetch consumer, after the dialog, confirm-gate, map-client and seeOther work.
- P046: the eyebrow/title type-role census across about 40 files, after every UI wave.
- P246: per-operation Convex door contracts that type postConvexHttpDoor, wrapping P208's shapes and P247's ids.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☐ | [P219](#p219) | Enforce per-user row caps with one serializable conditional insert in src/db | persistence | M | medium | medium | — |
| ☐ | [P138](#p138) | Add typed failureCode/failureMessage to src/transport/failure-copy.ts and route outcome-blind apiFetch failure copy through code tables | error-handling | L | medium | high | [P063](wave-12-market-data-search-and-client-data-reads.md#p063), [P054](wave-12-market-data-search-and-client-data-reads.md#p054), [P056](wave-07-ui-kit-primitives-src-components-ui.md#p056), [P154](wave-01-quick-wins-delete-dead-code-fix-small.md#p154), [P146](wave-09-auth-routes-and-the-mutation-transport-pipeline.md#p146) |
| ☐ | [P046](#p046) | Adopt the eyebrow and title type roles and lock them with a census | css-styling | L | medium | medium | [P001](wave-07-ui-kit-primitives-src-components-ui.md#p001), [P015](wave-07-ui-kit-primitives-src-components-ui.md#p015), [P034](wave-07-ui-kit-primitives-src-components-ui.md#p034) |
| ☐ | [P246](#p246) | Declare each Convex HTTP door contract once, per operation, and type postConvexHttpDoor by it | contracts-validation | L | medium | medium | [P247](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p247), [P208](wave-14-convex-backend-helpers.md#p208), [P209](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p209) |

<a id="p219"></a>

## P219: Enforce per-user row caps with one serializable conditional insert in src/db

- **Status:** [ ] not started
- **Category:** persistence · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** medium · **Size:** About -45 / +60 (helper plus tests; routes lose about 25 lines and the two count helpers go)
- **Depends on:** —
- **Existing primitive:** `src/db/index.ts:runSerializable; src/db/pg-errors.ts:isSerializationFailure; pattern in src/features/industry-planner/profiles/queries.ts:createIndustryProfile`

**Problem.** Three per-user capped tables enforce their caps three different ways. industry_profiles uses one serializable `insert ... select ... where (select count(*) ...) < cap` with a retry loop private to profiles/queries.ts. saved_plans counts, inserts, recounts and runs a compensating delete in the route: four round trips plus list, and concurrent saves at cap-1 can both be rolled back. custom_structures counts and then inserts, so concurrent saves can exceed the cap. The ownership registry describes the profile cap incorrectly.

**Verifier revision.** The core holds: three ownedRowIdentityColumns tables enforce a per-user cap three different ways. Profiles use one serializable conditional insert with a 3-attempt retry on serialization failure (profiles/queries.ts:41-65). Saved plans count, insert, recount and run a compensating delete; under concurrency at cap-1 both requests delete and both get a 409. Custom structures count then insert, which can exceed the cap. Profiles' approach already exists and is cheaper: saved plans drop from 4 statements to 2, and custom structures go from 3 statements to 2 without the race. The data-ownership registry note for industryProfiles (data-ownership-registry.ts:841) is stale: it says 'count, insert, recount, compensating delete, like saved plans', but the code is the single serializable statement. Corrections: (1) the 'Number() vs no coercion' drift is not real, because drizzle's count() is already .mapWith(Number) (node_modules/drizzle-orm/sql/functions/aggregate.js:5). (2) Both races were operator-declined in the 2026-08-11 triage, so the case now rests on consolidating onto an existing pattern, not on new risk work. (3) Moving addsUnlinkedMembers and the ownedRowWhere predicate are dropped. The first is an api-zone helper legitimately shared by the create and update routes. The second covers five one-line predicates in two modules. (4) A generic insert-select needs a cast to each column's SQL type. In INSERT ... SELECT, untyped params resolve to text, and text has no assignment cast to integer, double precision or jsonb; profiles only work because they cast ::jsonb by hand and every other column is text.

**Sites (14).**

- [`src/features/industry-planner/profiles/queries.ts:8-12,41-65`](../../src/features/industry-planner/profiles/queries.ts#L8-L12) — the correct pattern: ownedLive scope plus a single serializable conditional insert, retried up to 3 times on 40001 only
- [`src/app/api/account/saved-plans/route.ts:46-70`](../../src/app/api/account/saved-plans/route.ts#L46-L70) — count, insert, recount, compensating delete; both concurrent writers at cap-1 get rolled back
- [`src/features/industry-planner/saved-plans-queries.ts:25-45`](../../src/features/industry-planner/saved-plans-queries.ts#L25-L45) — countSavedPlans plus unconditional createSavedPlan
- [`src/app/api/account/custom-structures/route.ts:30-39`](../../src/app/api/account/custom-structures/route.ts#L30-L39) — count then insert; concurrent saves can exceed the cap
- [`src/features/custom-structures/queries.ts:31-37,50-55`](../../src/features/custom-structures/queries.ts#L31-L37) — countCustomStructures plus unconditional createCustomStructure
- [`src/app/api/account/industry-profiles/profile-writes.ts:19-25`](../../src/app/api/account/industry-profiles/profile-writes.ts#L19-L25) — insertWithinCap wraps createIndustryProfile with id generation; used by route.ts:37 and duplicate/route.ts:32
- [`src/composition/__tests__/data-ownership-registry.ts:830,841,852`](../../src/composition/__tests__/data-ownership-registry.ts#L830) — saved-plans and custom-structures notes record operator-declined races; the industryProfiles note at 841 is stale (describes recount/compensation, but the code is single-statement)
- [`src/db/index.ts:108-125`](../../src/db/index.ts#L108-L125) — runSerializable: one statement in a serializable transaction, a single HTTP request on Neon
- [`src/db/pg-errors.ts:19-22`](../../src/db/pg-errors.ts#L19-L22) — isSerializationFailure
- [`src/features/industry-planner/profiles/create-profile.test.ts:1-34`](../../src/features/industry-planner/profiles/create-profile.test.ts#L1-L34) — retry-semantics tests to move to the db helper
- [`src/app/api/account/saved-plans/route.test.ts:119-134`](../../src/app/api/account/saved-plans/route.test.ts#L119-L134) — 'rolls the insert back' test, to be replaced
- [`src/app/api/problem-matrix.test.ts:309-320`](../../src/app/api/problem-matrix.test.ts#L309-L320) — mocks countSavedPlans/countCustomStructures to force 409s; must mock create* returning false instead
- [`src/features/custom-structures/schema.ts:30-37`](../../src/features/custom-structures/schema.ts#L30-L37) — integer, jsonb and double precision columns, all of which need explicit casts in INSERT ... SELECT
- [`src/features/industry-planner/schema.ts:6-14,22-29`](../../src/features/industry-planner/schema.ts#L6-L14) — saved_plans has integer, jsonb and boolean-default columns; industry_profiles has jsonb and deletedAt

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/lib/db-columns.ts:23-32`](../../src/lib/db-columns.ts#L23-L32) — ownedRowIdentityColumns is a schema builder, not cap logic; it is context only
- [`src/app/api/account/industry-profiles/profile-writes.ts:9-17`](../../src/app/api/account/industry-profiles/profile-writes.ts#L9-L17) — addsUnlinkedMembers is a linked-character rule shared by the create and update routes; unrelated to caps, and its api-zone placement is legal
- [`src/features/custom-structures/queries.ts:57-72`](../../src/features/custom-structures/queries.ts#L57-L72) — `and(eq(userId), eq(id))` owned-row predicate, together with saved-plans-queries.ts:47-69, is five one-liners in two modules; a shared ownedRowWhere would add more indirection than it saves
- [`src/features/industry-planner/saved-plans-queries.ts:25-31`](../../src/features/industry-planner/saved-plans-queries.ts#L25-L31) — no real coercion drift against countCustomStructures: drizzle count() already maps to Number

</details>

**Home.** `src/db/capped-insert.ts (new), exporting insertWithinCap. The retry loop moves into it as a private detail; do not export a separate runSerializableWithRetry until a second consumer exists.`

**Boundary check.** src/db/capped-insert.ts is in zone db (rule `db` allows [lib, config]). It imports drizzle-orm (npm) plus ./index (runSerializable) and ./pg-errors (isSerializationFailure), all in zone db. Consumers: src/features/industry-planner/profiles/queries.ts, src/features/industry-planner/saved-plans-queries.ts and src/features/custom-structures/queries.ts, in zone features (the `features` rule's allow list includes db; profiles already imports @/db). The api routes keep importing only the feature functions (rule `api` allows features).

**API sketch.**

```ts
export async function insertWithinCap<TTable extends PgTable>(input: {
  readonly table: TTable;
  readonly values: TTable['$inferInsert'];
  readonly scope: SQL;   // rows counted toward the cap, e.g. eq(t.userId, userId) or ownedLive(userId)
  readonly cap: number;
}): Promise<boolean>;
// Builds: insert into ${table} (<sql.identifier(col.name)...>) select <sql.param(v, col)::${sql.raw(col.getSQLType())}...> where (select count(*) from ${table} where ${scope}) < ${cap} returning 1
// Runs it via runSerializable, retrying up to 3 attempts while isSerializationFailure; returns rows.length > 0.

// features:
createIndustryProfile(userId, input): Promise<boolean>   // unchanged signature
createSavedPlan(userId, input): Promise<boolean>          // was Promise<void>
createCustomStructure(userId, input): Promise<boolean>    // was Promise<void>
```

**Migration steps.**

1. Add src/db/capped-insert.ts. Map `values` keys through getTableColumns(table), skip undefined, encode each value with sql.param(value, column) so jsonb is JSON.stringified by the column encoder, and cast each param with ::${column.getSQLType()}. Add the 3-attempt serialization retry from profiles/queries.ts:58-64.
2. Add src/db/capped-insert.test.ts. Mock runSerializable as create-profile.test.ts does, and assert the SQL text from PgDialect.sqlToQuery: the column list, the per-column casts (integer, double precision, jsonb, text) and the cap param. Move the three retry tests from create-profile.test.ts here (retry then succeed or find the account full; give up after 3; no retry on other errors). Add a DB test with createDbTestHarness that fills saved_plans to the cap, expects false on the next insert, and round-trips jsonb, integer, double precision and null columns for custom_structures.
3. Rebase createIndustryProfile on insertWithinCap({ table: industryProfiles, values: { id, userId, name, document }, scope: ownedLive(userId), cap: MAX_PROFILES_PER_USER }). Delete CREATE_ATTEMPTS and the loop, and delete or thin create-profile.test.ts. profiles/queries.db.test.ts keeps guarding it end to end.
4. Make createSavedPlan return insertWithinCap({ table: savedPlans, values: { userId, ...input }, scope: eq(savedPlans.userId, userId), cap: MAX_SAVED_PLANS_PER_USER }). In saved-plans/route.ts, delete the pre-count (46-52) and the recount plus compensating delete (63-70), and map false to the existing 409 conflictFailure('template_limit', 'template limit reached'). Keep the blueprint 400 check first. Delete countSavedPlans.
5. Make createCustomStructure return insertWithinCap({ table: customStructures, values: { id, userId, ...rowValues(input) }, scope: eq(customStructures.userId, userId), cap: MAX_CUSTOM_STRUCTURES_PER_USER }). In custom-structures/route.ts, delete the pre-count (30-36) and map false to the existing 409 'structure_limit'. Keep rejectInvalidCustomStructure first. Delete countCustomStructures.
6. Update the tests: replace saved-plans route.test.ts:119-134 with 'maps a full account to 409 without listing' (createSavedPlanMock resolves false); add the same case to custom-structures/route.test.ts; switch problem-matrix.test.ts:309-320 from count mocks to create mocks resolving false.
7. Rewrite the three registry notes (data-ownership-registry.ts:830, 841, 852) to say that the per-user cap is one serializable conditional insert retried on serialization failure, and drop the accepted-race and over-correction text.

**Tests.** New: src/db/capped-insert.test.ts (SQL shape and retry, moved from profiles/create-profile.test.ts) and a capped-insert DB test using src/db/__tests__/support/db-test-harness. Existing guards: src/features/industry-planner/profiles/queries.db.test.ts, src/app/api/account/industry-profiles/route.test.ts and src/db/run-serializable.test.ts. Updated: saved-plans/route.test.ts, custom-structures/route.test.ts, problem-matrix.test.ts.

**Notes.** Preserve the response codes and copy: 409 template_limit / structure_limit / profile_limit, and 201 with the refreshed list (plus createdId for structures and id for profiles). Keep validation before the cap: an unknown blueprint stays a 400 even at the cap, and so does an invalid structure. Under the new path, concurrent saves at cap-1 produce exactly one success and one 409, where saved plans previously could roll back both. jsonb null and SQL NULL: the current drizzle insert writes SQL NULL for bonuses: null, and `null::jsonb` from a null param keeps that. getSQLType() returns an unquoted enum name for pgEnum columns; none of these tables has one, but note it in the helper's doc comment. Keep insertWithinCap in profile-writes.ts (id generation) or fold it into createIndustryProfile returning id|null; either is fine.

<sub>Reported by: area:app-api, area:industry-planner, concern:feature-skeleton, concern:request-pipeline, dupes-triage-2.</sub>

<a id="p138"></a>

## P138: Add typed failureCode/failureMessage to src/transport/failure-copy.ts and route outcome-blind apiFetch failure copy through code tables

- **Status:** [ ] not started
- **Category:** error-handling · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** L · **Risk:** medium · **Payoff:** high · **Size:** about +60 for failure-copy.ts and +80 for its tests; about -40 of status-branch code across the map and feedback clients; about +25 of code-table entries across StructureComposer, CorpRigEditor, corp-sharing, account and profiles; net roughly +40 production
- **Depends on:** [P063](wave-12-market-data-search-and-client-data-reads.md#p063), [P054](wave-12-market-data-search-and-client-data-reads.md#p054), [P056](wave-07-ui-kit-primitives-src-components-ui.md#p056), [P154](wave-01-quick-wins-delete-dead-code-fix-small.md#p154), [P146](wave-09-auth-routes-and-the-mutation-transport-pipeline.md#p146)
- **Existing primitive:** `src/transport/endpoint.ts:OutcomeOf / ProblemCodec; src/lib/problem.ts:ProblemBody.retryAfterSeconds`

**Problem.** Each apiFetch consumer maps the typed failure union to user copy on its own. Some branch on raw status numbers (map-access, map-creation, feedback). Some erase the outcome into local `{ ok: false }` types (StructureComposer's Mutation, account-actions' { kind: 'error' }, profile-sync's ProfilesResult). Some show a single string for every failure (CorpRigEditor, corp-sharing-card). Some ignore the outcome entirely (mapLifecycleFailureMessage). As a result:
- declared problem codes never reach the user;
- network failures and 401 get permission or connection copy that is wrong;
- feedback leaks developer detail;
- retryAfterSeconds, which the server sends, is never read on the client.

**Verifier revision.** The core is real.

Bug: mapLifecycleFailureMessage(action) never sees the outcome. A network failure, 400 or 401 on delete shows 'Map admin access is required.', and on purge it shows 'Only the map creator can permanently delete…'. runMapLifecycleBatch discards the failing outcome.

Dropped codes that matter to the user: structure_limit (409) and unknown_system (400) both become 'Could not save. Try again.', which invites retrying a request that cannot succeed. not_station_manager, not_director and not_corp_member become generic copy. Duplicating a profile uses createFailureMessage, so profile_missing becomes "Couldn't create the profile.". rate_limited on purge, delete and sign-out-everywhere becomes a fixed toast.

map-access sends 400 and 401 to 'Check your connection'. feedback shows server `detail`, which is developer text ('title must not be empty', 'path must start with /', zod detail for invalid_body). Fallow pairs map-access-client.ts:18-26 with map-creation-client.ts:22-30 (dup c77b3abb…-126).

Three corrections to the proposal:
- Type the helper over the failed outcome, not the endpoint. OutcomeOf<A | B> is not distributive (keyof over a union of response maps keeps only shared statuses), and StructureComposer.settle handles three endpoints at once.
- Drop `detailFor` and the aborted-returns-'' rule. Only feedback shows detail, and it should not. No migrated call site passes a signal.
- Trim scope. PreferencesProvider is a background autosave whose declared failures are programmer or session errors, so one 'Save failed' is adequate. Profiles stay in scope at lower priority, because profile-sync's erased result type is a deliberate dependency-injection seam: retype it instead of removing it.
Transport is the only zone that can see OutcomeOf and is importable by every consumer, so the home stands.

**Sites (26).**

- [`src/transport/endpoint.ts:9-13, 91-93, 115-143`](../../src/transport/endpoint.ts#L9-L13) — ProblemCodec<TCode>, ProblemBodyFor<TCode> and OutcomeOf already carry the typed codes plus protocol and network kinds
- [`src/transport/decode.ts:5-7, 21-33, 65-68, 110-123`](../../src/transport/decode.ts#L5-L7) — undeclared statuses or codes become kind 'protocol'; fetch failures become kind 'network'
- [`src/features/maps/map-lifecycle-client.ts:21-29`](../../src/features/maps/map-lifecycle-client.ts#L21-L29) — copy chosen by action only; network, 400 and 401 get permission or undo-window copy (bug)
- [`src/data/maps/api-contract.ts:235-269`](../../src/data/maps/api-contract.ts#L235-L269) — delete, restore and purge declare map_admin_required, map_restore_unavailable and map_creator_required under 403, plus 401 unauthenticated
- [`src/features/maps/use-map-deletion.ts:14-22`](../../src/features/maps/use-map-deletion.ts#L14-L22) — any failure becomes mapLifecycleFailureMessage('delete')
- [`src/features/maps/TrashWindow.tsx:33-43, 127-151`](../../src/features/maps/TrashWindow.tsx#L33-L43) — runMapLifecycleBatch returns { succeeded, complete } and drops the failed outcome; restore and purge show action-only copy
- [`src/features/maps/map-access-client.ts:11-32`](../../src/features/maps/map-access-client.ts#L11-L32) — branches on status 403/409/503; 409 is already a code table; 400 and 401 fall through to 'Check your connection'
- [`src/data/maps/api-contract.ts:207-219`](../../src/data/maps/api-contract.ts#L207-L219) — updateMapAccessEndpoint: 401 unauthenticated, 403 cross_origin\|map_admin_required, 409 codes, 503 map_projection_unavailable
- [`src/features/maps/map-creation-client.ts:22-33, 71-78`](../../src/features/maps/map-creation-client.ts#L22-L33) — branches on status 429/503; hard-coded 'in a minute'; everything else gets the network sentence
- [`src/data/maps/api-contract.ts:59-71`](../../src/data/maps/api-contract.ts#L59-L71) — createMapEndpoint declares 401, 429 rate_limited and 503 map_projection_unavailable
- [`src/features/feedback/components/feedback-view.ts:11-12, 27-43`](../../src/features/feedback/components/feedback-view.ts#L11-L12) — network copy constant; 400 passes result.error.detail through; 429 copy hard-coded
- [`src/features/feedback/api-contract.ts:26-44`](../../src/features/feedback/api-contract.ts#L26-L44) — 400 title_empty\|message_empty\|path_invalid, 429 rate_limited, 502 linear_failed, 503 feedback_unconfigured
- [`src/app/api/feedback/route.ts:47, 56, 65`](../../src/app/api/feedback/route.ts#L47) — detail strings are developer text ('title must not be empty', 'path must start with /')
- [`src/features/feedback/components/FeedbackModal.tsx:28-43`](../../src/features/feedback/components/FeedbackModal.tsx#L28-L43) — consumer; the catch branch is defensive because apiFetch never rejects
- [`src/features/custom-structures/components/StructureComposer.tsx:58-66, 279, 323-329, 341-355`](../../src/features/custom-structures/components/StructureComposer.tsx#L58-L66) — Mutation type erases the outcome to { ok: false }; every failure becomes FIELD_ERROR.save
- [`src/features/custom-structures/api-contract.ts:57-68, 87-97`](../../src/features/custom-structures/api-contract.ts#L57-L68) — create: 400 unknown_system and 409 structure_limit; update: 400 unknown_system
- [`src/features/owned-structures/components/CorpRigEditor.tsx:39-51`](../../src/features/owned-structures/components/CorpRigEditor.tsx#L39-L51) — every failure becomes 'Could not save. Try again.'
- [`src/features/owned-structures/api-contract.ts:50-60`](../../src/features/owned-structures/api-contract.ts#L50-L60) — 403 not_corp_member\|not_station_manager
- [`src/app/(site)/settings/corporations/corp-sharing-card.tsx:44-57`](../../src/app/%28site%29/settings/corporations/corp-sharing-card.tsx#L44-L57) — every failure becomes 'Sharing not changed'
- [`src/platform/auth/api-contract.ts:118-175`](../../src/platform/auth/api-contract.ts#L118-L175) — purge, delete and sessions-revoke declare 429 rate_limited; corp-sharing declares 403 not_corp_member\|not_director
- [`src/platform/auth/account-actions.ts:18-53`](../../src/platform/auth/account-actions.ts#L18-L53) — every failure collapses to { kind: 'error' }; the outcome is discarded
- [`src/components/composition/account/AccountDangerZone.tsx:107-120, 173-176, 225-228, 286`](../../src/components/composition/account/AccountDangerZone.tsx#L107-L120) — gate.run toasts a fixed errorToast ('Purge failed', 'Sign-out failed', 'Account deletion failed'); 429 never surfaced
- [`src/features/industry-planner/profiles/profile-view.ts:20-34`](../../src/features/industry-planner/profiles/profile-view.ts#L20-L34) — saveFailureMessage and createFailureMessage are already code tables, but keyed by untyped string \| undefined
- [`src/features/industry-planner/profiles/profile-sync.ts:4-7, 87-93`](../../src/features/industry-planner/profiles/profile-sync.ts#L4-L7) — ProfilesResult erases the failure to error?: { code: string } (dependency-injection seam for the pure queue)
- [`src/features/industry-planner/profiles/use-industry-profiles.ts:30-32, 83-97, 105-109, 111-125`](../../src/features/industry-planner/profiles/use-industry-profiles.ts#L30-L32) — duplicate reuses createFailureMessage, so profile_missing (404) is lost; delete uses a fixed string
- [`src/features/industry-planner/profiles/api-contract.ts:35-46, 52-64, 72-84`](../../src/features/industry-planner/profiles/api-contract.ts#L35-L46) — declared codes not_linked, profile_limit, profile_missing, stale_revision

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/PreferencesProvider.tsx:99-103`](../../src/components/PreferencesProvider.tsx#L99-L103) — background autosave of one preference; declared failures (invalid_json, invalid_body, invalid_value, unauthenticated, cross_origin) are programmer or session errors, so one 'Save failed' toast is adequate
- [`src/mapper/tracking/TrackingControls.tsx:80-90`](../../src/mapper/tracking/TrackingControls.tsx#L80-L90) — Convex mutation error (ConvexError data.detail), not a transport OutcomeOf
- [`src/lib/error-copy.ts:1-8`](../../src/lib/error-copy.ts#L1-L8) — resolveErrorMessage maps URL search-param error codes to copy; different input (raw string \| string[]); keep separate
- [`src/data/eve-data/universe-assets-client.ts:34-40`](../../src/data/eve-data/universe-assets-client.ts#L34-L40) — failureLabel builds developer Error text for thrown load failures, not user copy

</details>

**Home.** `src/transport/failure-copy.ts`

**Boundary check.** Home zone: transport, whose rule is {from: transport, allow: [lib]}. The module imports only ./endpoint (same zone), plus @/lib/format/time if a duration formatter is reused. Each consumer zone allows transport:
- features: map-lifecycle-client, map-access-client, map-creation-client, use-map-deletion, TrashWindow, feedback-view, StructureComposer, CorpRigEditor and the profiles files;
- app: corp-sharing-card;
- platform/auth: account-actions;
- components-composition: AccountDangerZone;
- mapper and components also allow transport, for future consumers.
lib would not work: it may import only config, and the helper needs the OutcomeOf types from transport.

**API sketch.**

```ts
type AnyFailedOutcome = { ok: false; kind: 'api'; status: number; error: unknown } | { ok: false; kind: 'protocol'; status: number; detail: string } | { ok: false; kind: 'network'; aborted: boolean; cause: unknown };
export type FailedOutcome<E extends EndpointContract> = Extract<OutcomeOf<E>, { ok: false }>;
/** Distributes over unions of outcomes from several endpoints. */
export type ProblemCodeOf<O> = O extends { kind: 'api'; error: { code: infer C extends string } } ? C : never;
export function failureCode<O extends AnyFailedOutcome>(outcome: O): ProblemCodeOf<O> | 'network' | 'protocol';
export interface FailureCopy<O> { readonly fallback: string; readonly codes?: Partial<Record<ProblemCodeOf<O>, string>>; readonly network?: string }
/** Order: network → copy.network ?? `${fallback} Check your connection and try again.`; api code in copy.codes → that; 'unauthenticated' → 'Your session has ended. Sign in again.'; 'rate_limited' → 'Too many attempts. Try again in N seconds.' from error.retryAfterSeconds, else 'in a moment'; protocol or anything else → fallback. */
export function failureMessage<O extends AnyFailedOutcome>(outcome: O, copy: FailureCopy<O>): string;
```

**Migration steps.**

1. Add src/transport/failure-copy.ts and failure-copy.test.ts.
2. Map lifecycle (the bug fix, first): change mapLifecycleFailureMessage to (action, outcome). Use per-action code tables: map_admin_required → admin copy; map_restore_unavailable → 'Its undo window may have ended.'; map_creator_required → creator copy. Each table has an action-specific fallback ('This map could not be deleted.' and so on).
3. Have runMapLifecycleBatch return { succeeded, complete, failed?: outcome } and widen the `action` parameter type to return the outcome. Pass result.failed in TrashWindow.restoreSelected and purgeSelected, and the outcome in use-map-deletion.removeMap.
4. map-access-client and map-creation-client: replace the status branches with failureMessage tables. map-access maps map_admin_required, map_creator_character_required, map_block_owner, map_block_self and map_projection_unavailable, with fallback 'Map access could not be updated.'. map-creation maps map_projection_unavailable, uses the shared rate_limited copy, and has fallback 'The map could not be created.'. Delete the network sentence literals.
5. feedback-view: replace feedbackErrorMessage's branches with a table over title_empty, message_empty, path_invalid, linear_failed and feedback_unconfigured. Stop passing error.detail through. Keep FEEDBACK_NETWORK_ERROR_MESSAGE as the `network` override.
6. StructureComposer: retype Mutation as the union of FailedOutcome for create, update and delete. Add FIELD_ERROR keys 'limit' ('Structure limit reached. Delete one to make room.') and 'system' ('Pick a known system.'). In settle, map failureCode(res) of structure_limit and unknown_system to those keys, and everything else to 'save'.
7. CorpRigEditor: setError(failureMessage(res, { fallback: 'Could not save. Try again.', codes: { not_station_manager: …, not_corp_member: … } })).
8. corp-sharing-card: toast.error(failureMessage(res, { fallback: 'Sharing not changed', codes: { not_director: …, not_corp_member: … } })).
9. account-actions: make the error variants { kind: 'error'; failure?: FailedOutcome<E> } and keep the catch branch without a failure.
10. AccountDangerZone useConfirmGate.run: toast `outcome.failure ? failureMessage(outcome.failure, { fallback: errorToast }) : errorToast` so rate_limited surfaces.
11. Profiles (last): type ProfilesResult's failure as FailedOutcome<typeof updateIndustryProfileEndpoint> | { ok: false } for the list retry path, and AddOutcome as the create or duplicate failures. Rewrite saveFailureMessage and createFailureMessage as failureMessage tables. Add a duplicate table that maps profile_missing to 'This profile was deleted somewhere else.'. Use the helper's fallback for delete.

**Tests.** New src/transport/failure-copy.test.ts:
- network, with and without an override;
- a mapped code;
- unauthenticated default;
- rate_limited with and without retryAfterSeconds;
- protocol falls back;
- an unmapped declared code falls back;
- type-level: a code missing from the endpoint is a compile error via @ts-expect-error;
- a union of two endpoints' outcomes accepts either endpoint's codes.
Update these existing tests:
- src/features/feedback/components/feedback-view.test.ts: the 400 case now asserts mapped copy, not the detail.
- src/features/maps/map-access-client.test.ts and map-creation-client.test.ts: copy strings, plus new 401 cases.
- src/features/maps/TrashWindow.test.ts:94-103: runMapLifecycleBatch now returns `failed`.
- src/platform/auth/account-actions.test.ts: error carries the failure.
- src/features/custom-structures/components/StructureComposer.test.ts and StructureComposer.actions.test.ts: structure_limit and unknown_system.
- src/features/industry-planner/profiles/profile-sync.test.ts and use-industry-profiles.test.ts: duplicate profile_missing.
Add lifecycle cases (network, 401, each 403 code) to src/features/maps/map-lifecycle-client.test.ts, which today does not cover mapLifecycleFailureMessage.

**Notes.** Correct copy, by site:
- map-access's 409 table and the profiles' code tables are the right model.
- mapLifecycleFailureMessage is wrong for every non-403 failure.
- feedback's detail passthrough is wrong: it is developer text, and the client gate (feedbackSubmitGate) already prevents empty title or message.

Behaviour changes to accept deliberately:
- map-access 403 cross_origin now gets the fallback, not the admin copy. It is a CSRF guard, so that is fine.
- 429 copy now uses retryAfterSeconds instead of 'a minute'.

Why the helper is keyed by outcome, not endpoint: OutcomeOf over a union endpoint keeps only shared statuses. That is the StructureComposer and lifecycle-batch case.

Undeclared 401 or 429 responses arrive as kind 'protocol' (decode.ts:66-68), so the shared defaults key on the api code, not on status. Every migrated endpoint declares 401 unauthenticated, so they work.

Dead defensive code found: apiFetch never rejects (api-client.ts:36-46 catches both fetch and decode), so the following can be removed while touching these files:
- FeedbackModal's catch branch;
- use-industry-profiles updateProfile's .catch(() => null);
- account-actions' try/catch.

<sub>Reported by: gap:failure-code-to-user-copy.</sub>

<a id="p046"></a>

## P046: Adopt the eyebrow and title type roles and lock them with a census

- **Status:** [ ] not started
- **Category:** css-styling · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** L · **Risk:** medium · **Payoff:** medium · **Size:** Roughly neutral in lines (≈60 class strings become ≈60 calls, +25 in type-roles). The payoff is tokenised tracking, fewer roles and a census lock, not line count.
- **Depends on:** [P001](wave-07-ui-kit-primitives-src-components-ui.md#p001), [P015](wave-07-ui-kit-primitives-src-components-ui.md#p015), [P034](wave-07-ui-kit-primitives-src-components-ui.md#p034)
- **Existing primitive:** `src/components/ui/type-roles.ts:eyebrow; src/components/ui/page-head.tsx:pageTitle`

**Problem.** ui/type-roles.ts exports eyebrow, but about 55 label class strings re-spell it with drifted tracking (tracking-wide 0.12em, tracking-label 0.08em, tracking-eyebrow 0.18em, plus arbitrary tracking-[0.07em], [0.08em] and [0.12em]), font (font-ui, font-data or inherited) and weight (none, semibold or bold, against eyebrow's default medium). Four de facto clusters exist. (A) The data label 'font-data text-label uppercase tracking-label text-muted' appears about 12 times and is also page-head's pageSubtitle compact. (B) 'text-label uppercase tracking-label text-muted' appears about 12 times, 7 of them in the dev-only MapControls. (C) 'text-label uppercase tracking-wide text-muted' is eyebrow minus font-ui and font-medium. (D) Strong tracking-eyebrow labels with semibold or bold. eyebrow can express none of A, B or D, which is why those sites hand-roll. The panel title 'font-display text-h2 font-semibold tracking-copy uppercase text-name' is retyped outside DialogHeader, and its h3 form outside ConfirmDialog. SectionHead copies the unexported pageTitle compact.

**Verifier revision.** The bypass is real. eyebrow() has 27 call sites, and a grep for uppercase + text-(label|micro) + tracking-* outside eyebrow( finds 63 hand-rolled lines, about 55 of them labels. SectionHead's h2 is exactly pageTitle({size:'compact'}). The DialogHeader title string is retyped in 5 places and its h3 sibling in 3 more. Arbitrary tracking values duplicate tokens: tracking-[0.12em] equals --tracking-wide and tracking-[0.08em] equals --tracking-label. Two claims are wrong and change the plan. (1) The copies are not 'exact eyebrow outputs minus font-ui'. eyebrow defaults to weight:'medium' (font-medium), and most copies set no weight (400). ClonesSection:21, for example, is eyebrow({size:'micro'}) minus font-ui and minus font-medium. Collapsing them onto eyebrow is therefore a visible weight change, and copies with no font class inherit font-data wherever an ancestor sets it, so it can also change the face. A blind codemod is not output-preserving, and every collapse is a design decision. (2) The ControlRow part should be dropped. DialRow sits in MapControls, a dev-only panel (`if (process.env.NODE_ENV !== 'development') return null`, MapControls.tsx:88). It and AdjusterRow differ in gap and tracking, and a ui primitive for one production consumer adds indirection that costs more than it saves. Rescoped: phase 1 is zero-visual-change (pageTitle export, a panelTitle role, token-equal tracking). Phase 2 adds eyebrow axes that reproduce each de facto cluster exactly. Phase 3 collapses clusters deliberately, then locks them with a census test.

**Sites (41).**

- [`src/components/ui/type-roles.ts:1-32`](../../src/components/ui/type-roles.ts#L1-L32) — eyebrow: font-ui, default weight medium, tracking wide\|eyebrow only, no data font, no tracking-label
- [`src/components/ui/page-head.tsx:7-30`](../../src/components/ui/page-head.tsx#L7-L30) — pageTitle cva unexported; pageSubtitle compact = cluster A ('font-data text-label tracking-label uppercase')
- [`src/components/ui/section-head.tsx:30`](../../src/components/ui/section-head.tsx#L30) — class set identical to pageTitle({size:'compact'})
- [`src/components/ui/nav-rail.tsx:69`](../../src/components/ui/nav-rail.tsx#L69) — inside ui: font-ui semibold tracking-label faint (needs a label emphasis); line 108 already uses eyebrow
- [`src/components/ui/dialog.tsx:96-99`](../../src/components/ui/dialog.tsx#L96-L99) — canonical panel title h2 string
- [`src/components/ui/confirm-dialog.tsx:67-71`](../../src/components/ui/confirm-dialog.tsx#L67-L71) — panel title h3 variant plus header chrome
- [`src/features/maps/MapCreationDialog.tsx:88-93`](../../src/features/maps/MapCreationDialog.tsx#L88-L93) — panel title h2 retyped on DialogTitle
- [`src/features/maps/MapAccessDialog.tsx:174-192`](../../src/features/maps/MapAccessDialog.tsx#L174-L192) — full DialogHeader re-implementation; adds min-w-0 break-words (long map names) and a disabled close, which DialogHeader lacks
- [`src/features/maps/MapCatalogue.tsx:139, 258`](../../src/features/maps/MapCatalogue.tsx#L139) — panel title h2 retyped twice (139 adds min-w-0 break-words)
- [`src/mapper/tracking/AfkGate.tsx:67-72`](../../src/mapper/tracking/AfkGate.tsx#L67-L72) — identical to confirm-dialog's h3 title plus chrome string
- [`src/mapper/authoring/NodeAddMenu.tsx:76-79`](../../src/mapper/authoring/NodeAddMenu.tsx#L76-L79) — panel title h3 retyped
- [`src/features/feedback/components/FeedbackModal.tsx:262-265`](../../src/features/feedback/components/FeedbackModal.tsx#L262-L265) — panel title h3, bold variant
- [`src/features/industry-planner/components/kpi-tile.tsx:7`](../../src/features/industry-planner/components/kpi-tile.tsx#L7) — KPI_LABEL = eyebrow({weight:'semibold'}) minus font-ui (genuinely close)
- [`src/components/composition/board/sections/ClonesSection.tsx:21`](../../src/components/composition/board/sections/ClonesSection.tsx#L21) — eyebrow({size:'micro'}) minus font-ui and minus font-medium (cluster C)
- [`src/components/composition/ErrorPanel.tsx:35, 44`](../../src/components/composition/ErrorPanel.tsx#L35) — cluster D; 35 adds font-data
- [`src/components/composition/NotFoundContent.tsx:11`](../../src/components/composition/NotFoundContent.tsx#L11) — cluster D with font-data
- [`src/components/composition/GlobalSearch.tsx:204, 232`](../../src/components/composition/GlobalSearch.tsx#L204) — 204 font-data tracking-[0.07em] (off-token); 232 cluster B faint
- [`src/app/(site)/sites/[id]/page.tsx:73`](../../src/app/%28site%29/sites/[id]/page.tsx#L73) — tracking-[0.12em] == tracking-wide token (missed by finders)
- [`src/features/changelog/components/EntryCard.tsx:18`](../../src/features/changelog/components/EntryCard.tsx#L18) — font-data tracking-[0.08em] == cluster A with an arbitrary value (missed by finders)
- [`src/features/wormhole-sites/components/SitesFilterLayout.tsx:101, 105, 127, 236`](../../src/features/wormhole-sites/components/SitesFilterLayout.tsx#L101) — cluster C ×3; 236 cluster D semibold
- [`src/features/wormhole-sites/components/SiteMetaStrip.tsx:15, 21`](../../src/features/wormhole-sites/components/SiteMetaStrip.tsx#L15) — cluster D
- [`src/features/wormhole-sites/components/RelatedSites.tsx:11, 19`](../../src/features/wormhole-sites/components/RelatedSites.tsx#L11) — B and A (missed by finders)
- [`src/app/(site)/settings/corporations/corp-sharing-card.tsx:74`](../../src/app/%28site%29/settings/corporations/corp-sharing-card.tsx#L74) — cluster C (87 and 92 are a DialogClose and a button; excluded)
- [`src/app/(site)/settings/characters/page.tsx:112`](../../src/app/%28site%29/settings/characters/page.tsx#L112) — cluster B
- [`src/features/industry-planner/components/CockpitRawLedger.tsx:47, 68`](../../src/features/industry-planner/components/CockpitRawLedger.tsx#L47) — 47 D semibold; 68 A
- [`src/features/industry-planner/components/CockpitBuildPlan.tsx:136`](../../src/features/industry-planner/components/CockpitBuildPlan.tsx#L136) — D semibold
- [`src/features/industry-planner/components/MeAdjuster.tsx:182-189`](../../src/features/industry-planner/components/MeAdjuster.tsx#L182-L189) — AdjusterRow label = cluster C
- [`src/features/industry-planner/components/NodeCard.tsx:139, 278`](../../src/features/industry-planner/components/NodeCard.tsx#L139) — C and A
- [`src/features/industry-planner/components/PlannerRail.tsx:75`](../../src/features/industry-planner/components/PlannerRail.tsx#L75) — A at micro size
- [`src/features/industry-planner/components/ComponentDrawer.tsx:74, 155`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L74) — A micro and A (file already uses eyebrow at 106/181/241, so it mixes both)
- [`src/features/industry-planner/components/structure-bonus-readout.tsx:26`](../../src/features/industry-planner/components/structure-bonus-readout.tsx#L26) — A plus leading-none
- [`src/components/composition/account/RevokeRedirectLightbox.tsx:39`](../../src/components/composition/account/RevokeRedirectLightbox.tsx#L39) — cluster C in text-tone-red (eyebrow has no red tone)
- [`src/app/(site)/admin/ActivityChart.tsx:14`](../../src/app/%28site%29/admin/ActivityChart.tsx#L14) — C micro
- [`src/mapper/chain/NoMapAccess.tsx:10`](../../src/mapper/chain/NoMapAccess.tsx#L10) — D with font-data
- [`src/mapper/log/MapEventLog.tsx:61`](../../src/mapper/log/MapEventLog.tsx#L61) — A
- [`src/mapper/tracking/ScannerCharacterPrompt.tsx:71`](../../src/mapper/tracking/ScannerCharacterPrompt.tsx#L71) — A
- [`src/mapper/signatures/scanner-prompt-rail.tsx:41`](../../src/mapper/signatures/scanner-prompt-rail.tsx#L41) — A
- [`src/mapper/signatures/scanner-section-table.tsx:123, 179`](../../src/mapper/signatures/scanner-section-table.tsx#L123) — font-ui medium/semibold tracking-label (missed by finders)
- [`src/features/maps/CharacterSearchControl.tsx:172`](../../src/features/maps/CharacterSearchControl.tsx#L172) — font-ui tracking-label (B with font-ui)
- [`src/features/maps/MapCreationDialog.tsx:105`](../../src/features/maps/MapCreationDialog.tsx#L105) — A faint
- [`src/mapper/canvas/MapControls.tsx:88, 144, 159, 233, 248, 369, 392, 405-418`](../../src/mapper/canvas/MapControls.tsx#L88) — dev-only panel (88 returns null outside development); 7 copies of cluster B; DialRow at 405-418

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/account/LoginButton.tsx:92`](../../src/components/composition/account/LoginButton.tsx#L92) — interactive button styling, not a label
- [`src/components/composition/account/RevokeRedirectLightbox.tsx:52`](../../src/components/composition/account/RevokeRedirectLightbox.tsx#L52) — link-styled button
- [`src/app/(site)/settings/corporations/corp-sharing-card.tsx:87, 92`](../../src/app/%28site%29/settings/corporations/corp-sharing-card.tsx#L87) — DialogClose and a destructive text button
- [`src/components/composition/industry-workspace/StructuresManager.tsx:33`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L33) — hover-revealed action link styling
- [`src/features/wormhole-sites/components/SiteCard.tsx:19`](../../src/features/wormhole-sites/components/SiteCard.tsx#L19) — link with hover:text-name
- [`src/mapper/windows/MapWindow.tsx:150-153`](../../src/mapper/windows/MapWindow.tsx#L150-L153) — window title variants with text-name and centring; a title role, not an eyebrow
- [`src/app/(site)/legal/page.tsx:39`](../../src/app/%28site%29/legal/page.tsx#L39) — pageTitle-like at text-h3, a size pageTitle lacks; leave unless a design pass adds it
- [`src/mapper/canvas/MapControls.tsx:405-418`](../../src/mapper/canvas/MapControls.tsx#L405-L418) — DialRow plus MeAdjuster AdjusterRow: no ui ControlRow, since only one consumer is production and gap and tracking differ

</details>

**Home.** `src/components/ui/type-roles.ts (extend eyebrow; add panelTitle; move pageTitle here and export it), with page-head.tsx importing pageTitle back`

**Boundary check.** Home zone ui; the rule {from:'ui', allow:[]} holds because type-roles imports only class-variance-authority, and page-head, section-head, dialog, confirm-dialog and nav-rail are same-zone. components-composition (ErrorPanel, NotFoundContent, GlobalSearch, ClonesSection, RevokeRedirectLightbox) allows 'ui'. features (maps, industry-planner, wormhole-sites, changelog, feedback) allows 'ui'. mapper (NoMapAccess, MapEventLog, scanner-*, AfkGate, NodeAddMenu) allows 'ui'. app (settings, admin, sites) allows 'ui'.

**API sketch.**

```ts
// type-roles.ts
export const eyebrow = cva('uppercase', { variants: {
  font: { ui: 'font-ui', data: 'font-data', inherit: '' },          // default 'ui'
  size: { micro: 'text-micro', label: 'text-label' },
  tone: { muted, faint, isk, callout, inherit },                      // as today
  weight: { regular: '', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' }, // default 'medium'
  emphasis: { label: 'tracking-label', normal: 'tracking-wide', strong: 'tracking-eyebrow' },  // default 'normal'
}, defaultVariants: { font: 'ui', size: 'label', tone: 'muted', weight: 'medium', emphasis: 'normal' } });
export const dataLabel = (o?) => eyebrow({ font: 'data', weight: 'regular', emphasis: 'label', ...o }); // cluster A
export const pageTitle = cva('font-display font-bold leading-none tracking-optical uppercase text-name', { variants: { size: { hero: 'text-display', page: 'text-title', compact: 'text-h2' } }, defaultVariants: { size: 'page' } });
export const panelTitle = cva('font-display tracking-copy uppercase text-name', { variants: { size: { h2: 'text-h2', h3: 'text-h3' }, weight: { semibold: 'font-semibold', bold: 'font-bold' }, wrap: { true: 'min-w-0 break-words', false: '' } }, defaultVariants: { size: 'h2', weight: 'semibold', wrap: false } });
```

**Migration steps.**

1. Phase 1, zero visual change. Move pageTitle from page-head.tsx:7-19 into type-roles.ts, export it, and import it back in page-head. Replace section-head.tsx:30's literal with pageTitle({size:'compact'}).
2. Add panelTitle. Use it in dialog.tsx:98 (h2) and confirm-dialog.tsx:69 (h3, keeping the chrome classes). Then replace the retyped strings at MapCreationDialog.tsx:90, MapAccessDialog.tsx:178 (wrap:true), MapCatalogue.tsx:139 (wrap:true) and 258, AfkGate.tsx:69, NodeAddMenu.tsx:78, and FeedbackModal.tsx:264 (size h3, weight bold). Consider giving DialogHeader's title wrap:true: MapAccessDialog's break-words handles long map names and is the correct copy.
3. Replace token-equal arbitrary tracking: sites/[id]/page.tsx:73 tracking-[0.12em] → tracking-wide; EntryCard.tsx:18 tracking-[0.08em] → tracking-label.
4. Phase 2, output-preserving. Extend eyebrow with font (ui|data|inherit), weight 'regular' and 'bold', and emphasis 'label', keeping the existing defaults so the 27 current call sites are unchanged. Add dataLabel for cluster A and also use it for page-head's pageSubtitle compact. Migrate each hand-rolled site to the eyebrow/dataLabel call that reproduces its exact class set: use font:'inherit' and weight:'regular' where the copy had none, and pass a non-variant tone (text-tone-red, text-name) through className via cn(). Do clusters A, D, C, B in that order, ui's nav-rail:69 first.
5. Phase 3, deliberate collapse, reviewed on src/app/(site)/preview/primitives. Decide whether C (tracking-wide, weight 400) and B (tracking-label, weight 400) should merge into eyebrow's defaults, whether font:'inherit' sites become font-ui (check each for a font-data ancestor first), and GlobalSearch.tsx:204 tracking-[0.07em] → tracking-label (+0.01em). Remove the font:'inherit' and weight:'regular' axes if nothing still needs them.
6. Add a census case to src/esi-datasets/ui-adoption.test.ts (the existing adoption guard): production files outside ui matching /uppercase[^"']*text-(?:label|micro)[^"']*tracking-|tracking-\[0\.\d+em\]/ must equal a recorded allowlist in src/composition/__tests__/ui-adoption-registry.ts (interactive links and buttons only). Shrink that allowlist to its final set at the end of phase 2.

**Tests.** Existing guards: src/components/ui/page-shell.test.ts and coverage.test.ts render ui heads. Run SectionHead and DialogHeader markup through them, or add a type-roles.test.ts asserting pageTitle({size:'compact'}), panelTitle() and dataLabel() class strings, so phase 1 and 2 are provably output-identical. Add the census case in src/esi-datasets/ui-adoption.test.ts with its allowlist in ui-adoption-registry.ts. Markup tests that assert class substrings (for example MapEventLog.test.ts:129 'bottom-4 right-14') are unaffected; grep consumer tests for 'tracking-' and 'uppercase' substrings before each batch.

**Notes.** Drift and right-copy calls. (1) eyebrow's default font-medium versus no weight in most copies is the largest hidden visual difference; do not let a codemod introduce it silently. (2) Body text is font-ui (globals.css:464), so adding font-ui is a no-op except under a font-data ancestor; check each no-font site. (3) MapAccessDialog's header (min-w-0 break-words, disabled close) is the more correct DialogHeader. If the dialog-kit opportunity extends DialogHeader with wrap and closeDisabled, MapAccessDialog.tsx:174-192 can use DialogHeader outright. (4) The tracking tokens (optical 0.01, copy 0.04, label 0.08, wide 0.12, eyebrow 0.18em; globals.css:355-359) and the font tokens are already registered in cn.ts tailwind-merge, so cn(eyebrow(), 'tracking-label') overrides correctly. eyebrow({className}) does not merge, so use cn() for overrides. (5) The seven MapControls copies are in a dev-only panel; migrate them last or leave them on the allowlist.

<sub>Reported by: area:ui-components, concern:ui-patterns, dupes-triage-1.</sub>

<a id="p246"></a>

## P246: Declare each Convex HTTP door contract once, per operation, and type postConvexHttpDoor by it

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** L · **Risk:** medium · **Payoff:** medium · **Size:** About -200 / +120. Six error classes go from 6 lines each to 1. The hand-written jump input types (~40 lines), TrackingSelection and TrackingReceiptCandidate, three Convex purge/leave schemas, and duplicate response schemas move into per-owner door modules.
- **Depends on:** [P247](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p247), [P208](wave-14-convex-backend-helpers.md#p208), [P209](wave-06-config-env-ids-and-shared-domain-vocabularies.md#p209)
- **Existing primitive:** `src/lib/convex-http-door.ts:postConvexHttpDoor; convex/lib/httpAuth.ts:authorizedJsonAction; precedent: convex already imports pure data contracts (@/data/maps/access-contract, @/data/maps/scan-parse, @/data/location-tracking/constants)`

**Problem.** Each Next-to-Convex door is described in up to four places that nothing checks against each other:
- Convex zod request schemas (convex/httpJump.ts, httpMapAccess.ts, httpAccountMerge.ts, httpLocation.ts, httpEngine.ts).
- Hand-written Next input types and `body: unknown`, e.g. AuthorJumpDecision/AuthorJumpInput/AnswerJumpInput, TrackingSelection, TrackingReceiptCandidate, MapAccessClaim, and the leave-sync input type.
- Next-only zod response schemas.
- Path string literals in convex/http.ts, every caller, and convex/__tests__/http.setup.ts.

Drift already present:
- The snapshot response parser (merge.ts:19) allows a negative lastProcessedTransitionAt that the restore door rejects (httpAccountMerge.ts:37).
- The Next purge loop's literal 32 (map-access-projection.ts:294,298) must match `.max(32)` (httpMapAccess.ts:46).
- claimsCarryCharacters is duplicated across runtimes (map-access-projection.ts:209-211 and convex/mapAccessProjection.ts:45-49).
- Purge doors accept an empty userId and any characterId (httpLocation.ts:6-9, httpEngine.ts:6-9, httpMapAccess.ts:39-41). project-map-access accepts an empty mapId (httpMapAccess.ts:13).
- map-tracking-snapshot is parsed non-strictly with only int() characterIds (map-character-scoping.ts:33-35), unlike every other door response.
- The test path union lacks /purge-user-map-claims.

Six callers also declare the same 6-line Error subclass, because postConvexHttpDoor requires an error constructor. Two other callers pass bare `Error` with `schema: z.unknown()`.

**Verifier revision.** The core claim holds. 16 Convex HTTP doors (convex/http.ts:22-97) keep their request contract in convex/http*.ts zod, their response contract in Next zod, and their input types in hand-written Next TS. Nothing links the halves, and the path list is copied a third time in convex/__tests__/http.setup.ts:7-23, which has already drifted: it is missing '/purge-user-map-claims'. Five parts of the proposal had to change. (1) The 'ProjectionResult omits unscoped-refused' drift is wrong: requireScopedDelivery (map-access-projection.ts:221-225) throws on that outcome, so ProjectionResult is correctly the narrowed post-check type. (2) One {path, request, response} per door does not fit /jump-evidence, /resolve-jump or /signature-elimination, where the response schema depends on the request discriminant. Contracts must be per operation and share a path. (3) The shared purge body cannot live in src/data/convex: data sub-zones may import only data/eve-data among the data zones (rule from:data), and the grep shows no other data-to-data import, so data/online-status and data/location-tracking could not reach it. It moves to lib. (4) A doorError(name) factory breaks type positions: map-access-update.ts:35 uses ProjectionUnavailableError as a type. Use a base class plus one-line subclasses. (5) I added the missed sites: the test path union, map-character-scoping's non-strict snapshot door, the two purge callers passing `schema: z.unknown(), error: Error`, the Convex-internal EliminationDeduction copy, and the /merge-user-state door, which has no caller outside convex/.

**Sites (29).**

- [`src/lib/convex-http-door.ts:5-66`](../../src/lib/convex-http-door.ts#L5-L66) — existing helper: body: unknown, per-call schema, required error ctor
- [`convex/lib/httpAuth.ts:29-40`](../../convex/lib/httpAuth.ts#L29-L40) — authorizedJsonAction(schema, handle) — Convex edge parser the shared request schemas plug into
- [`convex/http.ts:22-97`](../../convex/http.ts#L22-L97) — 16 door paths as string literals
- [`convex/__tests__/http.setup.ts:7-23`](../../convex/__tests__/http.setup.ts#L7-L23) — third copy of the path list; already missing '/purge-user-map-claims'
- [`convex/httpJump.ts:7-93`](../../convex/httpJump.ts#L7-L93) — request schemas for 3 multi-operation doors; jumpDecisionSchema 22-35, eliminationDeductionSchema 65-77; mixes z.object (37-63) and z.strictObject (7-20, 79-93)
- [`src/composition/jump-resolver/convex-door.ts:9-165`](../../src/composition/jump-resolver/convex-door.ts#L9-L165) — response schemas 9-59 differ per operation (transition vs connection evidence, author vs confirm/reassociate); hand-written AuthorJumpDecision/AuthorJumpInput/AnswerJumpInput 69-108; JumpConvexUnavailableError 110-115
- [`convex/mapJumpAuthoring.ts:27-66`](../../convex/mapJumpAuthoring.ts#L27-L66) — v validator 27-40 plus TS JumpDecision 42-54 plus ResolveJumpInput 56-66 (Convex-internal twins, handled by the separate Infer<> opportunity)
- [`src/composition/jump-resolver/resolver.ts:402-416, 430-443`](../../src/composition/jump-resolver/resolver.ts#L402-L416) — consumers of AuthorJumpInput/AnswerJumpInput; passes readonly arrays from the matcher
- [`convex/mapScan.ts:68-110`](../../convex/mapScan.ts#L68-L110) — v validators for elimination deduction/outcome/evidence
- [`convex/lib/mapScanElimination.ts:379-390`](../../convex/lib/mapScanElimination.ts#L379-L390) — missed: another TS copy of EliminationDeduction (Id-typed)
- [`src/composition/signature-elimination/convex-door.ts:6-75`](../../src/composition/signature-elimination/convex-door.ts#L6-L75) — evidence/outcome response schemas; EliminationConvexUnavailableError 37-42; body: unknown
- [`convex/httpMapAccess.ts:11-55`](../../convex/httpMapAccess.ts#L11-L55) — mapId z.string() at 13; purge userId z.string() at 40; mapIds .max(32) at 46
- [`src/composition/map-access-projection.ts:20-76, 194-232, 276-304`](../../src/composition/map-access-projection.ts#L20-L76) — MapClaimCharacter/MapAccessClaim TS, response schema with 4 outcomes, ProjectionUnavailableError, claimsCarryCharacters copy, literal batch 32
- [`convex/mapAccessProjection.ts:38-49, 210-232, 285-290`](../../convex/mapAccessProjection.ts#L38-L49) — ReconcileResult and claimsCarryCharacters original; purgeUserMapClaims args have no max of their own
- [`convex/lib/mapEntityContracts.ts:208-212`](../../convex/lib/mapEntityContracts.ts#L208-L212) — mapClaimCharactersValidator (Convex side of MapClaimCharacter)
- [`src/composition/map-character-scoping.ts:33-46`](../../src/composition/map-character-scoping.ts#L33-L46) — missed: /map-tracking-snapshot response parsed with non-strict z.object and characterId int() only
- [`src/composition/map-purge.ts:14-36`](../../src/composition/map-purge.ts#L14-L36) — MapPurgeUnavailableError plus /purge-map-chain caller
- [`convex/httpAccountMerge.ts:8-66`](../../convex/httpAccountMerge.ts#L8-L66) — selections .max(1000) with nonnegative lastProcessedTransitionAt (37); receipts .max(MERGE_RECEIPT_BATCH_SIZE)
- [`convex/accountMerge.ts:73-76, 100-109, 125-129, 174`](../../convex/accountMerge.ts#L73-L76) — MERGE_TRACKING_LIMIT and trackingSelectionValidator; TrackingSelection already Infer<> on the Convex side
- [`src/data/location-tracking/merge.ts:6-84`](../../src/data/location-tracking/merge.ts#L6-L84) — LocationTrackingMergeError; snapshot schema .max(1000) without nonnegative (17-20); receiptCandidateSchema plus duplicate TrackingReceiptCandidate interface (47-55)
- [`src/data/location-tracking/schema.ts:6-16`](../../src/data/location-tracking/schema.ts#L6-L16) — TrackingSelection interface also types the pending_tracking_merges jsonb column
- [`src/data/location-tracking/purge.ts:7-18`](../../src/data/location-tracking/purge.ts#L7-L18) — missed: /purge-location-tracking with schema z.unknown(), error: Error
- [`src/data/online-status/purge.ts:5-15`](../../src/data/online-status/purge.ts#L5-L15) — missed: /purge-online with schema z.unknown(), error: Error
- [`convex/httpLocation.ts:6-20`](../../convex/httpLocation.ts#L6-L20) — purge body (6-9) and leave-sync body (11-15)
- [`convex/httpEngine.ts:6-9`](../../convex/httpEngine.ts#L6-L9) — identical purge body
- [`src/data/convex/api-contract.ts:4-9`](../../src/data/convex/api-contract.ts#L4-L9) — browser-facing leaveSyncRequestSchema (strict, same dataset/tabId bounds)
- [`src/data/convex/leave-door.ts:4-27`](../../src/data/convex/leave-door.ts#L4-L27) — leave body as TS type; LeaveSyncDoorError
- [`src/app/api/sync-leave/route.ts:22-31`](../../src/app/api/sync-leave/route.ts#L22-L31) — builds the door body field by field; instanceof LeaveSyncDoorError
- [`src/composition/map-access-update.ts:26-36, 77`](../../src/composition/map-access-update.ts#L26-L36) — ProjectionUnavailableError used as a type and in instanceof, so a class factory would break it

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/map-access-projection.ts:39-42, 217-232`](../../src/composition/map-access-projection.ts#L39-L42) — ProjectionResult omitting 'unscoped-refused' is correct: requireScopedDelivery throws on that outcome and returns the narrowed union. Derive it with Exclude<>, but do not add the outcome.
- [`src/data/maps/hole-matching.ts:33-40`](../../src/data/maps/hole-matching.ts#L33-L40) — JumpMatchOutcome is the domain matcher output, not a door contract. The door decision is this plus candidateIds (resolver.ts:402-403). Keep it canonical and check the door schema against it.
- [`src/data/maps/signature-eliminator.ts:23-34`](../../src/data/maps/signature-eliminator.ts#L23-L34) — Domain EliminationDeduction is the producer type. Keep it, and make the door's deduction schema `satisfies` it instead of replacing it.
- [`convex/mapJumpReads.ts:21-29`](../../convex/mapJumpReads.ts#L21-L29) — EmissionFacts is the Convex producer type, Id-branded. It cannot come from a zod schema; the Infer<> opportunity covers it.
- [`convex/lib/syncFields.ts:3-6`](../../convex/lib/syncFields.ts#L3-L6) — purgeScopeArgs is the v validator for internal mutation args. It stays v; only the HTTP zod body is shared.
- [`convex/httpAccountMerge.ts:8-21`](../../convex/httpAccountMerge.ts#L8-L21) — /merge-user-state has no caller outside convex/ (repo-wide grep), so it gets no Next contract. It is a dead-door candidate to confirm and delete separately.

</details>

**Home.** `src/lib/convex-door-contract.ts (new, zod-only: defineConvexDoor, ConvexDoor, purgeScopeRequestSchema). src/lib/convex-http-door.ts (typed postConvexHttpDoor and the ConvexDoorError base). Per-owner pure door modules: src/data/maps/convex-doors.ts, src/data/location-tracking/convex-doors.ts, src/data/online-status/convex-doors.ts, and src/data/convex/leave-contract.ts. claimsCarryCharacters goes into the existing src/data/maps/access-contract.ts.`

**Boundary check.** - src/lib/convex-door-contract.ts and convex-http-door.ts are in zone lib, which may import only config. They import zod and lib. Importers: convex (rule from:convex allows lib), every data/* zone (from:data allows lib), composition (from:composition allows lib).
- src/data/maps/convex-doors.ts is zone data/maps. It imports lib and data/eve-data/wormhole-contract, both allowed by from:data. Importers: convex (from:convex allows data, with precedent: convex already imports @/data/maps/access-contract, chain-contract and scan-parse) and composition (from:composition allows data).
- src/data/location-tracking/convex-doors.ts: importers are the same zone (merge.ts, purge.ts, schema.ts) and convex.
- src/data/online-status/convex-doors.ts: importers are the same zone (purge.ts) and convex.
- src/data/convex/leave-contract.ts: importers are data/convex (api-contract.ts, leave-door.ts) and convex. app/api reaches it through api-contract (from:api allows data).
- Rejected: the original plan's shared purge body in src/data/convex. data/online-status and data/location-tracking may not import data/convex, because from:data allows only data/eve-data among the data zones, and the grep confirms no other cross-data imports. That shared schema therefore lives in lib.
- Keep defineConvexDoor out of convex-http-door.ts so Convex does not bundle the fetch client. Also keep the leave fields out of api-contract.ts so Convex does not pull transport/endpoint.

**API sketch.**

```ts
// src/lib/convex-door-contract.ts
export interface ConvexDoor<P extends `/${string}` = `/${string}`, Req extends z.ZodType = z.ZodType, Res extends z.ZodType = z.ZodType> { readonly path: P; readonly request: Req; readonly response: Res }
export function defineConvexDoor<const P extends `/${string}`, Req extends z.ZodType, Res extends z.ZodType>(door: ConvexDoor<P, Req, Res>): ConvexDoor<P, Req, Res>;
export const purgeScopeRequestSchema = z.object({ userId: z.string().min(1), characterId: z.number().int().positive().nullable() });

// src/lib/convex-http-door.ts
export class ConvexDoorError extends Error { constructor(message: string, options?: { cause?: unknown }) }
export function postConvexHttpDoor<D extends ConvexDoor>(door: D, body: z.input<D['request']>, options: { label: string; error?: new (m: string, o?: { cause?: unknown }) => Error; timeoutMs?: number; signal?: AbortSignal }): Promise<z.output<D['response']>>;

// one door per operation; operations that share a path share door.path
export const jumpTransitionEvidenceDoor = defineConvexDoor({ path: '/jump-evidence', request: z.strictObject({ mode: z.literal('transition'), userId, mapId, characterId }), response: transitionEvidenceSchema });
// Convex: authorizedJsonAction(z.discriminatedUnion('mode', [jumpTransitionEvidenceDoor.request, jumpConnectionEvidenceDoor.request]), ...)
export const MAP_CLAIM_PURGE_BATCH = 32;
export type ProjectionResult = Exclude<z.output<typeof projectMapAccessDoor.response>, { outcome: 'unscoped-refused' }>;
// error subclasses: export class LeaveSyncDoorError extends ConvexDoorError { override readonly name = 'LeaveSyncDoorError'; }
```

**Migration steps.**

1. Add src/lib/convex-door-contract.ts (ConvexDoor, defineConvexDoor, purgeScopeRequestSchema) with a colocated test.
2. In src/lib/convex-http-door.ts:
- Add the ConvexDoorError base class.
- Change postConvexHttpDoor to (door, body: z.input<request>, options), parse with door.response, and make `error` optional, defaulting to ConvexDoorError.
- Update src/lib/convex-http-door.test.ts.
Fallow fails on unused exports, so switch the signature and all 9 caller files (step 3 onward) in one change, or add a temporarily named function and delete the old one once the last caller moves.
3. Purge-scope doors:
- Create src/data/online-status/convex-doors.ts (purgeOnlineDoor) and add purgeLocationTrackingDoor to src/data/location-tracking/convex-doors.ts, both with request purgeScopeRequestSchema and response z.unknown().
- convex/httpEngine.ts:6-9 and convex/httpLocation.ts:6-9 use door.request; delete their local schemas.
- online-status/purge.ts and location-tracking/purge.ts drop `schema: z.unknown(), error: Error`.
4. Leave sync:
- Move leaveSyncRequestSchema to src/data/convex/leave-contract.ts and have api-contract.ts import it.
- Define leaveSyncDoor = { path: '/leave-sync', request: leaveSyncRequestSchema.extend({ userId: z.string().min(1) }), response: z.strictObject({ retired: z.boolean() }) }.
- convex/httpLocation.ts:11-15 uses it.
- leave-door.ts posts via the door and keeps LeaveSyncDoorError as a ConvexDoorError subclass.
5. Merge tracking, in src/data/location-tracking/convex-doors.ts:
- Add MERGE_TRACKING_LIMIT = 1000 and trackingSelectionSchema (mapId min 1, characterId int positive, lastProcessedTransitionAt nonnegative optional).
- Add the snapshot, restore, list-receipts and delete-receipts doors, with receiptCandidateSchema bounded by MERGE_RECEIPT_BATCH_SIZE.
- Replace the TrackingSelection interface (schema.ts:6-10) with a z.infer type import, and delete TrackingReceiptCandidate (merge.ts:52-55).
- convex/accountMerge.ts imports MERGE_TRACKING_LIMIT, and convex/httpAccountMerge.ts:24-66 uses door.request.
6. Map access, in src/data/maps/convex-doors.ts:
- Add projectMapAccessDoor (keep the duplicate-userId superRefine and give mapId min(1)), purgeMapAccessDoor (userId min 1), purgeUserMapClaimsDoor (MAP_CLAIM_PURGE_BATCH), purgeMapChainDoor and mapTrackingSnapshotDoor (strict response, characterId positive).
- Move claimsCarryCharacters into src/data/maps/access-contract.ts and import it from both convex/mapAccessProjection.ts:45-49 and map-access-projection.ts:209-211.
- Derive ProjectionResult with Exclude<> and use MAP_CLAIM_PURGE_BATCH in the Next loop (map-access-projection.ts:294-298).
7. Jump and elimination: define one door per operation:
- transition and connection on /jump-evidence;
- author, confirm and reassociate on /resolve-jump;
- evidence and apply on /signature-elimination.
Move the response schemas verbatim from the two convex-door.ts files. Make the deduction schema `satisfies` the domain EliminationDeduction, and make the decision schema `satisfies` JumpMatchOutcome & { candidateIds }. convex/httpJump.ts builds each discriminatedUnion from the door.request objects. Delete AuthorJumpDecision, AuthorJumpInput and AnswerJumpInput (convex-door.ts:69-108) and type resolver.ts with z.input. Callers that hold readonly arrays copy them (`[...x]`), as convex-door.ts:72 already does, because z.input arrays are mutable.
8. Route on door.path:
- convex/http.ts: route each door on door.path, once per path.
- convex/__tests__/http.setup.ts: type the path parameter from the door paths. This adds the missing /purge-user-map-claims.
9. Turn the six Error classes into one-line ConvexDoorError subclasses that keep their names and instanceof behavior. Set `name` explicitly, not from new.target.name, because minified server builds can mangle class names.
10. Keep each door's current request strictness (z.object versus z.strictObject) unless the step above notes otherwise. Convex-side tightenings are safe to deploy at any time, because Next already sends valid values. Next-side response tightenings (nonnegative, strict snapshot) change only parsing. Confirm the /merge-user-state door is dead and delete it in a separate change.

**Tests.** New:
- src/lib/convex-door-contract.test.ts: identity plus purgeScopeRequestSchema bounds.
- src/data/maps/convex-doors.test.ts and src/data/location-tracking/convex-doors.test.ts: per-door request/response parsing. Include a round trip in which a snapshot response selection must parse under the restore request schema; this guards the nonnegative drift. Also assert MAP_CLAIM_PURGE_BATCH is what both sides use.
- A test that every door path is routed in convex/http.ts.

Update src/lib/convex-http-door.test.ts: response parsing through door.response, the default ConvexDoorError, and subclass instanceof and name.

Existing guards:
- Convex edge 400/401: convex/httpJump.test.ts, httpMapAccess.test.ts, httpAccountMerge.test.ts, httpLocation.test.ts, httpEngine.test.ts, convex/__tests__/export-coverage.test.ts.
- Next side: src/composition/jump-resolver/convex-door.test.ts, signature-elimination/convex-door.test.ts, map-access-projection.test.ts (the batching assertion near line 94), map-purge.test.ts, map-character-scoping.test.ts, data/location-tracking/merge.test.ts and purge.test.ts, data/online-status/purge.test.ts, data/convex/leave-door.test.ts, account-lifecycle/owner-transfer.db.test.ts.

**Notes.** Behavior to preserve:
- Response schemas stay strict: map-access-projection relies on strict parsing to detect an old Convex during rollout (226-230).
- Keep the projectMapAccess duplicate-userId superRefine.
- Keep the per-door timeouts (merge doors use 4000 ms) and labels.
- Keep the NEXT_PUBLIC_CONVEX_URL short-circuits in the purge callers.
- In zod 4.5.4, .superRefine keeps a ZodObject, so refined per-operation objects still compose into discriminatedUnion.

Drift and which side is right:
- Convex is right on lastProcessedTransitionAt nonnegative and on mapId/userId min(1).
- The Next strict parsers are right over the non-strict map-character-scoping parser.
- ProjectionResult is already correct.

JumpConvexUnavailableError and EliminationConvexUnavailableError are only instanceof-checked in their own tests.

The Convex-internal v validators and TS twins stay; the separate 'Derive Convex TS types from validators' opportunity covers them. P247's positiveIdSchema and int4IdSchema should be used inside the door contracts if they land first.

<sub>Reported by: area:convex, concern:contracts-types, dupes-triage-1, dupes-triage-2.</sub>

← [Wave 15: Mapper client: canvas, tracking, scanner and authoring](wave-15-mapper-client-canvas-tracking-scanner-and.md) · [Index](README.md#roadmap)
