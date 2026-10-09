# Wave 9: Auth, routes and the mutation/transport pipeline

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 8: Charts, images and board/workspace adoption](wave-08-charts-images-and-board-workspace-adoption.md) · [Index](README.md#roadmap) · [Wave 10: Server pipelines, purge, telemetry and the admin console](wave-10-server-pipelines-purge-telemetry-and-the-admin.md) →

parseFormBody gets a field list, admin and form routes move onto runMutationRoute, and seeOther starts stashing failures. Admin policy, then requireSessionPage and auth codes, then resolveNotice and typed codes, then notLinkedFailure. Next, stage failures are checked against contracts and the platform pass-throughs collapse. Owned-data telemetry gets endpoint keys and observeCostPromise, then come the versioned asset route, readOr and read-identity guards. Then the SSO credential builder, eve-account predicates and linked-account ids. Two medium-risk items close the wave: P176 session guards and drain coalescing, then P161 unlinkCharacter on the settled routes.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☐ | [P251](#p251) | Make parseFormBody take a field list and own the form-field failure | contracts-validation | S | low | low | — |
| ☐ | [P141](#p141) | Move the four admin form routes, account/delete and feedback onto runMutationRoute; delete adminMutationGate and checkAdminMutation | api-route | M | low | medium | — |
| ☐ | [P146](#p146) | Add a seeOther 303 helper in transport that stashes the failure for capability telemetry, and use it in all eight form-post routes | api-route | M | low | medium | [P251](#p251) |
| ☐ | [P167](#p167) | Parse SUPERADMIN_CHARACTER_ID once and keep one admin predicate in platform/auth | server-pipeline | S | low | medium | — |
| ☐ | [P254](#p254) | Add requireSessionPage and a typed auth_error vocabulary so login_required shows a notice | contracts-validation | S | low | medium | [P167](#p167) |
| ☐ | [P255](#p255) | Resolve query-string notices with one own-key typed resolver and type each flow's notice codes | contracts-validation | M | low | medium | [P146](#p146), [P254](#p254) |
| ☐ | [P256](#p256) | Share the not_linked failure, make setActiveCharacter ownership-checked, and use accountBelongsToUser where only membership is asked | contracts-validation | S | low | low | [P255](#p255) |
| ☐ | [P250](#p250) | Check runMutationRoute stage failures against the endpoint contract, and derive status only where it varies | contracts-validation | S | low | medium | [P142](wave-01-quick-wins-delete-dead-code-fix-small.md#p142), [P141](#p141) |
| ☐ | [P306](#p306) | Collapse pass-through helpers in platform (scoreboard dispatch, token reflection, auth form schemas, rate-limit preflight) | simplification | S | low | low | [P142](wave-01-quick-wins-delete-dead-code-fix-small.md#p142), [P136](wave-01-quick-wins-delete-dead-code-fix-small.md#p136) |
| ☐ | [P143](#p143) | Key measureOwnedDataRead by the endpoint contract, measure corp-structures, and guard every OnView route | api-route | S | low | low | — |
| ☐ | [P160](#p160) | Rebuild measureOwnedDataRead on observeCostPromise with a result-metadata hook | server-pipeline | S | low | low | [P143](#p143) |
| ☐ | [P153](#p153) | Serve the three versioned universe-asset routes from one versionedAssetRoute shell parsed with endpoint.params, and teach the route-contract test the shell | api-route | S | low | low | — |
| ☐ | [P149](#p149) | Generalise loadSection into readOr(message, load, fallback) for app-zone degrade reads and use it in AtlasBound and jobCharacterIds | error-handling | S | low | low | — |
| ☐ | [P068](#p068) | Add isCurrentReadIdentity and sameReadIdentity to platform/auth/read-identity and replace the hand-written staleness guards | client-data | S | low | low | — |
| ☐ | [P337](#p337) | Read the EVE SSO client credentials inside eve-sso's token-request builder and drop clientId/clientSecret from the three token inputs | simplification | S | low | low | — |
| ☐ | [P222](#p222) | Reuse the eve-account-shared predicates, import EVE_PROVIDER_ID only from @/lib/eve-provider, and add signInWithEve beside startCharacterLink | persistence | S | low | low | [P067](wave-08-charts-images-and-board-workspace-adoption.md#p067) |
| ☐ | [P257](#p257) | Route linked-account-to-characterId conversions through parseLinkedAccountId and one ids helper | contracts-validation | S | low | low | [P222](#p222) |
| ☐ | [P176](#p176) | Resolve every guard through getFullSession, reuse the get-session response for the background check, and coalesce the opportunistic affiliation drain | server-pipeline | M | medium | medium | [P287](wave-01-quick-wins-delete-dead-code-fix-small.md#p287), [P167](#p167) |
| ☐ | [P161](#p161) | Route user unlink, admin unlink and reassign through one unlinkCharacter that ends in reconcileAfterCharacterRemoval | server-pipeline | M | medium | high | [P141](#p141), [P146](#p146), [P256](#p256), [P257](#p257) |

<a id="p251"></a>

## P251: Make parseFormBody take a field list and own the form-field failure

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -30 / +10
- **Depends on:** —
- **Existing primitive:** `src/transport/route-body.ts:parseFormBody`

**Problem.** Each of the 8 form-post routes re-implements the same two callbacks: a FormData picker over the schema's field names and a fixed `validationFailure('invalid_form_field', ...)`.

The copies have drifted:
- Six pickers keep `null` for missing fields, while wh-statics and admin/role remember `?? undefined`, which their optional fields need.
- Detail strings vary for no reason: 'Invalid form', 'Invalid character', 'Invalid statics review form', and `Invalid <path>`.
- admin/role uses `|| 'field'`, but the route-body test copy uses `?? 'form'`, which is dead because path.join never returns nullish.

parseFormBody also lets request.formData() reject, so a bad content type or body becomes a 500 where readJsonBody would return a 400.

**Verifier revision.** The field-picker half is real. All 8 parseFormBody callers pass a picker that lists schema fields from FormData and a failure that always uses code 'invalid_form_field'. Normalizing null to undefined is done by hand in only 2 of the 8 (wh-statics and admin/role need it for optional fields). That is a latent trap the existing query analog, parseQueryInput (endpoint.ts:188-197), already avoids with `?? undefined`. parseFormBody also never catches request.formData() rejecting, unlike readJsonBody's invalid_json path, so a malformed form body reaches the route as an uncaught 500.

The shared firstIssueDetail half is rejected:
- readJsonBody's wire detail deliberately includes the zod message (`path: message`).
- admin/role deliberately does not.
- sites-query is a different concept: it maps a field name to its enum list for user-facing copy, and its fallbacks are dead code.

The new helper should also not sit beside parseFormBody. The callback form would be left with no production caller and Fallow would flag the unused export, so parseFormBody's signature should change instead.

**Sites (12).**

- [`src/transport/route-body.ts:41-53`](../../src/transport/route-body.ts#L41-L53) — parseFormBody: caller-supplied picker and failure; formData() is not guarded
- [`src/app/api/account/active-character/route.ts:21-26`](../../src/app/api/account/active-character/route.ts#L21-L26) — picker {characterId}; 'Invalid character'
- [`src/app/api/account/characters/unlink/route.ts:36-41`](../../src/app/api/account/characters/unlink/route.ts#L36-L41) — picker {characterId}; 'Invalid character'
- [`src/app/api/admin/characters/unlink/route.ts:27-33`](../../src/app/api/admin/characters/unlink/route.ts#L27-L33) — picker {userId, characterId}; 'Invalid form'
- [`src/app/api/admin/sessions/revoke/route.ts:16-22`](../../src/app/api/admin/sessions/revoke/route.ts#L16-L22) — picker {userId}; 'Invalid form'
- [`src/app/api/admin/characters/reassign/route.ts:23-29`](../../src/app/api/admin/characters/reassign/route.ts#L23-L29) — picker {characterId, fromUserId}; 'Invalid form'
- [`src/app/api/admin/esi-jobs/retry/route.ts:18-24`](../../src/app/api/admin/esi-jobs/retry/route.ts#L18-L24) — picker {jobId}; 'Invalid form'
- [`src/app/api/admin/wh-statics/route.ts:33-43`](../../src/app/api/admin/wh-statics/route.ts#L33-L43) — picker with `snapshotId ?? undefined` (the refresh arm requires undefined); 'Invalid statics review form'
- [`src/app/api/admin/role/route.ts:36-50`](../../src/app/api/admin/role/route.ts#L36-L50) — picker with `q ?? undefined` (optional); hand-built `Invalid ${path \|\| 'field'}` detail
- [`src/transport/endpoint.ts:188-197`](../../src/transport/endpoint.ts#L188-L197) — parseQueryInput: the existing null-to-undefined field picker this should mirror
- [`src/transport/route-body.test.ts:41-90`](../../src/transport/route-body.test.ts#L41-L90) — tests the callback form; line 85's `?? 'form'` fallback is dead
- [`src/data/wh-statics/api-contract.ts:4-17`](../../src/data/wh-statics/api-contract.ts#L4-L17) — union schema with no .shape, so the API needs an explicit field list rather than shape-derived keys

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/wormhole-sites/sites-query.ts:11-29`](../../src/features/wormhole-sites/sites-query.ts#L11-L29) — Not the same concept: it maps the failing field to its enum values for copy. Its `?? 'query'` is dead and the `''` branch is unreachable, since sitesQuerySchema has only type and class.
- [`src/transport/route-body.ts:26-37`](../../src/transport/route-body.ts#L26-L37) — readJsonBody's `path: message` detail is a different, intentional wire format for contract routes. Do not unify it with the form copy.

</details>

**Home.** `src/transport/route-body.ts (change parseFormBody in place)`

**Boundary check.** The primitive stays in transport, which may import only lib (`transport -> [lib]`); route-body.ts already imports only zod and lib/failure. All 8 consumers are in src/app/api (zone api), and `api -> [transport, ...]` allows transport. No other zone calls parseFormBody (I grepped src and convex).

**API sketch.**

```ts
export async function parseFormBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  fields: readonly (keyof z.input<S> & string)[],
): Promise<ParsedFormBody<z.infer<S>>>;
// let form: FormData; try { form = await request.formData(); } catch { return { ok: false, failure: validationFailure('invalid_form', 'Invalid form body') }; }
// const input = Object.fromEntries(fields.map((f) => [f, form.get(f) ?? undefined]));
// on safeParse failure: validationFailure('invalid_form_field', `Invalid ${parsed.error.issues[0]?.path.join('.') || 'form'}`)
```

**Migration steps.**

1. Change parseFormBody in src/transport/route-body.ts to the field-list signature. Catch formData() rejection, as readJsonBody does for JSON, and build the failure inside. Keep the export name so the SCHEMA_HELPERS set in src/app/api/api-contracts.test.ts and the CORE_EXPORTS entry in src/app/api/guard-emissions.test.ts stay valid unchanged.
2. Rewrite route-body.test.ts: picks the listed fields, maps missing fields to undefined so an optional field passes, returns `Invalid characterId` on a mismatch, returns 'invalid_form' for a non-form body, and returns `Invalid form` for a root-level issue.
3. Migrate the 8 routes: active-character `['characterId']`, account/characters/unlink `['characterId']`, admin/characters/unlink `['userId','characterId']`, admin/sessions/revoke `['userId']`, admin/characters/reassign `['characterId','fromUserId']`, admin/esi-jobs/retry `['jobId']`, admin/wh-statics `['action','snapshotId']`, admin/role `['userId','nextRole','q']`. Then remove the now-unused validationFailure imports where a route no longer needs them (most still use it for other failures).

**Tests.** Rewrite src/transport/route-body.test.ts for the new signature. Existing per-route tests check status and code, not the detail strings, so they guard the behavior: admin/role, admin/wh-statics, admin/characters/unlink, admin/characters/reassign, admin/sessions/revoke, admin/esi-jobs/retry, account/active-character (route.test.ts files) and problem-matrix.test.ts (admin/role). Add a wh-statics case for `action=refresh` with no snapshotId.

**Notes.** - Uniform null-to-undefined is safe for every current schema. z.coerce.number().int().positive() rejects both null (coerces to 0) and undefined (NaN); z.string() and z.enum reject both; the wh-statics refresh arm and admin/role q need undefined and already get it.
- Detail strings change from 'Invalid character', 'Invalid form' and 'Invalid statics review form' to `Invalid <field>`. These are contractless browser form posts, and only route-body.test.ts asserts the old text.
- 'invalid_form' for an unreadable body is a deliberate behavior change: 500 becomes 400. It also stops recording a capability error for client garbage.

<sub>Reported by: concern:request-pipeline.</sub>

<a id="p141"></a>

## P141: Move the four admin form routes, account/delete and feedback onto runMutationRoute; delete adminMutationGate and checkAdminMutation

- **Status:** [ ] not started
- **Category:** api-route · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -75 / +35 (admin-mutation.ts, checkAdminMutation and its test, two coverage buckets and their wiring assertions removed; route bodies roughly neutral)
- **Depends on:** —
- **Existing primitive:** `src/app/api/mutation-route.ts:runMutationRoute`

**Problem.** runMutationRoute already runs preflight, then authorize, then same-origin, then parse, then handle inside the capability scope. Four admin routes rebuild that pipeline by hand: capabilityRoute, then adminMutationGate (a pass-through over checkAdminMutation, which is checkAdmin plus requireSameOrigin), then parseFormBody, then problemResponse. account/delete hand-sequences rate limit, session and origin. feedback checks origin last, after parse, rate limit and three field validations. A cross-origin request with a bad body therefore gets 400 instead of 403, and a cross-origin request with a valid body uses up rate-limit budget before being refused. These parallel gates are the only reason same-origin-coverage.test.ts keeps its DIRECT and ADMIN buckets and admin-mutation wiring assertions.

**Verifier revision.** Confirmed. adminMutationGate, which calls checkAdminMutation (checkAdmin then requireSameOrigin), followed by parseFormBody, runs the same order as runStages (authorize, then origin, then parse). So rewriting role, wh-statics, reassign and esi-jobs/retry on runMutationRoute with authorize: checkAdmin preserves behaviour exactly. capabilityRoute and runMutationRoute both end in runCapabilityRoute, and admin/characters/unlink and admin/sessions/revoke already take this shape. account/delete already runs rate limit, then checkSession, then origin, which is exactly preflight → authorize → origin, so it can use the existing rateLimitPreflight with no new stage. The design is revised in two places. (1) account/delete uses the existing rateLimitPreflight, not a new rateLimit stage, because P142 drops that stage. (2) feedback must keep its rate limit after parse and its getSession call inside handle. feedback/route.test.ts:238 pins that malformed JSON never reaches the limiter, and :321 pins that a cross-origin post never calls getSession. Only the origin check moves earlier, ahead of parse.

**Sites (17).**

- [`src/app/api/admin/role/route.ts:27-50`](../../src/app/api/admin/role/route.ts#L27-L50) — capabilityRoute + adminMutationGate + parseFormBody; handle uses session.user.id and characterId
- [`src/app/api/admin/wh-statics/route.ts:24-43`](../../src/app/api/admin/wh-statics/route.ts#L24-L43) — same; handleAuthorizedPost needs no session
- [`src/app/api/admin/characters/reassign/route.ts:14-29`](../../src/app/api/admin/characters/reassign/route.ts#L14-L29) — same; uses session
- [`src/app/api/admin/esi-jobs/retry/route.ts:11-24`](../../src/app/api/admin/esi-jobs/retry/route.ts#L11-L24) — same; uses session.characterId
- [`src/app/api/admin/characters/unlink/route.ts:22-34`](../../src/app/api/admin/characters/unlink/route.ts#L22-L34) — target shape (runMutationRoute, authorize: checkAdmin, parse: parseFormBody)
- [`src/app/api/admin/sessions/revoke/route.ts:11-23`](../../src/app/api/admin/sessions/revoke/route.ts#L11-L23) — target shape
- [`src/app/api/admin-mutation.ts:1-12`](../../src/app/api/admin-mutation.ts#L1-L12) — pass-through wrapper; its only callers are the four routes
- [`src/composition/route-guards.ts:26-42`](../../src/composition/route-guards.ts#L26-L42) — checkAdminMutation repeats the authorize→origin order of runStages
- [`src/app/api/mutation-route.ts:42-77`](../../src/app/api/mutation-route.ts#L42-L77) — canonical pipeline
- [`src/app/api/capability-route.ts:9-39`](../../src/app/api/capability-route.ts#L9-L39) — capabilityRoute and runMutationRoute both end in runCapabilityRoute
- [`src/app/api/account/delete/route.ts:13-32`](../../src/app/api/account/delete/route.ts#L13-L32) — rate limit → checkSession → origin, the same order as preflight/authorize/origin
- [`src/app/api/feedback/route.ts:30-72`](../../src/app/api/feedback/route.ts#L30-L72) — parse → rate limit → 3 validations → origin (late)
- [`src/app/api/feedback/route.test.ts:228-238, 308-321`](../../src/app/api/feedback/route.test.ts#L228-L238) — pins: invalid JSON does not call checkRateLimit; cross-origin does not call getSession
- [`src/app/api/same-origin-coverage.test.ts:40-52, 164-171, 180-188, 206-221`](../../src/app/api/same-origin-coverage.test.ts#L40-L52) — DIRECT/ADMIN buckets and admin-mutation wiring assertions
- [`src/composition/route-guards.test.ts:71-96`](../../src/composition/route-guards.test.ts#L71-L96) — checkAdminMutation test to delete
- [`src/app/api/problem-matrix.test.ts:29-33`](../../src/app/api/problem-matrix.test.ts#L29-L33) — mocks checkAdminMutation as checkAdmin
- [`src/app/api/capability-coverage.test.ts:53-54`](../../src/app/api/capability-coverage.test.ts#L53-L54) — recognises both capabilityRoute('x') and capability: 'x', so the rewrite keeps coverage

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/auth/[...all]/route.ts:34-41`](../../src/app/api/auth/[...all]/route.ts#L34-L41) — Better Auth owns CSRF on this library handler (EXEMPT in the coverage test); not a pipeline candidate

</details>

**Home.** `src/app/api/mutation-route.ts (existing runMutationRoute; add allowAnonymous)`

**Boundary check.** Every touched file is in zone api (src/app/api/**, matched before app). mutation-route.ts already imports app/api/capability-route (same zone), data/telemetry (the api rule allows data), lib/failure (allows lib), transport/api-response (allows transport) and platform/auth/same-origin (allows platform/auth). Routes import composition/route-guards (allows composition) and app/api/rate-limit-preflight (same zone). After checkAdminMutation is deleted, route-guards.ts in zone composition no longer needs its platform/auth/same-origin import.

**API sketch.**

```ts
// src/app/api/mutation-route.ts
export async function allowAnonymous(): Promise<AuthorizationSuccess> { return { ok: true }; }

// admin route shape
// authz: admin
export async function POST(request: NextRequest): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'admin.set-user-role',
    authorize: checkAdmin,
    parse: (incoming) => parseFormBody(incoming, adminRoleFormSchema, pick, invalid),
    handle: async ({ session }, body) => { /* existing body */ },
  });
}

// account/delete
runMutationRoute(request, { capability: 'account.delete-account', preflight: rateLimitPreflight(request, { name: 'account-delete', perMinute: 5 }, (f) => apiResponse(accountDeleteEndpoint, 429, f)), authorize: checkSession, handle: async ({ session }) => { ... } })

// feedback
runMutationRoute(request, { capability: 'feedback.submit-feedback', authorize: allowAnonymous, parse: (incoming) => readJsonBody(incoming, feedbackRequestSchema), handle: async (_auth, body) => { /* checkRateLimit, sanitise validations, getSession, Linear */ } })
```

**Migration steps.**

1. Rewrite admin/esi-jobs/retry, admin/characters/reassign, admin/role and admin/wh-statics as `export async function POST(request)` returning runMutationRoute({ capability: <same id>, authorize: checkAdmin, parse: (incoming) => parseFormBody(incoming, …same pick/invalid…), handle }). Move each body after parse into handle, keeping the closures over request for the redirects. Keep the `// authz: admin` marker on its own line.
2. Delete src/app/api/admin-mutation.ts, checkAdminMutation in src/composition/route-guards.ts (34-42) with its requireSameOrigin import, the checkAdminMutation test in route-guards.test.ts (71-96), and the checkAdminMutation mock in problem-matrix.test.ts:31.
3. Rewrite account/delete on runMutationRoute with preflight: rateLimitPreflight(request, { name: 'account-delete', perMinute: 5 }, (f) => apiResponse(accountDeleteEndpoint, 429, f)), authorize: checkSession, and handle containing nukeAccount, logUsageEvent and the 200.
4. Add allowAnonymous to mutation-route.ts. Rewrite feedback on runMutationRoute with authorize: allowAnonymous and parse: readJsonBody(incoming, feedbackRequestSchema). handle keeps checkRateLimit, then the title/message/path validations, then getSession, the LINEAR_API_KEY check, the Linear call and telemetry, in that order. Delete the late requireSameOrigin block (69-72).
5. In same-origin-coverage.test.ts, move the four admin routes, account/delete and feedback into PIPELINE_MUTATIONS. Delete DIRECT_MUTATIONS, ADMIN_MUTATIONS, their it.each blocks and the admin-mutation lines in the wiring test (209, 217-220).

**Tests.** Existing order guards keep passing unchanged: admin/wh-statics/route.test.ts (admin before origin, origin before parse) and admin/esi-jobs/retry/route.test.ts (same). account/delete/route.test.ts (401 anonymous, 200 path) and feedback/route.test.ts already pin limiter-after-parse and no getSession on cross-origin. Add to feedback/route.test.ts: a cross-origin post with malformed JSON returns 403, and checkRateLimit is not called. Add to account/delete/route.test.ts: 429 is returned before the session check, and a cross-origin request gets 403 after authorize. Add an allowAnonymous case to mutation-route.test.ts. same-origin-coverage.test.ts then enforces PIPELINE or EXEMPT for every mutating route.

**Notes.** The admin routes and account/delete keep their exact behaviour: same stage order, and problemResponse produces the same bytes as apiResponse(endpoint, status, failure). The routes lose apiResponse's dev-time check that the status is declared in the contract, which is acceptable. feedback changes deliberately: a cross-origin request with an invalid body now gets 403 instead of 400, and a cross-origin request no longer uses up rate-limit budget. Malformed JSON still never reaches the limiter, and a cross-origin request still never calls getSession. Both are pinned by tests, so the rate limit must not become a preflight on this route. problem-matrix.test.ts will exercise the real requireSameOrigin on the admin and feedback paths. Its formRequest and jsonRequest helpers must send no foreign Origin header (they currently pass).

<sub>Reported by: area:app-api, concern:request-pipeline.</sub>

<a id="p146"></a>

## P146: Add a seeOther 303 helper in transport that stashes the failure for capability telemetry, and use it in all eight form-post routes

- **Status:** [ ] not started
- **Category:** api-route · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -30/+25 in routes and helpers, plus around 40 lines of tests
- **Depends on:** [P251](#p251)
- **Existing primitive:** `src/transport/route-body.ts:parseFormBody; src/transport/correlation.ts:stashFailure`

**Problem.** Form-post routes report failures only through a 303 redirect carrying ?error= or ?outcome=. Because nothing is stashed, runCapabilityRoute records these as 'succeeded', so the mutation success rate for account.unlink-character, admin.unlink-character and admin.wh-statics-review hides real failures. The 303 construction is hand-written ten times across eight routes in four styles (redirectWithError, redirectTo, redirectToReview, buildRedirect, inline). The same not_linked rule is reported three different ways: a redirect in account unlink, problemResponse(validationFailure) in active-character, and problemResponse(notFoundFailure) in admin. parseFormBody lets a body that is not a form escape as a 500. Two form schemas are identical, and the characterId form field is repeated four times.

**Verifier revision.** The core is real and is a telemetry bug, not just boilerplate. stashFailure is only called by problemResponse and apiResponse (src/transport/api-response.ts:69-77), and capabilityResultForResponse records any status below 400 as 'succeeded' unless a failure was stashed. As a result, account unlink (not_linked, last_character, two unlink_failed paths), admin unlink (last_character, unlink_failed) and wh-statics refresh (feed-unavailable, busy) all record 'succeeded' when they fail. Eight routes build the same 303 Post/Redirect/Get response through four local helpers and four inline calls; these are all the 303s in src/app/api apart from dev/synthetic-pilot, which sets auth cookies and is a different case. The proposal needs three corrections. First, CAPABILITIES lists operations, not failure codes: codes are free strings and categories come from FAILURE_CATEGORIES in src/lib/failure.ts. Second, a default `invalid` for parseFormBody should be dropped, because the detail strings shown to users differ on purpose ('Invalid character', 'Invalid form', 'Invalid statics review form', and per-field details in admin/role). Third, formFields is a nice-to-have. An unmentioned drift should be fixed in the same pass: parseFormBody does not catch request.formData() rejecting a body that is not a form (TypeError → 500 'unexpected'), whereas readJsonBody maps a bad body to a 400 validation failure.

**Sites (14).**

- [`src/app/api/account/characters/unlink/route.ts:20-24, 36-41, 44-49, 57-60, 67-71, 96`](../../src/app/api/account/characters/unlink/route.ts#L20-L24) — redirectWithError for not_linked, last_character and unlink_failed (twice), all recorded as succeeded; success redirect at 96
- [`src/app/api/admin/characters/unlink/route.ts:16-20, 27-33, 45-52, 64`](../../src/app/api/admin/characters/unlink/route.ts#L16-L20) — redirectTo with last_character and unlink_failed (deleted.length === 0 race, see admin-users.ts:192-195), recorded as succeeded
- [`src/app/api/admin/wh-statics/route.ts:18-22, 34-42, 46-55`](../../src/app/api/admin/wh-statics/route.ts#L18-L22) — redirectToReview with outcome=result.status; 'feed-unavailable' and 'busy' are recorded as succeeded
- [`src/app/api/admin/role/route.ts:21-25, 36-49, 81-82`](../../src/app/api/admin/role/route.ts#L21-L25) — buildRedirect with optional ?q; per-field invalid detail
- [`src/app/api/admin/characters/reassign/route.ts:23-28, 75`](../../src/app/api/admin/characters/reassign/route.ts#L23-L28) — inline 303
- [`src/app/api/admin/esi-jobs/retry/route.ts:18-23, 41`](../../src/app/api/admin/esi-jobs/retry/route.ts#L18-L23) — inline 303
- [`src/app/api/admin/sessions/revoke/route.ts:16-22, 53`](../../src/app/api/admin/sessions/revoke/route.ts#L16-L22) — inline 303
- [`src/app/api/account/active-character/route.ts:21-26, 28-35, 45`](../../src/app/api/account/active-character/route.ts#L21-L26) — inline 303; not_linked reported as problemResponse(validationFailure)
- [`src/transport/route-body.ts:41-53`](../../src/transport/route-body.ts#L41-L53) — parseFormBody; request.formData() rejection is not caught (readJsonBody at 12-39 does catch)
- [`src/transport/api-response.ts:69-77`](../../src/transport/api-response.ts#L69-L77) — problemResponse and apiResponse are the only callers of stashFailure
- [`src/transport/correlation.ts:56-64`](../../src/transport/correlation.ts#L56-L64) — stashFailure and currentStashedFailure (same zone as the new helper)
- [`src/data/telemetry/capability.ts:146-152`](../../src/data/telemetry/capability.ts#L146-L152) — capabilityResultForResponse: a stashed failure wins, otherwise status < 400 means succeeded
- [`src/platform/auth/api-contract.ts:65-71, 79-91`](../../src/platform/auth/api-contract.ts#L65-L71) — switchCharacterFormSchema and unlinkCharacterFormSchema are identical; z.coerce.number().int().positive() characterId repeated in 4 form schemas
- [`src/data/telemetry/queries.ts:440-445`](../../src/data/telemetry/queries.ts#L440-L445) — the mutation SLI excludes only 'validation', so the category chosen for each redirect failure decides whether it counts

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/dev/synthetic-pilot/route.ts:6-15`](../../src/app/api/dev/synthetic-pilot/route.ts#L6-L15) — Public dev route that returns a 303 carrying auth Set-Cookie headers and a relative Location. Not a form post, so not the same concept.
- [`src/app/api/admin/characters/unlink/route.ts:35-42`](../../src/app/api/admin/characters/unlink/route.ts#L35-L42) — not_linked here is already a problemResponse(notFoundFailure) and is stashed correctly; leave it

</details>

**Home.** `src/transport/api-response.ts (beside problemResponse, the other response builder that stashes); formFields and the formData() guard go in src/transport/route-body.ts`

**Boundary check.** The transport zone rule `{from: transport, allow: [lib]}` permits this: seeOther imports the AppFailure type from lib/failure and stashFailure from transport/correlation, which is the same zone. All consumers are in the api zone (src/app/api/**), and the api rule allows transport. The schema changes stay in platform/auth/api-contract.ts, which the api rule also allows.

**API sketch.**

```ts
export function seeOther(request: Request, path: string, options?: { query?: Readonly<Record<string, string | undefined>>; failure?: AppFailure }): Response; // builds new URL(path, request.url), sets each defined query value, calls stashFailure(failure) if given, returns Response.redirect(url, 303)
export function formFields<K extends string>(...keys: K[]): (form: FormData) => Record<K, FormDataEntryValue | undefined>; // form.get(k) ?? undefined
// platform/auth/api-contract.ts
const characterIdFormField = z.coerce.number().int().positive();
export const characterIdFormSchema = z.object({ characterId: characterIdFormField });
```

**Migration steps.**

1. Add seeOther to src/transport/api-response.ts, with tests in api-response.test.ts.
2. In parseFormBody, wrap `await request.formData()` in try/catch and return { ok: false, failure: validationFailure('invalid_form_body', 'Invalid form body') }. Add formFields to route-body.ts.
3. Account unlink: replace redirectWithError with seeOther(request, '/settings/characters', { query: { error: code }, failure }). not_linked and last_character use validationFailure, matching active-character and purge-character. Both unlink_failed paths use unexpectedFailure('unlink_failed', err). Delete redirectWithError.
4. Admin unlink: replace redirectTo. last_character uses validationFailure. unlink_failed comes from a concurrent removal, so it uses conflictFailure('unlink_failed'). The success redirect takes no failure.
5. wh-statics: replace redirectToReview with seeOther(request, '/admin/statics', { query: { outcome: status }, failure }). 'feed-unavailable' uses dependencyUnavailableFailure('wh_statics_feed_unavailable') and 'busy' uses conflictFailure('wh_statics_refresh_busy'). The other statuses are successes.
6. admin/role: replace buildRedirect with seeOther(request, '/admin/users', { query: { q: query } }). Replace the four inline 303s (reassign, esi-jobs/retry, sessions/revoke, active-character) with seeOther.
7. Optionally replace the picker lambdas with formFields(...), keeping each route's explicit invalid builder. Merge switchCharacterFormSchema and unlinkCharacterFormSchema into characterIdFormSchema and reuse characterIdFormField in adminUnlinkFormSchema and adminReassignFormSchema.

**Tests.** api-response.test.ts: seeOther returns a 303 with the right Location and query, drops undefined query values, and inside withCorrelationScope stashes the failure so currentStashedFailure() returns {category, code}; without a failure nothing is stashed. route-body.test.ts: a JSON or empty body gives a validation failure instead of throwing; formFields maps a missing key to undefined. Route tests: in account/characters/unlink/route.test.ts (the 303 and Location assertions around lines 122-163) and admin/characters/unlink/route.test.ts, also assert that the recorded capability outcome is not 'succeeded' for last_character and unlink_failed, by spying on recordCapabilityOutcome or emitCostMetric. In admin/wh-statics/route.test.ts, cover feed-unavailable. Existing Location and query assertions in all eight route tests guard the redirect shape, and capability-coverage.test.ts stays unchanged.

**Notes.** Keep the query keys and values the pages read: ?error=not_linked|last_character|unlink_failed (settings/characters/page.tsx:23-29, admin/users/[userId]/page.tsx:28-32), ?outcome=<status> (admin/statics/page.tsx), and ?q. Changing a picker from form.get(k) to form.get(k) ?? undefined is safe: required string and coerced-number fields fail validation for null and undefined alike, and the two optional fields (role q, wh-statics snapshotId) already map null to undefined. Do not default `invalid`, because that would change problem details users can see. Mutation success rates on the dashboard drop only for the unexpected, conflict and dependency_unavailable categories; validation stays excluded by MUTATION_EXCLUDED_OUTCOMES. A stashed failure records category and code only, never errorClass, which is acceptable. This P146 seeOther helper also gives P145 nothing to share; the two are independent.

<sub>Reported by: area:app-api, concern:request-pipeline.</sub>

<a id="p167"></a>

## P167: Parse SUPERADMIN_CHARACTER_ID once and keep one admin predicate in platform/auth

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -20 / +25 including the new test; about -45 for the deleted duplicate test
- **Depends on:** —
- **Existing primitive:** `src/platform/auth/session-identity.ts:deriveSessionIdentity`

**Problem.** The superadmin id is parsed inline at five sites with drifted validation: only buildAdminList checks Number.isFinite and > 0. The 'role ADMIN or superadmin character' rule is implemented twice, and the copy the tests cover (composition/session.isAdmin) is not the one production sessions use (platform/auth computeIsAdmin, which has no direct test). The preview page hand-writes the redirect that requireAdminPage already performs. buildAdminList awaits listAdminUsers before starting the independent superadmin lookup.

**Verifier revision.** Confirmed: SUPERADMIN_CHARACTER_ID is parsed with Number(readEnv(...)) at five sites (auth.ts:34, session.ts:39, admin/users/page.tsx:46, admin/users/[userId]/page.tsx:143 and synthetic-pilot-store.ts:53), and only the admin users list guards the value. The admin rule exists twice: computeIsAdmin, which production sessions use through customSession, and composition/session.isAdmin, whose only consumer is the preview page. The only predicate test (composition/is-admin.test.ts) covers the duplicate, not the rule that guards admin routes. The role default and cast are copied at session-identity.ts:14 and auth.ts:188. Revised scope: (1) No live bug. NaN never matches, and '' becomes 0, which no EVE character id equals, so the guard is defence in depth and consistency, not a fix. (2) Reject the P147 part that switches route-guards.checkSession and checkAdmin to getFullSession. getFullSession schedules after(checkUserCharacterAuthorizations), which always runs reconcileAffiliationAccess, a global outbox drain (character-authorization.ts:29-33, 54-60). Adding that to every guarded API call, including account/delete just before nukeAccount, is a behaviour and load change, not deduplication. (3) The direct auth.api.getSession calls in RSC (CustomStructuresContent, AtlasBound) are a separate concern: session-read deduplication. (4) The single home is platform/auth/admin-policy.ts, not lib/env.ts, because the admin predicate needs CharacterRole and is auth policy.

**Sites (10).**

- [`src/platform/auth/auth.ts:32-36`](../../src/platform/auth/auth.ts#L32-L36) — computeIsAdmin: unguarded parse; feeds customSession through deriveSessionIdentity at 204
- [`src/platform/auth/auth.ts:186-189`](../../src/platform/auth/auth.ts#L186-L189) — JWT definePayload role: (u.role as CharacterRole \| undefined) ?? 'USER'
- [`src/platform/auth/session-identity.ts:4-25`](../../src/platform/auth/session-identity.ts#L4-L25) — deriveSessionIdentity takes an injected isAdmin; role default and cast at 14
- [`src/composition/session.ts:37-41`](../../src/composition/session.ts#L37-L41) — duplicate isAdmin(session): unguarded parse; only consumer is the preview page
- [`src/composition/is-admin.test.ts:33-48`](../../src/composition/is-admin.test.ts#L33-L48) — tests the duplicate predicate, not computeIsAdmin
- [`src/app/(site)/admin/users/page.tsx:44-50`](../../src/app/%28site%29/admin/users/page.tsx#L44-L50) — the only guarded parse (isFinite && > 0); listAdminUsers awaited before the independent superadmin lookups
- [`src/app/(site)/admin/users/[userId]/page.tsx:141-149`](../../src/app/%28site%29/admin/users/[userId]/page.tsx#L141-L149) — unguarded parse inside .some(), once per character
- [`src/composition/synthetic-pilot-store.ts:53-55`](../../src/composition/synthetic-pilot-store.ts#L53-L55) — unguarded parse comparing against SYNTHETIC_PILOT.characterId
- [`src/app/(site)/preview/primitives/page.tsx:15-19`](../../src/app/%28site%29/preview/primitives/page.tsx#L15-L19) — getSession() plus isAdmin() plus redirect, which re-implements requireAdminPage
- [`src/composition/route-guards.ts:56-62`](../../src/composition/route-guards.ts#L56-L62) — requireAdminPage: the canonical page guard, reading session.isAdmin from getFullSession

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/route-guards.ts:18-32`](../../src/composition/route-guards.ts#L18-L32) — checkSession/checkAdmin call auth.api.getSession directly. Switching to getFullSession would schedule after(checkUserCharacterAuthorizations), a global reconcileAffiliationAccess, on every guarded API call, including account/delete/route.ts:24 just before nukeAccount. That is a behaviour change, not part of the admin rule.
- [`src/app/(site)/industry/CustomStructuresContent.tsx:10-12`](../../src/app/%28site%29/industry/CustomStructuresContent.tsx#L10-L12) — an uncached session read in RSC; a session-deduplication concern, not the admin rule
- [`src/app/(site)/atlas/AtlasBound.tsx:79-85`](../../src/app/%28site%29/atlas/AtlasBound.tsx#L79-L85) — uses checkSession in an RSC render; same deduplication concern
- [`src/app/(site)/industry/industry-characters.ts:48-51`](../../src/app/%28site%29/industry/industry-characters.ts#L48-L51) — inside 'use cache: private', so it must call auth.api.getSession directly

</details>

**Home.** `src/platform/auth/admin-policy.ts (new)`

**Boundary check.** admin-policy.ts is in the platform/auth zone and imports readEnv from lib (src/lib/env.ts) and the CharacterRole type and CHARACTER_ROLES from config (src/config/character-roles.ts), which {from: platform/auth, allow: [..., lib, config]} permits. Its consumers: platform/auth/auth.ts and session-identity.ts are intra-zone. composition/synthetic-pilot-store.ts is permitted by {from: composition, allow: [..., platform/auth, ...]}. app/(site)/admin/users/page.tsx and [userId]/page.tsx are permitted by {from: app, allow: [..., platform/auth, ...]}. The preview page imports requireAdminPage from composition, which {from: app, allow: [composition, ...]} permits. auth.ts already imports lib/env, so the module adds no new dependency to the auth hot path.

**API sketch.**

```ts
// src/platform/auth/admin-policy.ts
/** The configured superadmin character, or null when unset, non-integer or not positive. */
export function superadminCharacterId(): number | null; // Number.isSafeInteger(id) && id > 0
export function isAdminIdentity(characterId: number | null, role: CharacterRole): boolean;
/** Unknown or missing role values read as USER. */
export function normalizeCharacterRole(raw: unknown): CharacterRole; // CHARACTER_ROLES.includes(raw) ? raw : 'USER'
```

**Migration steps.**

1. Add src/platform/auth/admin-policy.ts and admin-policy.test.ts. Move the cases from composition/is-admin.test.ts:33-48 into it, and add '0', '-1', '1.5', a null characterId with ADMIN role and a null characterId with USER role.
2. In auth.ts, delete computeIsAdmin (32-36) and pass isAdminIdentity to deriveSessionIdentity at 204. Replace the role expression at 188 with normalizeCharacterRole(u.role).
3. In session-identity.ts:14, use normalizeCharacterRole(user.role). Keep the injected isAdmin parameter; session-identity.test.ts relies on it.
4. Change the preview page (preview/primitives/page.tsx:15-19) to `await requireAdminPage(); return <PrimitivesDemo />;` and remove the getSession and isAdmin imports.
5. Delete isAdmin and the readEnv import from composition/session.ts:4,37-41, and delete composition/is-admin.test.ts.
6. In admin/users/page.tsx:44-50, `const superId = superadminCharacterId();` and run listAdminUsers() in Promise.all with `superId === null ? null : getUserByCharacterId(superId).then(...)`. Drop the readEnv import.
7. In admin/users/[userId]/page.tsx:143, compute `const superId = superadminCharacterId()` once and use `superId !== null && characters.some((c) => c.characterId === superId)`. Drop the readEnv import.
8. In synthetic-pilot-store.ts:53, use `superadminCharacterId() === SYNTHETIC_PILOT.characterId`.

**Tests.** New src/platform/auth/admin-policy.test.ts covering superadminCharacterId (unset, '', garbage, '0', negative, fractional, valid), isAdminIdentity (ADMIN role, superadmin match, null characterId) and normalizeCharacterRole (undefined, 'ADMIN', an unknown string). Delete composition/is-admin.test.ts. Keep green: session-identity.test.ts; route-guards.test.ts:98+ (requireAdminPage); synthetic-pilot-store.test.ts:77 (stubs '' and now reads null); synthetic-pilot-store.db.test.ts:235; access-view.test.ts for the admin list merge.

**Notes.** Preview-page semantics shift slightly. getSession() returns null when characterId is null, so today an ADMIN-role user without an active character is redirected from /preview/primitives, while requireAdminPage admits them. Accept this, because requireAdminPage is the rule every admin page uses. normalizeCharacterRole changes behaviour only for role strings outside CHARACTER_ROLES, which today pass through the cast into the session and the Convex JWT; they now read as 'USER'. Use Number.isSafeInteger rather than the list page's Number.isFinite so that '1.5' or '1e400' never yields an id. Efficiency gain on the admin list: one round trip saved through Promise.all; getUserByCharacterId and getUserById stay a dependent chain.

<sub>Reported by: area:app-site, area:composition, area:platform, concern:contracts-types, concern:request-pipeline.</sub>

<a id="p254"></a>

## P254: Add requireSessionPage and a typed auth_error vocabulary so login_required shows a notice

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** bypasses-existing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -20 / +35 (the new module and tests add more lines than the guards remove)
- **Depends on:** [P167](#p167)
- **Existing primitive:** `src/composition/route-guards.ts:requireAdminPage`

**Problem.** Signed-in-only pages have no shared guard. Four settings pages hand-roll the session redirect, and the admin preview page bypasses requireAdminPage with a different admin predicate. The auth_error codes are bare string literals with no shared definition, so the producers (the redirects) and the consumer (the home-page notice) have drifted. login_required is produced 4 times but has no message, three messages have no producer, and the lookup uses `in`, which also matches prototype keys.

**Sites (10).**

- [`src/composition/route-guards.ts:56-62`](../../src/composition/route-guards.ts#L56-L62) — requireAdminPage, the only page guard, with a literal '/?auth_error=admin_required'
- [`src/app/(site)/settings/preferences/page.tsx:9-15`](../../src/app/%28site%29/settings/preferences/page.tsx#L9-L15) — RequireSession hand-rolls the redirect
- [`src/app/(site)/settings/account/page.tsx:26-30`](../../src/app/%28site%29/settings/account/page.tsx#L26-L30) — hand-rolled redirect
- [`src/app/(site)/settings/characters/page.tsx:132-136`](../../src/app/%28site%29/settings/characters/page.tsx#L132-L136) — hand-rolled redirect
- [`src/app/(site)/settings/corporations/page.tsx:75-79`](../../src/app/%28site%29/settings/corporations/page.tsx#L75-L79) — hand-rolled redirect
- [`src/app/(site)/preview/primitives/page.tsx:15-19`](../../src/app/%28site%29/preview/primitives/page.tsx#L15-L19) — isAdmin(getSession()) instead of requireAdminPage; denies ADMIN users whose characterId is null
- [`src/composition/session.ts:16-25, 37-41`](../../src/composition/session.ts#L16-L25) — getSession returns null when characterId is null; isAdmin's only production caller is the preview page
- [`src/platform/auth/auth.ts:32-36`](../../src/platform/auth/auth.ts#L32-L36) — computeIsAdmin, the canonical predicate behind session.isAdmin
- [`src/app/(site)/page.tsx:45-71`](../../src/app/%28site%29/page.tsx#L45-L71) — untyped AUTH_ERROR_MESSAGES with no login_required; `in` lookup; three codes with no producer
- [`src/app/(site)/admin/AdminGate.tsx:1-10`](../../src/app/%28site%29/admin/AdminGate.tsx#L1-L10) — the correct pattern: a page-level guard via the composition primitive

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/settings/layout.tsx:1-26`](../../src/app/%28site%29/settings/layout.tsx#L1-L26) — Do not move the guard into the layout. AdminGate's comment records that layouts do not rerender on sibling navigation, so each page must keep its own guard.
- [`src/platform/auth/link-character.ts:7`](../../src/platform/auth/link-character.ts#L7) — errorCallbackURL is Better Auth's own error channel, not an auth_error producer

</details>

**Home.** `src/composition/auth-error.ts (new, pure: AUTH_ERROR_CODES, AuthErrorCode, authErrorHref, isAuthErrorCode); src/composition/route-guards.ts (requireSessionPage)`

**Boundary check.** Both modules are in the composition zone:
- route-guards.ts imports auth-error.ts within the same zone.
- The consumers (settings pages, the preview page, the home page) are in the app zone, and the `app` rule allows composition.
- auth-error.ts imports nothing, so it is legal for any zone allowed to import composition.
- route-guards.ts keeps its current imports (next/headers, next/navigation, lib/failure, composition/auth, composition/session, platform/auth/same-origin), all of which the `composition` rule allows.

**API sketch.**

```ts
// src/composition/auth-error.ts
export const AUTH_ERROR_CODES = ['login_required', 'admin_required'] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
export function authErrorHref(code: AuthErrorCode): string { return `/?auth_error=${code}`; }
export function isAuthErrorCode(value: unknown): value is AuthErrorCode { return typeof value === 'string' && (AUTH_ERROR_CODES as readonly string[]).includes(value); }

// src/composition/route-guards.ts
export async function requireSessionPage(): Promise<BetterAuthSession>; // null session -> redirect(authErrorHref('login_required'))

// src/app/(site)/page.tsx
const AUTH_ERROR_MESSAGES = { login_required: '...', admin_required: '...' } satisfies Record<AuthErrorCode, string>;
// const code = isAuthErrorCode(params.auth_error) ? params.auth_error : null;
```

**Migration steps.**

1. Create src/composition/auth-error.ts and its test, auth-error.test.ts, covering href building and isAuthErrorCode rejecting 'constructor', 'toString', arrays and undefined. Coverage requires a test for every new file.
2. In src/composition/route-guards.ts, add requireSessionPage() and change requireAdminPage to redirect(authErrorHref('admin_required')). Extend route-guards.test.ts: requireSessionPage redirects to '/?auth_error=login_required' on a null session and returns the session otherwise. Keep the existing admin_required assertions.
3. Replace the four settings guards. preferences: `RequireSession` becomes `await requireSessionPage(); return null;`, or inline it. account, characters and corporations: `const session = await requireSessionPage();`. Remove the now-unused redirect and getFullSession imports.
4. Update src/app/(site)/settings/characters/page.test.ts. It currently mocks '@/composition/session' and 'next/navigation'; once the page imports route-guards, which imports '@/composition/auth', the test must also mock '@/composition/auth' or mock requireSessionPage directly. Keep the assertion that a null session throws 'NEXT_REDIRECT /?auth_error=login_required'.
5. Replace the preview/primitives guard with `await requireAdminPage();` and drop the getSession and isAdmin imports. That aligns it with the admin console's predicate.
6. On the home page, type AUTH_ERROR_MESSAGES as `satisfies Record<AuthErrorCode, string>`, add login_required copy (for example 'Log in with EVE to open your settings.'), delete state_mismatch, token_exchange_failed and db_write_failed, and resolve the key with isAuthErrorCode instead of `in`.
7. Cleanup: composition/session.isAdmin is then used only in tests (is-admin.test.ts, session.test.ts, the problem-matrix mock). Delete it together with the superadmin admin-predicate unification, which should move the SUPERADMIN_CHARACTER_ID cases onto computeIsAdmin first.

**Tests.** New: src/composition/auth-error.test.ts, plus requireSessionPage cases in src/composition/route-guards.test.ts. Existing guards to update or keep: src/composition/route-guards.test.ts:98-112 (requireAdminPage admin_required), src/app/(site)/settings/characters/page.test.ts:85-86 (login_required redirect), src/app/(site)/admin/admin-console.test.ts (requireAdminPage mock). Add a home-page notice test: login_required renders its message, and 'constructor' renders nothing.

**Notes.** - Behavior differences:
  - The preview page will admit an ADMIN-role user who has no active character. That matches /admin, and is the correct behavior.
  - The settings guards keep using getFullSession through requireSessionPage, so they still schedule the after() character-authorization check.
  - Each settings page keeps its guard inside its own Suspense'd async component; only the body changes.
- Real user-facing bug fixed: login_required has never shown a notice.
- Latent bug fixed: prototype-key lookup via `in`.
- The three deleted codes have no producer in src or convex. Confirm that no external link or old OAuth callback config points at them before deleting; Better Auth reports OAuth errors through errorCallbackURL rather than auth_error.

<sub>Reported by: area:app-site.</sub>

<a id="p255"></a>

## P255: Resolve query-string notices with one own-key typed resolver and type each flow's notice codes

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -40 / +45 across ~14 files (3 local redirect helpers and outcomeMessage deleted; resolver +6; seeOther +8)
- **Depends on:** [P146](#p146), [P254](#p254)
- **Existing primitive:** `src/lib/error-copy.ts:resolveErrorMessage`

**Problem.** Server pages map `?error=`, `?outcome=` and `?auth_error=` codes to copy through four ad-hoc resolvers over `Record<string,string>` tables. None checks for an own key. A prototype key such as constructor, toString or __proto__ returns a non-string, and Flight then cannot serialise the Banner or Callout child, so the page errors.

Producers take untyped `string` codes, and the tables have drifted from them:
- The home page has no copy for login_required, which 4 pages produce, but keeps 3 codes that nothing produces.
- The admin user page has no not_linked copy.
- Statics re-keys the WhStaticsRefreshResult status union as string, so a new status would silently show no banner.

Some expected failures from native form POSTs bypass the notice flow and return raw problem JSON to the browser:
- admin unlink not_linked
- active-character not_linked
- wh-statics snapshot_empty and snapshot_not_pending, reachable by double-submitting a promote

**Verifier revision.** The core finding holds. Four pages turn a query param into copy in four ways: resolveErrorMessage with a fallback, statics outcomeMessage returning undefined, the home page's `in` check, and the admin page through resolveErrorMessage. None checks for an own key. `?outcome=constructor` makes OUTCOME_LABELS return the Object function, which reaches Banner. Banner is a 'use client' component (banner.tsx:1), so Flight throws 'Functions cannot be passed directly to Client Components' and the admin page errors. `?error=toString` on /settings/characters, or `?auth_error=constructor` on the home page, puts a function inside Callout's host <span>, which Flight also cannot serialise. Producers take bare `string`.

There is more drift than the finders reported:
- The home table has no copy for `login_required`, though four settings pages redirect with it, so that redirect shows nothing.
- Its `state_mismatch`, `token_exchange_failed` and `db_write_failed` entries have no producer anywhere in src. Better Auth has no errorURL configured, so they are dead copy.
- /api/account/active-character is a native form POST (SwitchCharacterForm), but it returns problem JSON for not_linked, even though /settings/characters already has not_linked copy.

Three changes to the proposal:
1. Producer typing comes from narrowing each producer's `code` parameter to the flow's code type. A generic `withNotice<C>` adds no safety by itself. The real producer duplication is the 303 redirect, with 3 local helpers and 6 inline copies, so it goes in a transport `seeOther` helper.
2. The code vocabularies only need type aliases, not runtime tuples.
3. The home page and active-character are in scope, because they use the same resolver and the same notice param. Admin reassign, role and esi-jobs/retry are left as a lead.

**Sites (28).**

- [`src/lib/error-copy.ts:1-8`](../../src/lib/error-copy.ts#L1-L8) — existing resolver: `messages[raw] ?? fallback` inherits Object.prototype members; fallback is required
- [`src/lib/error-copy.test.ts:1-17`](../../src/lib/error-copy.test.ts#L1-L17) — existing test; has no prototype-key case
- [`src/app/(site)/settings/characters/page.tsx:23-29, 132-147`](../../src/app/%28site%29/settings/characters/page.tsx#L23-L29) — ERROR_MESSAGES mixes unlink codes with Better Auth link codes; resolveErrorMessage with a fallback; rendered in Callout
- [`src/app/(site)/admin/users/[userId]/page.tsx:28-32, 127, 140`](../../src/app/%28site%29/admin/users/[userId]/page.tsx#L28-L32) — second ERROR_MESSAGES; no not_linked copy; generic fallback
- [`src/app/(site)/admin/statics/page.tsx:15-28, 270-284`](../../src/app/%28site%29/admin/statics/page.tsx#L15-L28) — OUTCOME_LABELS keyed by string; outcomeMessage returns undefined for an unknown code; rendered in client Banner tone=info
- [`src/app/(site)/page.tsx:45-71`](../../src/app/%28site%29/page.tsx#L45-L71) — AUTH_ERROR_MESSAGES with an `in` check, which also matches prototype keys; no login_required entry; 3 entries have no producer
- [`src/data/wh-statics/api-contract.ts:19-32`](../../src/data/wh-statics/api-contract.ts#L19-L32) — WhStaticsRefreshResult status union, the real refresh vocabulary
- [`src/app/api/admin/wh-statics/route.ts:18-22, 45-68`](../../src/app/api/admin/wh-statics/route.ts#L18-L22) — redirectToReview(outcome: string); snapshot_empty and snapshot_not_pending returned as 409 problem JSON to a form POST
- [`src/app/api/account/characters/unlink/route.ts:20-24, 42-71, 96`](../../src/app/api/account/characters/unlink/route.ts#L20-L24) — redirectWithError(code: string) plus an inline 303 on success
- [`src/app/api/admin/characters/unlink/route.ts:16-20, 34-52`](../../src/app/api/admin/characters/unlink/route.ts#L16-L20) — redirectTo(error?: string); not_linked returned as 404 JSON while its siblings redirect
- [`src/app/api/account/active-character/route.ts:27-35, 45`](../../src/app/api/account/active-character/route.ts#L27-L35) — native form POST returns 400 not_linked JSON; the settings page already has not_linked copy
- [`src/components/composition/account/SwitchCharacterForm.tsx:3-12`](../../src/components/composition/account/SwitchCharacterForm.tsx#L3-L12) — confirms the native form POST to active-character
- [`src/components/composition/account/AdminUnlinkCharacterForm.tsx:17-25`](../../src/components/composition/account/AdminUnlinkCharacterForm.tsx#L17-L25) — confirms the native form POST to admin unlink
- [`src/platform/auth/link-character.ts:3-9`](../../src/platform/auth/link-character.ts#L3-L9) — Better Auth writes its own `error` codes to /settings/characters, so that page must keep a fallback
- [`src/components/ui/banner.tsx:1`](../../src/components/ui/banner.tsx#L1) — 'use client': a function child crashes Flight serialisation
- [`src/components/ui/callout.tsx:5-26`](../../src/components/ui/callout.tsx#L5-L26) — server component rendering {children} in a host span, so a function child also fails
- [`src/app/(site)/settings/account/page.tsx:29`](../../src/app/%28site%29/settings/account/page.tsx#L29) — auth_error=login_required producer with no copy on the home page
- [`src/app/(site)/settings/corporations/page.tsx:78`](../../src/app/%28site%29/settings/corporations/page.tsx#L78) — login_required producer
- [`src/app/(site)/settings/preferences/page.tsx:12`](../../src/app/%28site%29/settings/preferences/page.tsx#L12) — login_required producer
- [`src/app/(site)/preview/primitives/page.tsx:17`](../../src/app/%28site%29/preview/primitives/page.tsx#L17) — admin_required producer
- [`src/composition/route-guards.ts:59`](../../src/composition/route-guards.ts#L59) — admin_required producer
- [`src/app/api/admin/characters/reassign/route.ts:75`](../../src/app/api/admin/characters/reassign/route.ts#L75) — inline 303 redirect; a candidate for seeOther
- [`src/app/api/admin/sessions/revoke/route.ts:53`](../../src/app/api/admin/sessions/revoke/route.ts#L53) — inline 303 redirect
- [`src/app/api/admin/role/route.ts:21-25, 82`](../../src/app/api/admin/role/route.ts#L21-L25) — buildRedirect with q, then an inline 303
- [`src/app/api/admin/esi-jobs/retry/route.ts:41`](../../src/app/api/admin/esi-jobs/retry/route.ts#L41) — inline 303 redirect
- [`src/app/api/admin/wh-statics/route.test.ts:166-190`](../../src/app/api/admin/wh-statics/route.test.ts#L166-L190) — pins the 409 JSON behaviour that changes
- [`src/app/api/admin/characters/unlink/route.test.ts:73`](../../src/app/api/admin/characters/unlink/route.test.ts#L73) — pins the 404 for not_linked
- [`src/app/api/account/active-character/route.test.ts:60`](../../src/app/api/account/active-character/route.test.ts#L60) — pins the 400 for not_linked

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/admin/characters/reassign/route.ts:32-45`](../../src/app/api/admin/characters/reassign/route.ts#L32-L45) — Same raw-JSON-to-form problem for already_linked and not_linked, but this flow has no notice param yet. Its success redirect targets the actor's page, so a failure redirect would need a new target. Treat as a follow-up lead.
- [`src/app/api/admin/role/route.ts:53-64`](../../src/app/api/admin/role/route.ts#L53-L64) — self_role and user_not_found JSON go to a native form, but the UI prevents both; tamper-only. Lead, not part of this change.
- [`src/app/api/account/purge-character/route.ts:38-48`](../../src/app/api/account/purge-character/route.ts#L38-L48) — JSON fetch endpoint with a declared contract (purgeCharacterEndpoint); must stay JSON
- [`src/app/(site)/page.tsx:78-92`](../../src/app/%28site%29/page.tsx#L78-L92) — the `demo` param is parsed by demoVariant and is not notice copy

</details>

**Home.** `Resolver: src/lib/error-copy.ts (generalise resolveErrorMessage into resolveNotice). Producer: seeOther in src/transport/api-response.ts. Codes: CharacterLinkNotice, BetterAuthLinkError and HomeAuthNotice in src/platform/auth/api-contract.ts; WhStaticsReviewOutcome in src/data/wh-statics/api-contract.ts.`

**Boundary check.** - lib (src/lib/error-copy.ts) may import only config (rule lib→[config]), and resolveNotice imports nothing.
- Consumers of resolveNotice are all in app (src/app/(site)/**). Rule app→[...,lib,...] allows it.
- transport (src/transport/api-response.ts) may import only lib (rule transport→[lib]), and seeOther imports nothing.
- Consumers of seeOther are in api (src/app/api/**). Rule api→[transport,...] allows it.
- The code types in platform/auth/api-contract.ts are imported by:
  - app pages (app→platform/auth allowed)
  - api routes (api→platform/auth allowed)
  - composition/route-guards (composition→platform/auth allowed)
- WhStaticsReviewOutcome in data/wh-statics is imported by:
  - the app page (app→data allowed)
  - the api route (api→data allowed)

**API sketch.**

```ts
// src/lib/error-copy.ts
export function resolveNotice<C extends string>(
  raw: string | string[] | undefined,
  copy: Readonly<Record<C, string>>,
  fallback?: string,
): string | null; // typeof raw==='string' && Object.hasOwn(copy, raw) ? copy[raw] : typeof raw==='string' ? fallback ?? null : null

// src/transport/api-response.ts
export function seeOther(request: Request, path: string, query?: Readonly<Record<string, string | undefined>>): Response; // 303 to new URL(path, request.url), set defined query entries

// src/platform/auth/api-contract.ts
export type CharacterLinkNotice = 'not_linked' | 'last_character' | 'unlink_failed';
export type BetterAuthLinkError = 'account_already_linked_to_different_user' | "email_doesn't_match";
export type HomeAuthNotice = 'login_required' | 'admin_required';

// src/data/wh-statics/api-contract.ts
export type WhStaticsReviewOutcome = WhStaticsRefreshResult['status'] | 'promoted' | 'rejected' | 'snapshot-empty' | 'snapshot-not-pending';

// pages
const OUTCOME_LABELS = { ... } as const satisfies Record<WhStaticsReviewOutcome, string>;
```

**Migration steps.**

1. In src/lib/error-copy.ts, replace resolveErrorMessage with resolveNotice: generic over C, uses Object.hasOwn, fallback optional (none means null). Extend error-copy.test.ts with 'constructor', 'toString', '__proto__' and 'hasOwnProperty', which must return the fallback, or null when no fallback is given.
2. Add the type aliases CharacterLinkNotice, BetterAuthLinkError and HomeAuthNotice to src/platform/auth/api-contract.ts. Add WhStaticsReviewOutcome to src/data/wh-statics/api-contract.ts. Use kebab-case for the two new statics conflict outcomes, to match the existing statics vocabulary.
3. Add seeOther to src/transport/api-response.ts, with a test in api-response.test.ts covering the 303 status, a relative path resolved against request.url, and an undefined query value omitted.
4. Pages:
- settings/characters: make ERROR_MESSAGES `satisfies Record<CharacterLinkNotice | BetterAuthLinkError, string>` and call resolveNotice with the existing fallback.
- admin/users/[userId]: add not_linked copy (for example "That character isn't linked to this user."), use `satisfies Record<CharacterLinkNotice, string>` and keep the generic fallback.
- admin/statics: make OUTCOME_LABELS `satisfies Record<WhStaticsReviewOutcome, string>`, add copy for snapshot-empty and snapshot-not-pending, delete outcomeMessage, and call resolveNotice with no fallback. Optionally use tone='warn' for the two conflict outcomes.
- Home page: make AUTH_ERROR_MESSAGES `satisfies Record<HomeAuthNotice, string>`, add login_required copy (or stop emitting the param; decide with the requireSessionPage work), delete state_mismatch, token_exchange_failed and db_write_failed, and replace the `in` check with resolveNotice.
5. Producers:
- account unlink: replace redirectWithError with a one-line typed closure `(code: CharacterLinkNotice) => seeOther(request, '/settings/characters', { error: code })`.
- admin unlink: replace redirectTo with seeOther, and send not_linked to `/admin/users/${userId}?error=not_linked` instead of 404 JSON.
- active-character: send not_linked to `/settings/characters?error=not_linked`.
- wh-statics: type redirectToReview's outcome as WhStaticsReviewOutcome, build it on seeOther, and map WhStaticsEmptySnapshotError to snapshot-empty and WhStaticsSnapshotStateError to snapshot-not-pending. Drop the now-unused conflictFailure and notFoundFailure imports.
6. Convert the remaining inline `Response.redirect(new URL(path, request.url), 303)` calls to seeOther: account unlink :96, active-character :45, reassign :75, sessions/revoke :53, role :82 (pass { q }), and esi-jobs/retry :41. Delete the role route's buildRedirect.
7. Update the pinned route tests (see tests), then run `pnpm check` through test-runner.

**Tests.** Add:
- error-copy.test.ts: prototype-key cases, the optional fallback, and the generic typing.
- api-response.test.ts: seeOther.
- settings/characters/page.test.ts: renderContent('constructor') renders the fallback and does not throw.

Update:
- admin/wh-statics/route.test.ts:166-190: expect a 303 with location ending ?outcome=snapshot-not-pending or ?outcome=snapshot-empty.
- admin/characters/unlink/route.test.ts:73: expect a 303 with error=not_linked.
- account/active-character/route.test.ts:60: expect a 303 with error=not_linked.

Guards:
- settings/characters/page.test.ts covers last_character, the unknown-code fallback and the login_required redirect.
- account/characters/unlink/route.test.ts covers the existing error redirects.
- problem-matrix.test.ts is unaffected, since it does not cover these routes.

**Notes.** Behaviour to preserve:
- settings/characters must keep a fallback for unknown codes, because Better Auth writes arbitrary `error` codes there (link-character.ts errorCallbackURL).
- admin/users keeps its generic fallback.
- statics and home show nothing for an unknown code. That stays, now through resolveNotice with no fallback.

Keep each flow's casing: statics outcomes are kebab-case, the other codes snake_case.

The prototype-key crash affects all four pages today, so the own-key check is the correct behaviour. No copy table is right as it stands.

Drift to resolve:
- The home page has no login_required copy while 4 pages emit it.
- Three home codes are dead: no producer in src, and auth.ts configures no Better Auth errorURL.
- Admin user page lacks not_linked copy.

Coordinate with the requireSessionPage opportunity, which owns the `/?auth_error=login_required` redirects: it should emit codes typed as HomeAuthNotice. Unifying the admin 404 with the self-service 400 is not needed here: admin unlink moves to a redirect, and admin reassign is a lead.

Follow-up lead: admin reassign (already_linked, not_linked), admin role (self_role, user_not_found) and esi-jobs/retry (job_not_found) still return problem JSON to native form POSTs.

<sub>Reported by: gap:failure-code-to-user-copy.</sub>

<a id="p256"></a>

## P256: Share the not_linked failure, make setActiveCharacter ownership-checked, and use accountBelongsToUser where only membership is asked

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -20 / +15
- **Depends on:** [P255](#p255)
- **Existing primitive:** `src/platform/auth/linked-characters.ts:accountBelongsToUser`

**Problem.** The 'is this character mine' check and its failure are scattered.
- skills-sync's getSkillLevelsForCharacterOnView reads the full linked roster to test one id, bypassing accountBelongsToUser.
- Admin unlink runs accountBelongsToUser and then listLinkedCharacters, two queries where one roster read suffices.
- setActiveCharacter writes unconditionally, so active-character needs a separate pre-check.
- maps/create reports an unlinked creator as invalid_body, which its contract does not distinguish. The client then shows a connection-error message.
- The self-service not_linked failure literal is pasted 4 times.

**Verifier revision.** Refuted:
- The efficiency claim. A user's roster is a handful of account rows read through account_user_id_idx (auth-schema.ts:96) with a primary-key left join to characters. Replacing it with an IN query saves nothing measurable, and the React cache() remark does not apply to any cited site.
- "Six failure forms" is overstated. The eve-token bare 404 is that service endpoint's declared contract (api-contract.ts:30, problem('not_found')) and deliberately reveals nothing. The skill-levels null is the read endpoint's normal empty answer: 200 {levels:null}, the same as signed out. The four self-service `validationFailure('not_linked', 'Character not linked to your account')` copies are identical, not drifted.
- A single requireLinkedCharacters gate cannot return one failure shape, because the callers need a JSON contract 400, a form redirect, a service 404 or a null read. The predicate is the shareable part, and it already exists as accountBelongsToUser.
- Dropping map-creation's listLinkedCharacterIds DI seam would break 11 test call sites (map-creation.test.ts and map-creation.db.test.ts). That costs more than it saves.
- profile-writes already checks only newly added members (unlinkedNewMembers filters kept ids).

What survives is small but real:
(a) skills-sync reads the whole roster to test one id instead of calling accountBelongsToUser.
(b) Admin unlink makes a point query and then a roster read where the roster alone answers both questions, as account unlink already does.
(c) setActiveCharacter updates without an ownership predicate, so the route needs a separate pre-check (TOCTOU, two round trips).
(d) maps/create maps an unlinked creator to invalid_body, its contract lacks not_linked, and the client then shows 'Check your connection and try again', which is misleading.
(e) The 4 identical not_linked literals can share one factory.

**Sites (14).**

- [`src/platform/auth/linked-characters.ts:184-198`](../../src/platform/auth/linked-characters.ts#L184-L198) — accountBelongsToUser (the canonical predicate) and setActiveCharacter (an unconditional UPDATE)
- [`src/app/api/account/active-character/route.ts:27-37`](../../src/app/api/account/active-character/route.ts#L27-L37) — pre-check plus an unconditional write; not_linked literal
- [`src/app/api/account/purge-character/route.ts:38-48`](../../src/app/api/account/purge-character/route.ts#L38-L48) — not_linked literal (copy 2); advisory pre-check
- [`src/platform/auth/deletion-jobs.ts:68-85`](../../src/platform/auth/deletion-jobs.ts#L68-L85) — requestDeletion re-checks ownership in its UPDATE WHERE; keep
- [`src/app/api/account/industry-profiles/route.ts:29-36`](../../src/app/api/account/industry-profiles/route.ts#L29-L36) — not_linked literal (copy 3)
- [`src/app/api/account/industry-profiles/update/route.ts:33-39`](../../src/app/api/account/industry-profiles/update/route.ts#L33-L39) — not_linked literal (copy 4)
- [`src/composition/sync/skills-sync.ts:59-68`](../../src/composition/sync/skills-sync.ts#L59-L68) — full roster read plus .some to test one id; should call accountBelongsToUser
- [`src/app/api/admin/characters/unlink/route.ts:34-47`](../../src/app/api/admin/characters/unlink/route.ts#L34-L47) — point query, then a roster read for the count; the roster read alone answers both
- [`src/app/api/admin/characters/reassign/route.ts:41-45`](../../src/app/api/admin/characters/reassign/route.ts#L41-L45) — admin-scoped 404 not_linked for a different user's character; keep its semantics
- [`src/app/api/maps/create/route.ts:50-57`](../../src/app/api/maps/create/route.ts#L50-L57) — unlinked creator mapped to invalid_body
- [`src/data/maps/api-contract.ts:59-71`](../../src/data/maps/api-contract.ts#L59-L71) — createMapEndpoint 400 declares only invalid_json and invalid_body
- [`src/features/maps/map-creation-client.ts:22-33`](../../src/features/maps/map-creation-client.ts#L22-L33) — a 400 falls through to 'Check your connection and try again'
- [`src/app/api/maps/create/route.test.ts:56-59`](../../src/app/api/maps/create/route.test.ts#L56-L59) — pins code invalid_body for the unlinked creator
- [`src/db/auth-schema.ts:96-97`](../../src/db/auth-schema.ts#L96-L97) — account_user_id_idx and the (providerId, accountId) unique index: roster reads are already indexed

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/internal/eve-token/route.ts:25-27`](../../src/app/api/internal/eve-token/route.ts#L25-L27) — service endpoint; a bare 404 not_found is its declared contract (platform/auth/api-contract.ts:30) and deliberately reveals nothing
- [`src/app/api/industry/skill-levels/route.ts:20-30`](../../src/app/api/industry/skill-levels/route.ts#L20-L30) — a null result is the read's normal 200 {levels:null}, the same as signed out; keep
- [`src/composition/map-creation.ts:25, 33, 47-49, 147-154`](../../src/composition/map-creation.ts#L25) — the DI seam listLinkedCharacterIds is injected at 11 test call sites; the roster read is cheap; keep
- [`src/app/api/account/industry-profiles/profile-writes.ts:9-17`](../../src/app/api/account/industry-profiles/profile-writes.ts#L9-L17) — already checks only new members via unlinkedNewMembers (profile-document.ts:80-89); the roster read is cheap
- [`src/app/api/account/characters/unlink/route.ts:42-49`](../../src/app/api/account/characters/unlink/route.ts#L42-L49) — needs the roster anyway for the last_character count; already one read

</details>

**Home.** `src/platform/auth/linked-characters.ts (notLinkedFailure, and setActiveCharacter returning boolean)`

**Boundary check.** - platform/auth may import lib (for validationFailure from src/lib/failure) and db (rule platform/auth→[...,db,lib,...]).
- The api route consumers may import platform/auth (rule api→[...,platform/auth,...]).
- composition/sync/skills-sync may import platform/auth (rule composition→[...,platform/auth,...]).
- features/maps/map-creation-client reads the problem code from data/maps/api-contract (rule features→[...,data,...]).

**API sketch.**

```ts
// src/platform/auth/linked-characters.ts
export function notLinkedFailure(): AppFailure; // validationFailure('not_linked', 'Character not linked to your account')
export async function setActiveCharacter(userId: string, characterId: number): Promise<boolean>;
// UPDATE "user" SET active_character_id=$c, updated_at=now()
//   WHERE id=$u AND EXISTS (SELECT 1 FROM account WHERE eveAccountsForUser($u) AND accountMatch($c))
//   RETURNING id  -> true when a row was updated

// src/data/maps/api-contract.ts
400: problem('invalid_json', 'invalid_body', 'not_linked')
```

**Migration steps.**

1. Add notLinkedFailure() to linked-characters.ts. Replace the literals in purge-character/route.ts:43-47, industry-profiles/route.ts:34 and industry-profiles/update/route.ts:37. Response status and body stay the same.
2. Change setActiveCharacter to add the EXISTS ownership predicate and return whether a row was updated. Update its callers: grep for setActiveCharacter. active-character/route.ts drops the accountBelongsToUser pre-check and branches on the boolean. After P255 the failure branch is the not_linked notice redirect; before P255 it returns problemResponse(notLinkedFailure()).
3. skills-sync.ts:59-68: replace listLinkedCharacters plus .some with `if (!(await accountBelongsToUser(userId, characterId))) return null;`. The null contract is unchanged.
4. admin/characters/unlink/route.ts: delete the accountBelongsToUser call and its import. Read the roster once, as account unlink does: `const linked = await listLinkedCharacters(userId); if (!linked.some(c => c.characterId === characterId)) → not_linked notice (P255); if (linked.length <= 1) → last_character`. Keep the in-transaction check in deleteLinkedCharacter.
5. Add 'not_linked' to createMapEndpoint's 400 problems. In maps/create/route.ts, return apiResponse(createMapEndpoint, 400, notLinkedFailure()) for reason 'unlinked-creator-character'. In map-creation-client.ts mapCreationFailureMessage, return copy such as 'Choose one of your own linked characters.' when outcome.kind==='api' && outcome.status===400 && outcome.error.code==='not_linked'.
6. Leave unchanged: eve-token, skill-levels' null, admin reassign's 404, map-creation's seam, profile-writes, requestDeletion, and the unlink and reassign transaction WHERE clauses.

**Tests.** Add:
- linked-characters.db.test.ts: setActiveCharacter returns false and leaves activeCharacterId unchanged for an id linked to another user, and returns true for an own id. Extend the case near line 160.
- map-creation-client.test.ts: the not_linked copy.
- A skills-sync unit test. None exists; mock accountBelongsToUser and assert null for a foreign id and no roster read.

Update:
- account/active-character/route.test.ts: mock setActiveCharacter instead of accountBelongsToUser.
- admin/characters/unlink/route.test.ts: drive not_linked through the listLinkedCharacters mock.
- maps/create/route.test.ts:56-59: expect code not_linked.

Guards: the industry-profiles route tests and purge-character tests assert the unchanged not_linked body. problem-matrix.test.ts is unaffected, since it mocks accountBelongsToUser only for eve-token.

**Notes.** No status codes change except on maps/create, where the code moves from invalid_body to not_linked inside the same 400; the client does not branch on invalid_body today. Do not merge the admin 404 'Character not linked to that user' into the self-service 400: an admin acting on another user's character is a different statement. After P255, admin unlink no longer returns it, and reassign is its only user. setActiveCharacter atomicity is mostly hygiene: resolveActiveCharacter (linked-characters.ts:141-174) already self-heals a stale active id. The win is one round trip and no separate pre-check.

<sub>Reported by: gap:linked-character-ownership-gate.</sub>

<a id="p250"></a>

## P250: Check runMutationRoute stage failures against the endpoint contract, and derive status only where it varies

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about +30 / -20 (helper and option added; two ternaries and two hand-rolled preflights removed; ~25 one-word `endpoint:` additions)
- **Depends on:** [P142](wave-01-quick-wins-delete-dead-code-fix-small.md#p142), [P141](#p141)
- **Existing primitive:** `src/transport/api-response.ts:apiResponse; src/transport/endpoint.ts:problem`

**Problem.** Stage failures in runMutationRoute go to problemResponse, which never checks the endpoint's declared statuses or codes. A contract that omits a stage code, such as 403 cross_origin, would fail without notice: decodeEndpointResponse turns any undeclared code into a protocol failure on the client.

Three drifted copies sit beside it:
- sync-leave re-implements rateLimitPreflight with problemResponse, so its 429 skips the contract.
- active-character re-implements rateLimitPreflight with problemResponse.
- Both internal service routes pick the status with a `failure.code === 'not_configured' ? 500 : 401` ternary that duplicates CATEGORY_STATUS. It keys on the code rather than the category, so any new unexpected-category code from checkBearerSecret would be sent as 401 and make apiResponse throw.

**Verifier revision.** The real gap is narrower than claimed. runMutationRoute (src/app/api/mutation-route.ts:51-59) sends authorize, origin and parse failures through problemResponse, so the contract never checks them. sync-leave also hand-rolls its rate-limit preflight with problemResponse, even though its contract declares 429 and rateLimitPreflight exists. The two internal routes map status from failure.code ('not_configured' ? 500 : 401) when it should come from the category. Those are real.

The other half does not hold up. The ~28 direct `apiResponse(ep, 4xx, x.failure)` sites are not harmful duplication. The status literal is the only compile-time proof that the endpoint declares that status, and apiResponse already asserts at runtime that the failure maps to it. Stage functions return a plain AppFailure with an untyped category, so deriving the status would move that check from typecheck to runtime only.

The contract-side helpers (JSON_BODY_PROBLEM_CODES and mutationResponses) are also dropped. The stage sets differ per endpoint: account/delete and sessions/revoke have no 400, public endpoints have no 401 or 403, and only 9 declare 429. A merge helper would need per-stage flags and mapped types over const generics, and it would make the declarative wire spec harder to read. I checked every endpoint behind runMutationRoute: all of them declare invalid_json/invalid_body, unauthenticated and cross_origin today. Sending the stage failures through the contract assertion closes the drift risk without touching the contracts.

**Sites (12).**

- [`src/app/api/mutation-route.ts:42-64`](../../src/app/api/mutation-route.ts#L42-L64) — authorize, origin and parse failures all go through problemResponse, so the contract never checks them
- [`src/transport/api-response.ts:25-77`](../../src/transport/api-response.ts#L25-L77) — apiResponse asserts the code and the category-to-status mapping; problemResponse (74-77) skips both
- [`src/lib/problem.ts:25-52`](../../src/lib/problem.ts#L25-L52) — CATEGORY_STATUS and the private statusFor (dependency_unavailable can override the status); this is the right place to derive the status
- [`src/app/api/internal/eve-characters/route.ts:17-18`](../../src/app/api/internal/eve-characters/route.ts#L17-L18) — code-keyed status ternary for checkBearerSecret, which can fail with 500 or 401
- [`src/app/api/internal/eve-token/route.ts:19-20`](../../src/app/api/internal/eve-token/route.ts#L19-L20) — same ternary
- [`src/lib/service-auth.ts:16-37`](../../src/lib/service-auth.ts#L16-L37) — checkBearerSecret returns either unexpected('not_configured') or unauthenticated, so the status really does vary here
- [`src/app/api/sync-leave/route.ts:14-20`](../../src/app/api/sync-leave/route.ts#L14-L20) — hand-rolled checkRateLimit preflight answered with problemResponse, although leaveSyncEndpoint declares 429; bypasses rateLimitPreflight and the contract
- [`src/app/api/account/active-character/route.ts:16-19`](../../src/app/api/account/active-character/route.ts#L16-L19) — hand-rolled preflight (contractless form route); should use rateLimitPreflight(..., problemResponse) like characters/unlink
- [`src/app/api/rate-limit-preflight.ts:4-13`](../../src/app/api/rate-limit-preflight.ts#L4-L13) — existing primitive that the two sites above bypass
- [`src/app/api/account/purge-character/route.ts:20-24`](../../src/app/api/account/purge-character/route.ts#L20-L24) — the correct pattern: rateLimitPreflight with apiResponse(endpoint, 429, failure)
- [`src/app/api/account/sessions/revoke/route.ts:14-18`](../../src/app/api/account/sessions/revoke/route.ts#L14-L18) — correct pattern, same as purge-character
- [`src/transport/decode.ts:110-123`](../../src/transport/decode.ts#L110-L123) — an undeclared code becomes a protocol failure, which is why unchecked stage failures matter

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/account/delete/route.ts:20-31`](../../src/app/api/account/delete/route.ts#L20-L31) — Explicit 429, 401 and 403 on a single-category failure. The literal is a compile-time declared-status check and apiResponse verifies the mapping at runtime. Keep it.
- [`src/app/api/feedback/route.ts:33-40, 69-72`](../../src/app/api/feedback/route.ts#L33-L40) — Same reason: the explicit status is correct and statically checked.
- [`src/app/api/account/custom-structures/search/route.ts:17-21`](../../src/app/api/account/custom-structures/search/route.ts#L17-L21) — Same reason.
- [`src/app/api/market-refresh-route.ts:28-32`](../../src/app/api/market-refresh-route.ts#L28-L32) — Same reason. It is generic over two endpoints, and both declare 400 and 429.
- [`src/app/api/account/corp-sharing/route.ts:18-21`](../../src/app/api/account/corp-sharing/route.ts#L18-L21) — directorGate only returns forbiddenFailure (corp-role-gates.ts:10-34), so 403 is always right.
- [`src/data/maps/api-contract.ts:59-71, 146-156, 207-245`](../../src/data/maps/api-contract.ts#L59-L71) — Declarative wire spec. All 8 maps endpoints declare the stage codes consistently, and the stage sets vary per endpoint. No helper.
- [`src/features/industry-planner/api-contract.ts:275-333`](../../src/features/industry-planner/api-contract.ts#L275-L333) — Same: consistent today, and a merge helper would hurt readability.
- [`src/features/industry-planner/profiles/api-contract.ts:34-99`](../../src/features/industry-planner/profiles/api-contract.ts#L34-L99) — Same.
- [`src/transport/cron.ts:4-10`](../../src/transport/cron.ts#L4-L10) — requireBearerSecret serves contractless cron routes (CRON_ROUTES in api-contracts.test.ts), so problemResponse is correct there.
- [`src/app/api/admin-mutation.ts:6-12`](../../src/app/api/admin-mutation.ts#L6-L12) — Admin form routes are contractless (FORM_ROUTES), so problemResponse is correct there.

</details>

**Home.** `src/transport/api-response.ts (apiFailure); src/lib/problem.ts (export problemStatus); src/app/api/mutation-route.ts (optional endpoint option)`

**Boundary check.** - apiFailure lives in transport, which may import only lib (rule `transport -> [lib]`). It imports lib/failure and lib/problem, which is legal.
- problemStatus lives in lib, which may import only config. It needs nothing new.
- Consumers: mutation-route.ts, rate-limit-preflight.ts and internal/eve-*/route.ts are all in the api zone, and `api -> [transport, composition, features, platform/auth, platform/esi, data, db, lib, config]` allows transport.
- No contract module changes, so the data, features and platform/auth zones are untouched.

**API sketch.**

```ts
// src/lib/problem.ts
export function problemStatus(failure: AppFailure): number; // the current statusFor, exported

// src/transport/api-response.ts
/** Serializes a failure whose category is not statically known; derives the status and asserts the endpoint declares a problem codec there with this code. */
export function apiFailure(endpoint: EndpointContract, failure: AppFailure): Response;
// impl: const status = problemStatus(failure); const codec = endpoint.responses[status];
// if (codec?.kind !== 'problem') throw new Error(`... does not declare a problem at ${status}`);
// return (apiResponse as (e: EndpointContract, s: number, ...b: unknown[]) => Response)(endpoint, status, failure);

// src/app/api/mutation-route.ts
export interface CapabilityOption { capability: CapabilityId; endpoint?: EndpointContract; preflight?: () => Promise<Response | null>; }
// runStages: const fail = (f: AppFailure) => runtime.endpoint ? apiFailure(runtime.endpoint, f) : problemResponse(f);
```

**Migration steps.**

1. In src/lib/problem.ts, rename the private statusFor to an exported problemStatus and keep problemBody calling it. Add a lib/problem.test.ts case that dependency_unavailable honours its 502/503 override and every other category uses CATEGORY_STATUS.
2. Add apiFailure to src/transport/api-response.ts. It must assert codec.kind === 'problem' before delegating to apiResponse's implementation signature: without that guard, a failure whose status is declared with jsonBody would hit apiResponse's json branch and serialize the raw AppFailure, cause included. Add 'src/transport/api-response.ts:apiFailure' to PROTECTED_RESPONSE_EXPORTS in src/app/api/guard-emissions.test.ts.
3. In src/app/api/mutation-route.ts, add an optional `endpoint` to CapabilityOption and route the three stage failures (lines 52, 55, 59) through a local `fail` that uses apiFailure when an endpoint is present and problemResponse otherwise.
4. Pass `endpoint` from every runMutationRoute caller that has a contract: saved-plans (4), custom-structures create/update/delete, industry-profiles (4), corp-sharing, corp-structures/rigs, purge-character, sessions/revoke, preferences, maps access/jump/create/search-characters/signature-elimination, maps/lifecycle-route.ts (all three lifecycle endpoints), and sync-leave. Leave out the contractless form routes: admin/characters/unlink, admin/sessions/revoke, account/active-character and account/characters/unlink.
5. Replace the two internal-route ternaries with `return apiFailure(eveCharactersEndpoint, auth.failure)` and `return apiFailure(eveTokenEndpoint, auth.failure)`.
6. Replace the hand-rolled sync-leave preflight with `rateLimitPreflight(request, { name: 'sync-leave', perMinute: 30 }, (f) => apiResponse(leaveSyncEndpoint, 429, f))`, and active-character's with `rateLimitPreflight(request, { name: 'account-switch', perMinute: 30 }, problemResponse)`. sync-leave can then drop its checkRateLimit and problemResponse imports.
7. Leave the direct `apiResponse(ep, 4xx, x.failure)` sites and the contract problem blocks unchanged.

**Tests.** Add to src/app/api/mutation-route.test.ts:
- With an endpoint declaring 401/403/400, each stage failure serializes with the derived status.
- With an endpoint that omits 'cross_origin', the origin stage throws, exactly like apiResponse.
- Without an endpoint, the current problemResponse behavior is unchanged.

Add to src/transport/api-response.test.ts: apiFailure derives 500 for not_configured and 401 for unauthenticated, and throws on an undeclared status, an undeclared code, or a non-problem codec.

Existing guards: src/app/api/problem-matrix.test.ts (covers eve-token), src/app/api/internal/eve-characters/route.test.ts, src/app/api/sync-leave route tests, and src/app/api/same-origin-coverage.test.ts (the PIPELINE_MUTATIONS inventory).

**Notes.** - After this change, a contract missing a stage code turns a 403/401/400 into a thrown 500. That is the same behavior apiResponse already has at direct sites. I audited every runMutationRoute contract: all declare 400 invalid_json/invalid_body (where they parse JSON), 401 unauthenticated and 403 cross_origin, so nothing changes at runtime today.
- purge-character's custom parse re-wraps readJsonBody failures with the same code, so it stays inside the declared 400 set.
- The maps/create preflight already uses apiResponse(createMapEndpoint, 429, ...), which is correct.
- Out of scope here: the admin form pipeline exists in two shapes. admin/characters/unlink and admin/sessions/revoke use runMutationRoute(checkAdmin), while reassign, esi-jobs/retry, role and wh-statics use capabilityRoute plus adminMutationGate. That is a separate lead.

<sub>Reported by: concern:contracts-types, concern:request-pipeline.</sub>

<a id="p306"></a>

## P306: Collapse pass-through helpers in platform (scoreboard dispatch, token reflection, auth form schemas, rate-limit preflight)

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -55 / +15 lines (production), about -15 lines (tests)
- **Depends on:** [P142](wave-01-quick-wins-delete-dead-code-fix-small.md#p142), [P136](wave-01-quick-wins-delete-dead-code-fix-small.md#p136)
- **Existing primitive:** `src/platform/esi/scoreboard/types.ts:EsiScoreboard.budgetSnapshot; src/config/site-url.ts:PRODUCTION_SITE_URL`

**Problem.** Several platform modules keep wrappers that only forward to an existing call. readEsiBudgetSnapshot tags the resolved scoreboard 'redis' or 'memory' only to call one of two one-line helpers that both return scoreboard.budgetSnapshot(). reflectStoredToken re-implements readCachedToken's freshness, decrypt and skew checks. isDeleteAcknowledged returns its boolean argument, and ConvexClientProvider wraps fetchConvexAccessToken in a forwarding useCallback. same-origin.ts hard-codes the production origin that src/config/site-url.ts exports. The two account form schemas are identical, and the characterId coercion is spelled four times. makeOwnedDescriptor computes basePathFor twice per read. portraitUrl re-wraps characterPortraitUrl only to change the default size. Two API routes hand-roll the rateLimitPreflight helper that sits next to them.

**Verifier revision.** Every cited site is real and checked. The ESI scoreboard union is pure ceremony. Both factories are typed `: EsiScoreboard`, and both read*BudgetSnapshot helpers are `return scoreboard.budgetSnapshot()`, so the backend tag selects between two identical calls. reflectStoredToken can be rebuilt on readCachedToken with identical results, provided its not_found, refreshToken===null and count===1 guards stay first. readCachedToken returns null in exactly the cases where reflectStoredToken returns reauth_required. isDeleteAcknowledged is identity on a boolean. Its only other reference is a coverage pin, which must also be removed. fetchConvexAccessToken(opts?: {forceRefreshToken?: boolean}) is a module-level function, so it is already stable and type-compatible with Convex's fetchAccessToken. PRODUCTION_SITE_URL's only consumer today is its own test, so same-origin.ts would become its first real production consumer. Scope changes: (a) the form-schema item widens. `characterId: z.coerce.number().int().positive()` is written 4 times in api-contract.ts (65-71, 80-88), so add a characterIdField next to the existing userIdField. (b) Added a bypass of an existing primitive: active-character and sync-leave hand-roll the rateLimitPreflight wrapper that unlink, sessions/revoke and purge-character already use. Dropped: the vague claim that 'the same pattern appears elsewhere in platform', which has no evidence.

**Sites (20).**

- [`src/platform/esi/scoreboard/index.ts:1-3, 16-65`](../../src/platform/esi/scoreboard/index.ts#L1-L3) — ResolvedScoreboard union, memo maps typed as ReturnType<typeof create*Scoreboard> (both already EsiScoreboard), backend-tag branch in readEsiBudgetSnapshot
- [`src/platform/esi/scoreboard/memory.ts:113-121`](../../src/platform/esi/scoreboard/memory.ts#L113-L121) — createMemoryScoreboard(): EsiScoreboard; readMemoryBudgetSnapshot -> scoreboard.budgetSnapshot()
- [`src/platform/esi/scoreboard/redis.ts:185-193`](../../src/platform/esi/scoreboard/redis.ts#L185-L193) — createRedisScoreboard(): EsiScoreboard; readRedisBudgetSnapshot -> scoreboard.budgetSnapshot()
- [`src/platform/auth/eve-token-service.ts:74-103`](../../src/platform/auth/eve-token-service.ts#L74-L103) — readCachedToken (74-87) and reflectStoredToken (89-103) apply the same token checks. reflectStoredToken is called from lines 158 and 264.
- [`src/platform/auth/account-actions.ts:63-65`](../../src/platform/auth/account-actions.ts#L63-L65) — isDeleteAcknowledged(acknowledged) => acknowledged === true
- [`src/components/composition/account/AccountDangerZone.tsx:276-285`](../../src/components/composition/account/AccountDangerZone.tsx#L276-L285) — Only production caller (two uses); acknowledged is useState(false), a boolean
- [`src/platform/auth/coverage.test.ts:54-65`](../../src/platform/auth/coverage.test.ts#L54-L65) — Pins isDeleteAcknowledged on the test graph; must drop it when the function goes
- [`src/platform/auth/components/ConvexClientProvider.tsx:3, 21-30`](../../src/platform/auth/components/ConvexClientProvider.tsx#L3) — useCallback forwards to fetchConvexAccessToken and is listed as a useMemo dependency
- [`src/platform/auth/auth-client.ts:42-44`](../../src/platform/auth/auth-client.ts#L42-L44) — fetchConvexAccessToken(opts?: { forceRefreshToken?: boolean }) is module-level and assignable to Convex's fetchAccessToken
- [`src/platform/auth/same-origin.ts:1, 26-29`](../../src/platform/auth/same-origin.ts#L1) — Literal 'https://lgi.tools' fallback; only reachable when NEXT_PUBLIC_SITE_URL is set but unparsable
- [`src/config/site-url.ts:1-4`](../../src/config/site-url.ts#L1-L4) — PRODUCTION_SITE_URL exists; only consumer outside this file is site-url.test.ts
- [`src/platform/auth/api-contract.ts:9, 65-71, 80-88`](../../src/platform/auth/api-contract.ts#L9) — userIdField precedent at 9; identical switch/unlink schemas; characterId coercion repeated in adminUnlink and adminReassign too
- [`src/app/api/account/active-character/route.ts:7, 16-25`](../../src/app/api/account/active-character/route.ts#L7) — Consumes switchCharacterFormSchema; also hand-rolls the rate-limit preflight
- [`src/app/api/account/characters/unlink/route.ts:6-9, 30-38`](../../src/app/api/account/characters/unlink/route.ts#L6-L9) — Consumes unlinkCharacterFormSchema; already uses rateLimitPreflight
- [`src/app/api/sync-leave/route.ts:14-20`](../../src/app/api/sync-leave/route.ts#L14-L20) — Hand-rolled checkRateLimit + problemResponse preflight identical to rateLimitPreflight
- [`src/app/api/rate-limit-preflight.ts:4-13`](../../src/app/api/rate-limit-preflight.ts#L4-L13) — Existing primitive the two routes bypass
- [`src/platform/owner-sync/owned.ts:68-83`](../../src/platform/owner-sync/owned.ts#L68-L83) — basePathFor(spec.resource, owner) at 69 and again at 78
- [`src/platform/auth/eve-sso.ts:258, 262-264`](../../src/platform/auth/eve-sso.ts#L258) — portraitUrl wraps characterPortraitUrl with size default 128
- [`src/platform/auth/linked-characters.ts:4, 88`](../../src/platform/auth/linked-characters.ts#L4) — Only other production caller of portraitUrl
- [`src/platform/auth/eve-sso.test.ts:92-104`](../../src/platform/auth/eve-sso.test.ts#L92-L104) — Tests the wrapper's default; src/lib/eve-image.test.ts already covers characterPortraitUrl sizes

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/lib/problem.ts:66`](../../src/lib/problem.ts#L66) — `https://lgi.tools/problems/...` is a stable RFC 9457 problem-type URI. It is an identifier, not an origin, and should not follow PRODUCTION_SITE_URL edits.
- [`src/config/user-agent.ts:3`](../../src/config/user-agent.ts#L3) — Outbound contact URL in config; already in the config zone and is a contact address, not origin policy
- `src/app/api/telemetry/route.ts, src/app/api/feedback/route.ts, src/app/api/account/delete/route.ts, src/app/api/auth/[...all]/route.ts, src/app/api/market-refresh-route.ts:35 / 36 / 16 / 37 / 31` — These checkRateLimit calls are outside runMutationRoute preflight or use custom limit handling. They are not the preflight wrapper shape, so they were not checked as bypasses.

</details>

**Home.** `No new module. Changes stay in their owners: src/platform/esi/scoreboard/index.ts, src/platform/auth/eve-token-service.ts, src/platform/auth/api-contract.ts (characterIdField + characterIdFormSchema), src/platform/auth/same-origin.ts (imports src/config/site-url.ts), src/platform/auth/eve-sso.ts and linked-characters.ts (import src/lib/eve-image.ts), src/platform/owner-sync/owned.ts, src/app/api/{account/active-character,sync-leave}/route.ts (adopt src/app/api/rate-limit-preflight.ts).`

**Boundary check.** same-origin.ts (zone platform/auth) -> src/config/site-url.ts (config): allowed by rule platform/auth allow [..., 'config']. linked-characters.ts and eve-sso.ts (platform/auth) -> src/lib/eve-image.ts (lib): allowed by platform/auth allow [..., 'lib']; eve-sso.ts already imports it. The scoreboard changes stay inside platform/esi. api-contract.ts stays in platform/auth; its consumers in src/app/api (zone api) may import platform/auth per rule api allow [..., 'platform/auth']. The rateLimitPreflight adopters are in src/app/api (zone api) and import from src/app/api/rate-limit-preflight.ts in the same zone, as unlink/sessions/purge-character already do. owned.ts stays inside platform/owner-sync.

**API sketch.**

```ts
// scoreboard/index.ts
const redisScoreboards = new Map<string, EsiScoreboard>();
let memoryScoreboard: EsiScoreboard | null = null;
export function resolveScoreboard(): EsiScoreboard | null; // former resolveConcreteScoreboard body
export async function readEsiBudgetSnapshot(): Promise<EsiBudgetSnapshot | null> {
  const scoreboard = resolveScoreboard();
  return scoreboard === null ? null : scoreboard.budgetSnapshot();
}
// eve-token-service.ts
async function reflectStoredToken(characterId: number): Promise<FreshTokenResult> {
  const row = await loadAccountRow(characterId);
  if (!row) return { kind: 'not_found' };
  if (row.refreshToken === null) return { kind: 'reauth_required' };
  if (row.refreshTokenInvalidGrantCount === 1) return { kind: 'upstream_error' };
  return readCachedToken(row) ?? { kind: 'reauth_required' };
}
// api-contract.ts
const characterIdField = z.coerce.number().int().positive();
export const characterIdFormSchema = z.object({ characterId: characterIdField });
```

**Migration steps.**

1. Scoreboard: in index.ts, retype redisScoreboards and memoryScoreboard as EsiScoreboard. Fold resolveConcreteScoreboard's body into resolveScoreboard (no union), make readEsiBudgetSnapshot call resolveScoreboard()?.budgetSnapshot() and delete the ResolvedScoreboard type. Delete readMemoryBudgetSnapshot (memory.ts 117-121) and readRedisBudgetSnapshot (redis.ts 189-193) and their imports at index.ts 2-3. Keep the warn-once and error-once flags exactly as they are.
2. Token service: rewrite reflectStoredToken (eve-token-service.ts 89-103) as in the sketch, keeping the not_found, refreshToken===null and invalid-grant-count===1 guards before readCachedToken.
3. Account delete: replace isDeleteAcknowledged(acknowledged) with `acknowledged` in AccountDangerZone.tsx 277 and 285. Delete the export at account-actions.ts 63-65, then remove it from the import and pinned array in src/platform/auth/coverage.test.ts 54-62. Keep ConvexClientProvider pinned.
4. ConvexClientProvider: drop the useCallback (21-25) and the `useCallback` import. Return useMemo(() => ({ isLoading: loading, isAuthenticated, fetchAccessToken: fetchConvexAccessToken }), [loading, isAuthenticated]).
5. same-origin.ts: import PRODUCTION_SITE_URL alongside SITE_URL and replace the 'https://lgi.tools' literal at line 29.
6. api-contract.ts: add `const characterIdField = z.coerce.number().int().positive();` next to userIdField. Replace switchCharacterFormSchema and unlinkCharacterFormSchema with one exported characterIdFormSchema, and use characterIdField in adminUnlinkFormSchema and adminReassignFormSchema. Update the imports in active-character/route.ts and characters/unlink/route.ts.
7. Rate-limit preflight: in active-character/route.ts 16-19 use `preflight: rateLimitPreflight(request, { name: 'account-switch', perMinute: 30 }, problemResponse)`, and in sync-leave/route.ts 14-20 use `rateLimitPreflight(request, { name: 'sync-leave', perMinute: 30 }, problemResponse)`. Drop the now-unused checkRateLimit imports.
8. owned.ts: in fetchAndPlan, compute `const endpoint = basePathFor(spec.resource, owner)` once and use it for port.read and source.endpoint.
9. Portrait: replace portraitUrl(characterId) with characterPortraitUrl(characterId, 128) at eve-sso.ts 258 and linked-characters.ts 88 (import from '@/lib/eve-image'). Delete the wrapper at eve-sso.ts 262-264 and its describe block in eve-sso.test.ts 92-104. src/lib/eve-image.test.ts already covers sizes. Keep the explicit 128: the wrapper's default differs from characterPortraitUrl's default of 64.
10. Run pnpm check through the test-runner agent.

**Tests.** Scoreboard: src/platform/esi/scoreboard.test.ts 435-510 already asserts readEsiBudgetSnapshot for the configured backend and the null result when unconfigured. Keep it as the guard; no test imports the removed read* helpers. src/composition/esi-health.test.ts mocks readEsiBudgetSnapshot only and needs no change. Token service: the existing eve-token-service tests cover the concurrent-invalid-grant and lost-CAS paths into reflectStoredToken; confirm with grep for 'eve_token_refresh_race' and 'written.length' in its .db.test files. If missing, add one case where the reflected row has an expired access token (expects reauth_required) and one with an invalid-grant count of 1 (expects upstream_error). Routes: route tests for active-character, unlink and sync-leave should still pass; if none asserts the 429 path for active-character or sync-leave, add one that mocks checkRateLimit. Remove the portraitUrl describe block from eve-sso.test.ts and drop isDeleteAcknowledged from the coverage.test.ts pin.

**Notes.** Preserve the reflectStoredToken guard order. The invalid-grant count===1 check must stay before readCachedToken, because readCachedToken maps count===1 to null, which would otherwise become reauth_required instead of upstream_error. The extra decrypt order difference (reflectStoredToken decrypts before the skew check, readCachedToken after) does not change any result; decryptToken is pure. In ConvexClientProvider, Convex calls fetchAccessToken with { forceRefreshToken }, which fetchConvexAccessToken accepts as an optional argument; the result type Promise<string|null> is compatible. Keep the portrait size explicit at 128: the wrapper's default (128) differs from characterPortraitUrl's default (64), so a bare characterPortraitUrl(id) would silently shrink session and linked-character portraits. The rateLimitPreflight adoption keeps the same name and perMinute values and the same problemResponse callback, so responses are unchanged. Every item is a local edit with no cross-module design, so it can ship as one small PR.

<sub>Reported by: area:platform, concern:esi-sync.</sub>

<a id="p143"></a>

## P143: Key measureOwnedDataRead by the endpoint contract, measure corp-structures, and guard every OnView route

- **Status:** [ ] not started
- **Category:** api-route · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -10 / +45 (union removed; corp-structures measurement, route test and guard scan added)
- **Depends on:** —
- **Existing primitive:** `src/app/api/owned-data-telemetry.ts:measureOwnedDataRead; src/data/telemetry/cost-metrics.ts:observeCostPromise`

**Problem.** measureOwnedDataRead takes a hand-maintained union of eight path literals that already exist as `endpoint.path` on each route's contract. getTopCostlyEndpoints groups the admin cost view by this label. corp-structures is an OnView owned-data read like corp-industry-jobs, but it skips measurement and is missing from the union, so its cost never appears in the owned_data_read dashboard. No check ties *OnView reads to measurement.

**Verifier revision.** The proposed respondForUser/respondForUserJson helper is rejected. The anonymous-empty branch is a one- or two-line idiom. The bodies vary: industry-slots and team-skill-levels reshape the result, structures returns early, characters maps it, and the POSTs dedupe ids. A generic helper would have to re-derive apiResponse's overloaded typing (ResponseArgsFor<E['responses'][200]>) to save about three lines per route. Rebuilding on observeCostPromise is also rejected. Its metadata is static, it observes fire-and-forget, and its durations are fractional performance.now values, whereas measureOwnedDataRead awaits the read and needs a `returned` value derived from the result, so it would need a new hook for one consumer. Two parts are real. (1) The OwnedDataEndpoint union re-types eight path literals that equal endpoint.path in each contract. (2) corp-structures is the only *OnView owned read route that is not measured: nine routes call *OnView(, eight are measured, and getCorpStructuresForUserOnView schedules a refresh just as the others do. A source-scan guard, in the style of same-origin-coverage and authz-markers, prevents the next drift better than a wrapper could.

**Sites (16).**

- [`src/app/api/owned-data-telemetry.ts:3-46`](../../src/app/api/owned-data-telemetry.ts#L3-L46) — path-literal union and timer
- [`src/app/api/account/board/route.ts:9-20`](../../src/app/api/account/board/route.ts#L9-L20) — measured, label literal == boardEndpoint.path
- [`src/app/api/account/corp-industry-jobs/route.ts:9-20`](../../src/app/api/account/corp-industry-jobs/route.ts#L9-L20) — measured
- [`src/app/api/account/industry-jobs/route.ts:9-20`](../../src/app/api/account/industry-jobs/route.ts#L9-L20) — measured
- [`src/app/api/account/industry-slots/route.ts:26-44`](../../src/app/api/account/industry-slots/route.ts#L26-L44) — measured, then reshaped
- [`src/app/api/industry/team-skill-levels/route.ts:9-18`](../../src/app/api/industry/team-skill-levels/route.ts#L9-L18) — measured
- [`src/app/api/industry/owned-assets/route.ts:16-34`](../../src/app/api/industry/owned-assets/route.ts#L16-L34) — POST measured with requested
- [`src/app/api/industry/owned-blueprints/route.ts:16-34`](../../src/app/api/industry/owned-blueprints/route.ts#L16-L34) — POST measured with requested
- [`src/app/api/industry/skill-levels/route.ts:16-31`](../../src/app/api/industry/skill-levels/route.ts#L16-L31) — POST measured, requested: 1
- [`src/app/api/account/corp-structures/route.ts:8-15`](../../src/app/api/account/corp-structures/route.ts#L8-L15) — unmeasured OnView owned read (drift); no route test
- [`src/composition/sync/corp-structures-sync.ts:66-80`](../../src/composition/sync/corp-structures-sync.ts#L66-L80) — getCorpStructuresForUserOnView reads and schedules a refresh, like the other OnView readers
- [`src/features/industry-jobs/api-contract.ts:22-24, 45-47, 75-77`](../../src/features/industry-jobs/api-contract.ts#L22-L24) — paths equal the union literals
- [`src/features/industry-planner/api-contract.ts:121-123, 154-156, 171-173, 189-191`](../../src/features/industry-planner/api-contract.ts#L121-L123) — paths equal the union literals
- [`src/composition/board/api-contract.ts:179-181`](../../src/composition/board/api-contract.ts#L179-L181) — path equals '/api/account/board'
- [`src/features/owned-structures/api-contract.ts:28-30`](../../src/features/owned-structures/api-contract.ts#L28-L30) — '/api/account/corp-structures'
- [`src/data/telemetry/queries.ts:587-619`](../../src/data/telemetry/queries.ts#L587-L619) — getTopCostlyEndpoints groups owned_data_read by metadata.endpoint

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/account/characters/route.ts:11-26`](../../src/app/api/account/characters/route.ts#L11-L26) — not an OnView owned read; the anonymous-empty idiom is one line
- [`src/app/api/account/structures/route.ts:14-35`](../../src/app/api/account/structures/route.ts#L14-L35) — multi-read composition with an early return; not an OnView read
- [`src/app/api/account/saved-plans/route.ts:24-29`](../../src/app/api/account/saved-plans/route.ts#L24-L29) — plain list read; idiom only
- [`src/app/api/account/industry-profiles/route.ts:17-22`](../../src/app/api/account/industry-profiles/route.ts#L17-L22) — plain list read; idiom only
- [`src/app/api/preferences/route.ts:17-24`](../../src/app/api/preferences/route.ts#L17-L24) — plain list read; idiom only
- [`src/data/telemetry/cost-metrics.ts:39-50`](../../src/data/telemetry/cost-metrics.ts#L39-L50) — observeCostPromise: static metadata, fire-and-forget, performance.now floats; it cannot express `returned` without a new hook

</details>

**Home.** `src/app/api/owned-data-telemetry.ts (existing measureOwnedDataRead)`

**Boundary check.** The module is in zone api, and every caller is a src/app/api route (same zone). It imports '@/data/telemetry/cost-metrics' (the api rule allows data) and type EndpointContract from '@/transport/endpoint' (allows transport). The guard test lives beside it in src/app/api.

**API sketch.**

```ts
import type { EndpointContract } from '@/transport/endpoint';
export interface MeasuredOwnedDataRead<T> {
  endpoint: Pick<EndpointContract, 'path'>; // was OwnedDataEndpoint literal union
  requested?: number;
  read: () => Promise<T>;
  returned: (result: T) => number;
}
export async function measureOwnedDataRead<T>(input: MeasuredOwnedDataRead<T>): Promise<T>; // emits { endpoint: input.endpoint.path, ... } unchanged otherwise
```

**Migration steps.**

1. Change MeasuredOwnedDataRead.endpoint to Pick<EndpointContract, 'path'> and emit `endpoint: endpoint.path`. Delete the OwnedDataEndpoint union.
2. In the eight measured routes, pass the contract each already imports (boardEndpoint, corpIndustryJobsEndpoint, industryJobsEndpoint, industrySlotsEndpoint, teamSkillLevelsEndpoint, ownedAssetsEndpoint, ownedBlueprintsEndpoint, skillLevelsEndpoint) in place of the string literal.
3. In src/app/api/account/corp-structures/route.ts, wrap the read: measureOwnedDataRead({ endpoint: corpStructuresEndpoint, read: () => getCorpStructuresForUserOnView(userId), returned: (v) => v.corporations.length }).
4. Add a source-scan test (in owned-data-telemetry.test.ts or a new owned-data-coverage.test.ts). It walks src/app/api/**/route.ts and asserts that every file calling an identifier matching /\b\w+OnView\(/ imports measureOwnedDataRead from '@/app/api/owned-data-telemetry'.
5. Update owned-data-telemetry.test.ts to pass { path: '/api/industry/owned-assets' } and { path: '/api/account/industry-slots' }. The emitted assertions stay the same.

**Tests.** owned-data-telemetry.test.ts: update its inputs and keep the emitted-payload assertions byte-identical (endpoint string, requested, returned, outcome). Add src/app/api/account/corp-structures/route.test.ts: an anonymous caller gets { corporations: [] } without a read, and a signed-in caller gets one owned_data_read emission with returned = corporations.length. Add the OnView coverage scan. team-skill-levels and skill-levels route tests mock measureOwnedDataRead with an input.read() passthrough and are unaffected.

**Notes.** Every endpoint.path equals the old literal, so the metadata.endpoint values that getTopCostlyEndpoints groups on do not change. Keep Date.now integer durations. Switching to performance.now would change the stored durationMs type, and nothing gains from it. Adding corp-structures adds a new row to the admin cost view, which is the intended fix. Whether the GET owned reads should also gain capability telemetry is a separate decision outside this change.

<sub>Reported by: area:app-api, concern:request-pipeline.</sub>

<a id="p160"></a>

## P160: Rebuild measureOwnedDataRead on observeCostPromise with a result-metadata hook

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -20 / +12 (owned-data-telemetry.ts 46 to ~20 lines; cost-metrics.ts +6)
- **Depends on:** [P143](#p143)
- **Existing primitive:** `src/data/telemetry/cost-metrics.ts:observeCostPromise`

**Problem.** src/app/api/owned-data-telemetry.ts hand-rolls the succeeded/failed + durationMs emission that src/data/telemetry/cost-metrics.ts:observeCostPromise owns. In doing so it times with Date.now rather than the startCostTimer/elapsedCostTimer monotonic clock that the cost-metrics test pins as canonical. Its 8 API consumers produce owned_data_read rows read by getTopCostlyEndpoints (queries.ts:587-619). Those rows are the only cost metric with wall-clock, integer-ms durations.

**Verifier revision.** The core holds. measureOwnedDataRead re-implements observeCostPromise's outcome-plus-duration emission and drifts from the canonical clock: it uses Date.now, while cost-metrics.test.ts:39-45 pins cost timers to 'the prerender-safe monotonic clock' (performance.now). Three parts of the proposal had to change. (1) 'Spreads requested twice' is not a defect: the spread happens once in each of two exclusive branches, which is the same shape as observeCostPromise's two callbacks. (2) It is not a pure bypass, because observeCostPromise cannot carry the result-derived `returned` field today. The primitive needs an optional result-metadata hook, which is a real second consumer of the emission contract. (3) The finder's sketch passes startCostTimer() as the 4th argument, so it is evaluated after read() starts and misses the synchronous part of the read. The timer must start first. Payoff is low, but the change is small and removes a drifted copy.

**Sites (9).**

- [`src/app/api/owned-data-telemetry.ts:20-46`](../../src/app/api/owned-data-telemetry.ts#L20-L46) — try/catch that emits outcome and durationMs via Date.now; success adds returned(result)
- [`src/data/telemetry/cost-metrics.ts:5-15, 39-50`](../../src/data/telemetry/cost-metrics.ts#L5-L15) — CostTimer on performance.now; observeCostPromise emits {...metadata, outcome, durationMs}
- [`src/data/telemetry/cost-metrics.test.ts:39-45`](../../src/data/telemetry/cost-metrics.test.ts#L39-L45) — pins 'prerender-safe monotonic clock' and asserts Date.now is never called
- [`src/app/(site)/industry/[id]/page.tsx:69-71`](../../src/app/%28site%29/industry/[id]/page.tsx#L69-L71) — existing observeCostPromise consumer
- [`src/app/api/owned-data-telemetry.test.ts:1-49`](../../src/app/api/owned-data-telemetry.test.ts#L1-L49) — mocks only emitCostMetric from cost-metrics; pins endpoint/requested/returned/outcome
- [`src/app/api/account/board/route.ts:14-18`](../../src/app/api/account/board/route.ts#L14-L18) — consumer; returned = characters.length
- [`src/app/api/industry/owned-assets/route.ts:26-31`](../../src/app/api/industry/owned-assets/route.ts#L26-L31) — consumer with requested
- [`src/app/api/account/industry-slots/route.ts:31-35`](../../src/app/api/account/industry-slots/route.ts#L31-L35) — consumer; the other 5 consumers (team-skill-levels, skill-levels, owned-blueprints, corp-industry-jobs, industry-jobs) have the same shape, and every returned callback is a total property read
- [`src/data/telemetry/sql.ts:13-15`](../../src/data/telemetry/sql.ts#L13-L15) — jsonNumber casts to double precision, so fractional performance.now durations are safe for getTopCostlyEndpoints

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/capability-route.ts:16-39`](../../src/app/api/capability-route.ts#L16-L39) — Same try/catch timing shape, but it emits recordCapabilityOutcome with response/error-derived codes and retry. That is a different telemetry channel, not a cost metric.
- [`src/composition/sync/esi-refresh-worker.ts:151-175`](../../src/composition/sync/esi-refresh-worker.ts#L151-L175) — Capability outcome with job-derived retry; different channel. It pairs with capability-route.ts as a possible separate lead.
- [`src/data/market-prices/refresh-on-view.ts:155-176`](../../src/data/market-prices/refresh-on-view.ts#L155-L176) — Write-behind timing inside after(), reported to an observer callback rather than emitCostMetric
- [`src/data/market-history/refresh-on-view.ts:95-115`](../../src/data/market-history/refresh-on-view.ts#L95-L115) — Write-behind with a 'partial' outcome over a loop; not a single promise
- [`src/app/api/market-refresh-route.ts:35-37`](../../src/app/api/market-refresh-route.ts#L35-L37) — Duration feeds respond(); there is no outcome emission

</details>

**Home.** `src/data/telemetry/cost-metrics.ts (extend observeCostPromise); measureOwnedDataRead stays in src/app/api/owned-data-telemetry.ts`

**Boundary check.** cost-metrics.ts is in zone data (autoDiscover src/data). Consumers: src/app/api/owned-data-telemetry.ts is zone api, and the rule 'from: api' allows 'data'. src/app/(site)/industry/[id]/page.tsx is zone app, and the rule 'from: app' allows 'data'. cost-metrics imports next/server and ./log (same zone), so no new edges.

**API sketch.**

```ts
export function observeCostPromise<T>(
  promise: Promise<T>,
  action: UsageAction,
  metadata: Record<string, unknown>,
  timer: CostTimer = startCostTimer(),
  resultMetadata?: (value: T) => Record<string, unknown>,
): Promise<T>
// success: emitCostMetric(action, { ...metadata, ...resultMetadata?.(value), outcome: 'succeeded', durationMs: elapsedCostTimer(timer) })

export function measureOwnedDataRead<T>({ endpoint, requested, read, returned }: MeasuredOwnedDataRead<T>): Promise<T> {
  const timer = startCostTimer();
  return observeCostPromise(read(), 'owned_data_read',
    { endpoint, ...(requested === undefined ? {} : { requested }) },
    timer, (value) => ({ returned: returned(value) }));
}
```

**Migration steps.**

1. In cost-metrics.ts, add the optional 5th parameter resultMetadata to observeCostPromise and merge it into the succeeded payload only. Guard the call with try/catch (log and emit without the extra fields): it runs inside a `void promise.then(...)`, so a throwing callback would otherwise become an unhandled rejection.
2. Add a cost-metrics.test.ts case: resultMetadata fields appear on the succeeded event and are absent on the failed event.
3. Rewrite measureOwnedDataRead as a non-async function. Start the timer before calling read(), then return observeCostPromise(read(), ...). Delete the try/catch and the Date.now calls.
4. Rewrite owned-data-telemetry.test.ts. Mock next/server `after` and `@/data/telemetry/log` the way cost-metrics.test.ts does, instead of mocking emitCostMetric, because observeCostPromise calls the module-internal emitCostMetric binding and an export mock no longer intercepts it. Keep the endpoint/requested/returned/outcome assertions, and add one that durationMs comes from a performance.now spy.
5. Route tests that stub measureOwnedDataRead (skill-levels, team-skill-levels) need no change.

**Tests.** Existing guards: src/data/telemetry/cost-metrics.test.ts (monotonic clock; observe without replacing the promise) and src/app/api/owned-data-telemetry.test.ts (payload; rethrows the original error; resolves the original value). Add a resultMetadata succeeded-only case and a throwing-resultMetadata case to cost-metrics.test.ts. Port owned-data-telemetry.test.ts to log/after mocks and assert the performance.now duration.

**Notes.** Behavior differences to accept or preserve: (a) durationMs becomes fractional performance.now milliseconds instead of integer wall-clock; jsonNumber reads it as double precision. (b) If read() threw synchronously, the async wrapper used to record 'failed'; the new form would not. All 8 read callbacks are arrows over async functions, so this cannot happen today. Use `Promise.resolve().then(read)` only if that guarantee is wanted. (c) A throwing `returned` callback used to fail the request through the catch; the guarded hook only drops the field. All current callbacks are total property reads. (d) Emission order is unchanged: observeCostPromise registers its then-callback before the caller awaits the same promise, so the metric is scheduled before the route continues. Minimal fallback if extending the primitive is unwanted: keep the try/catch and swap Date.now for startCostTimer/elapsedCostTimer. That fixes the clock drift but not the duplicate emission.

<sub>Reported by: area:app-api.</sub>

<a id="p153"></a>

## P153: Serve the three versioned universe-asset routes from one versionedAssetRoute shell parsed with endpoint.params, and teach the route-contract test the shell

- **Status:** [ ] not started
- **Category:** api-route · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** -96 across the three route files, +~30 for the stubs, +~30 for the shell, +~8 in api-contracts.test.ts, -4 in the manifest route; net about -30
- **Depends on:** —
- **Existing primitive:** `src/app/api/sites/[id]/route.ts endpoint.params.safeParse pattern`

**Problem.** systems, adjacency and wormholes each re-implement the same handler: parse the version with the standalone universeAssetVersionParamsSchema, load the asset (even when the parse failed), return 404 asset_version_not_found on a parse failure or version mismatch, otherwise return 200 with the immutable Cache-Control. They and universe/statics parse with standalone schemas although each contract declares `params`; sites/[id] already uses `endpoint.params.safeParse`. The manifest route calls withCacheControl(…, 'no-store') in both branches instead of once.

**Verifier revision.** The three versioned asset route files are byte-identical apart from the endpoint and loader (adjacency, systems and wormholes, all lines 1-32), so the duplication is real. The proposal misses a hard blocker: src/app/api/api-contracts.test.ts requires every v2 route file to call an imported `apiResponse` (or a whitelisted shell such as marketRefreshRoute) with an imported endpoint (classifyV2Route and boundEndpointCalls, lines 188-262). A one-line `export const GET = versionedAssetRoute(adjacencyEndpoint, ...)` scores 0 apiResponseCalls and fails 'is bound to an imported v2 endpoint' unless the classifier learns the new shell, as it did for marketRefreshRoute (SCHEMA_SHELLS at 95, binders at 198-202, marketNames at 227). The endpoint.params switch also orphans two exported schemas, which fallow unused-exports would flag; their exports must be dropped. The generic typing also needs the useLiveDataset-style structural endpoint type rather than a bare generic. Payoff is modest (net about -30 lines) but it centralizes the version-check and immutable-cache policy for three endpoints, and validating before loading fixes an ordering quirk.

**Sites (11).**

- [`src/app/api/universe/assets/[version]/adjacency/route.ts:1-32`](../../src/app/api/universe/assets/[version]/adjacency/route.ts#L1-L32) — copy 1; loads before checking parsed.success (19-21)
- [`src/app/api/universe/assets/[version]/systems/route.ts:1-32`](../../src/app/api/universe/assets/[version]/systems/route.ts#L1-L32) — copy 2, identical shape
- [`src/app/api/universe/assets/[version]/wormholes/route.ts:1-32`](../../src/app/api/universe/assets/[version]/wormholes/route.ts#L1-L32) — copy 3, identical shape
- [`src/data/eve-data/api-contract.ts:116-123, 205-236`](../../src/data/eve-data/api-contract.ts#L116-L123) — universeAssetVersionParamsSchema is exported only for the three routes; each endpoint already declares params plus 200/404('asset_version_not_found')
- [`src/app/api/universe/assets/route.ts:13-34`](../../src/app/api/universe/assets/route.ts#L13-L34) — withCacheControl(..., 'no-store') wraps both the 503 and 200 branches
- [`src/app/api/universe/statics/[systemId]/route.ts:10-23`](../../src/app/api/universe/statics/[systemId]/route.ts#L10-L23) — standalone systemStaticsParamsSchema.safeParse; invalid id returns 200 { statics: [] }
- [`src/data/wh-statics/api-contract.ts:36-52`](../../src/data/wh-statics/api-contract.ts#L36-L52) — systemStaticsParamsSchema exported only for that route; the endpoint declares params
- [`src/app/api/sites/[id]/route.ts:12`](../../src/app/api/sites/[id]/route.ts#L12) — the endpoint.params.safeParse pattern to adopt
- [`src/app/api/api-contracts.test.ts:95-98, 188-262, 448-479`](../../src/app/api/api-contracts.test.ts#L95-L98) — v2 binding classifier and endpoint-to-route association; must learn the new shell
- [`src/app/api/market-refresh-route.ts:1-39`](../../src/app/api/market-refresh-route.ts#L1-L39) — precedent: a route shell in the api zone shared by two route files
- [`src/components/use-live-dataset.ts:35-38`](../../src/components/use-live-dataset.ts#L35-L38) — precedent for typing an endpoint structurally as EndpointContract<null, {200: JsonCodec<T>}> & {method:'GET'}

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/sites/[id]/route.ts:8-32`](../../src/app/api/sites/[id]/route.ts#L8-L32) — different semantics (400 on an invalid id, then 404 on a miss); only its parsing idiom is adopted, not its handler
- [`src/app/api/universe/statics/[systemId]/route.ts:15-17`](../../src/app/api/universe/statics/[systemId]/route.ts#L15-L17) — an invalid param deliberately returns 200 with empty statics; it must not join the asset shell, only switch to endpoint.params

</details>

**Home.** `src/app/api/universe/assets/versioned-asset-route.ts`

**Boundary check.** The file sits under src/app/api/**, so it is in zone api, which is listed before app (app's pattern src/app/** also matches, and its allow list also covers every import below). It imports data (@/data/eve-data/api-contract), lib (@/lib/failure) and transport (@/transport/api-response, @/transport/endpoint types). Rule `from: api` allows transport, data and lib (app's rule allows them too). The three route.ts consumers are in the same api zone, which is always legal, like src/app/api/market-prices/refresh/route.ts importing src/app/api/market-refresh-route.ts. The route files keep importing their endpoint from data and their loader from @/data/eve-data/universe-assets, both data and allowed.

**API sketch.**

```ts
type VersionedAssetEndpoint<TAsset extends { version: string }> = EndpointContract<null, {
  200: JsonCodec<TAsset>;
  404: ProblemCodec<'asset_version_not_found'>;
}> & { method: 'GET'; params: (typeof adjacencyEndpoint)['params'] };

export function versionedAssetRoute<TAsset extends { version: string }>(
  endpoint: VersionedAssetEndpoint<TAsset>,
  load: () => Promise<NoInfer<TAsset>>,
): (request: Request, context: { params: Promise<{ version: string }> }) => Promise<Response>;
// body: parsed = endpoint.params.safeParse(await params); if !success -> apiResponse(endpoint, 404, notFoundFailure('asset_version_not_found'));
// asset = await load(); if asset.version !== parsed.data.version -> same 404;
// return withCacheControl(apiResponse(endpoint, 200, asset), UNIVERSE_ASSET_CACHE_CONTROL)

// route.ts (each)
// authz: public
// input: path
export const GET = versionedAssetRoute(adjacencyEndpoint, getAdjacencyGraph);
```

**Migration steps.**

1. Create src/app/api/universe/assets/versioned-asset-route.ts with the shell above. Validate params before calling load(): today the loader runs even for a malformed version. Both paths still return 404 because the loaders are 'use cache' + cacheLife('max').
2. In src/app/api/api-contracts.test.ts, register the shell like marketRefreshRoute. Add `['versionedAssetRoute', '@/app/api/universe/assets/versioned-asset-route']` handling in classifyV2Route (a `versionedNames` set beside marketNames at 227) and a `[versionedNames, firstArgIdentifier]` binder in boundEndpointCalls (198-202). The endpoint is the first argument.
3. Rewrite adjacency, systems and wormholes route.ts as imports + `// authz: public` + `// input: path` + `export const GET = versionedAssetRoute(<endpoint>, <loader>)`. Both markers must stay (authz-markers.test.ts, api-contracts.test.ts input check), and the endpoint must still be imported from api-contract by name (endpoint-to-route association test).
4. In src/data/eve-data/api-contract.ts, drop `export` from universeAssetVersionParamsSchema (now used only inside the module); otherwise fallow unused-exports fails.
5. Switch src/app/api/universe/statics/[systemId]/route.ts:14 to `systemStaticsEndpoint.params.safeParse(await params)` and drop `export` from systemStaticsParamsSchema in src/data/wh-statics/api-contract.ts:36. Keep the 200-empty behavior on an invalid id.
6. In src/app/api/universe/assets/route.ts, build the 503 or 200 response first and call withCacheControl(response, 'no-store') once.
7. If `apiResponse(endpoint, 200, asset)` does not type-check under the structural endpoint type, fall back to marketRefreshRoute's style: the shell takes `respond(asset) => Response` from each route. Do not cast.
8. Run pnpm check through test-runner.

**Tests.** src/app/api/universe/assets/route.test.ts:75-118 already covers all three routes (200 + immutable Cache-Control, 404 on a stale version) and keeps passing. Add to that it.each: a malformed version (e.g. '' or a 65-char string) returns 404 asset_version_not_found and does not call the loader mock. src/app/api/handler-coverage.test.ts:88-90 imports each GET and keeps working with `export const GET`. src/app/api/api-contracts.test.ts guards the binding once the shell is registered; optionally add a classifier unit case next to 'accepts aliases for both imported v2 bindings'. src/app/api/universe/statics/[systemId]/route.test.ts guards the statics switch.

**Notes.** Behavior to preserve: assets return 404 (never 400) on a malformed version because the contracts declare only 200/404; statics returns 200 { statics: [] } on an invalid id; sites/[id] returns 400 (untouched). The one intended change is validate-before-load, which the shell should make explicit. F389's transport-level parsePathParams stays rejected, since endpoint.params.safeParse is already one call. NoInfer<TAsset> on load keeps TAsset inferred from the endpoint's 200 codec, so the loader's declared asset type (e.g. WormholeCodexAsset vs the zod output with .default([])) only needs to be assignable, as it is today.

<sub>Reported by: area:app-api, concern:request-pipeline.</sub>

<a id="p149"></a>

## P149: Generalise loadSection into readOr(message, load, fallback) for app-zone degrade reads and use it in AtlasBound and jobCharacterIds

- **Status:** [ ] not started
- **Category:** error-handling · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -20/+12
- **Depends on:** —
- **Existing primitive:** `src/app/(site)/admin/load-section.ts:loadSection`

**Problem.** The 'try the read, unstable_rethrow, console.error, return a fallback' pattern exists once as admin's loadSection and is hand-written five more times: three times in AtlasBound plus its checkSession block, and once in industry-characters.jobCharacterIds. loadSection cannot be reused outside admin because its log prefix and sentinel are fixed. AtlasBound also writes the unavailable-chrome fallback object twice (lines 57 and 94).

**Verifier revision.** The concept is the same at every site: await a server read, call unstable_rethrow so Next's redirect, notFound and dynamic bail-out signals escape, log, and return a fallback. That holds for loadSection, the three AtlasBound blocks plus its checkSession block, and jobCharacterIds. There are real consumers outside admin, and they cannot reuse loadSection because it hard-codes the '[admin] <label> section unavailable' message and the Symbol sentinel. No copy has drifted: all six call unstable_rethrow. The value is in encoding that invariant once, so a future degrade-read cannot forget it. Two changes to the proposed design: readOr should take the full log message instead of formatting `[scope] label unavailable`, because the current messages carry suffixes ('; degrading', '; empty seed', '; retry required') that AtlasBound.test.ts asserts; and the fallback should be a plain value, with the scanner cascade written as `?? readOr(...)`. Admin's roughly 40 loadSection call sites stay as they are.

**Sites (7).**

- [`src/app/(site)/admin/load-section.ts:1-16`](../../src/app/%28site%29/admin/load-section.ts#L1-L16) — loadSection with a fixed '[admin] … section unavailable' message and the SECTION_LOAD_FAILED sentinel
- [`src/app/(site)/atlas/AtlasBound.tsx:32-46`](../../src/app/%28site%29/atlas/AtlasBound.tsx#L32-L46) — loadScannerCatalogue: two cascaded degrade blocks, then []
- [`src/app/(site)/atlas/AtlasBound.tsx:48-59`](../../src/app/%28site%29/atlas/AtlasBound.tsx#L48-L59) — loadMapChromeData: degrade to { data: EMPTY_MAP_CHROME, listingAvailable: false }
- [`src/app/(site)/atlas/AtlasBound.tsx:80-86`](../../src/app/%28site%29/atlas/AtlasBound.tsx#L80-L86) — checkSession degrade to null through `let gate`
- [`src/app/(site)/atlas/AtlasBound.tsx:93-95`](../../src/app/%28site%29/atlas/AtlasBound.tsx#L93-L95) — the unavailable-chrome fallback object repeated inline
- [`src/app/(site)/industry/industry-characters.ts:73-82`](../../src/app/%28site%29/industry/industry-characters.ts#L73-L82) — jobCharacterIds degrades to { jobIds: [], corpIds: [] }
- [`src/app/(site)/atlas/AtlasBound.test.ts:180-260`](../../src/app/%28site%29/atlas/AtlasBound.test.ts#L180-L260) — asserts the exact '[map] …' messages and that unstable_rethrow is called and propagates

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/industry/industry-characters.ts:62-70`](../../src/app/%28site%29/industry/industry-characters.ts#L62-L70) — industryCharacters rethrows every error except BetterAuthError when auth is not configured. It is a conditional pass-through, not a degrade.
- [`src/app/(site)/admin/deploy-markers.ts:3-12`](../../src/app/%28site%29/admin/deploy-markers.ts#L3-L12) — A silent catch with no log around a file read, already wrapped by loadSection('admin-signals.releases'). Different intent; leave it.
- `src/app/(site)/admin/*:(about 40 loadSection call sites, e.g. load-signals.ts:30-69, health/HealthCards.tsx:32-82)` — Keep calling loadSection. Only its body changes.

</details>

**Home.** `src/app/(site)/read-or.ts`

**Boundary check.** Every consumer is in the app zone (src/app/(site)/admin, /atlas, /industry), and same-zone imports are allowed. The helper imports only the external package next/navigation. src/lib would also be legal, since lib may import external packages and src/lib/service-auth.ts already imports next/*, but it is not needed until a features or components server module needs it.

**API sketch.**

```ts
export async function readOr<T, F>(message: string, load: () => Promise<T>, fallback: F): Promise<T | F> { try { return await load(); } catch (err) { unstable_rethrow(err); console.error(message, err); return fallback; } }
```

**Migration steps.**

1. Create src/app/(site)/read-or.ts with readOr.
2. Re-express loadSection as `return readOr(`[admin] ${label} section unavailable`, load, SECTION_LOAD_FAILED)`. Keep its explicit return type Promise<T | typeof SECTION_LOAD_FAILED> so the unique-symbol type is not widened (or declare readOr's second type parameter as `const F`).
3. AtlasBound: change loadScannerCatalogue to `(await readOr('[map] scanner site catalogue unavailable; degrading', getScannerSiteIndex, null)) ?? readOr('[map] lightweight site catalogue unavailable; empty seed', getSiteSearchIndex, [])`. Hoist `const UNAVAILABLE_CHROME = { data: EMPTY_MAP_CHROME, listingAvailable: false } as const` and use it in loadMapChromeData's readOr and at line 94. Replace `let gate … try/catch` with `const gate = await readOr('[map] authorization check unavailable', checkSession, null)`.
4. industry-characters: wrap jobCharacterIds' body in readOr('[industry/industry-characters] failed to resolve linked characters', …, { jobIds: [], corpIds: [] }).
5. Remove the unstable_rethrow imports that are no longer used from AtlasBound.tsx and load-section.ts. industry-characters.ts still uses it at line 66.

**Tests.** Add src/app/(site)/read-or.test.ts covering: it returns the value; on error it calls unstable_rethrow, logs the exact message with the error, and returns the fallback; when unstable_rethrow throws (a Next signal) it propagates and does not log. Use vi.mock('next/navigation') as load-section.test.ts does. load-section.test.ts:33, AudienceCard.test.ts:110 and AtlasBound.test.ts:197/224/249 keep guarding the exact messages unchanged. industry-characters.test.ts guards jobCharacterIds.

**Notes.** Keep every log string byte-for-byte; tests assert them and they may be used by log-based alerting. The scanner cascade must still try the lightweight index only after the scanner index fails, and log both failures separately. checkSession's null fallback must keep the existing three-way gate logic: null shows the catalogue with listing unavailable, ok:false shows the guest landing, ok:true shows the canvas. industryCharacters' conditional rethrow at 62-70 is not part of this change.

<sub>Reported by: area:app-site.</sub>

<a id="p068"></a>

## P068: Add isCurrentReadIdentity and sameReadIdentity to platform/auth/read-identity and replace the hand-written staleness guards

- **Status:** [ ] not started
- **Category:** client-data · **Kind:** missing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -5 net (+10 helper lines, 13 expressions shortened, plus 2 test-mock lines)
- **Depends on:** —
- **Existing primitive:** `src/platform/auth/read-identity.ts:currentReadIdentity`

**Problem.** Eleven expressions in five files hand-write 'is this result still for the identity that is signed in now'. They use different polarity and null handling: `identity === null || identity !== currentReadIdentity()`, `identity !== null && identity === currentReadIdentity()`, `identity !== currentReadIdentity()`, and `!cancelled && identity === currentReadIdentity()`. The value-equality test (same userId and characterId) is written twice: in publishReadIdentity and in StructuresManager's server-owner match.

**Sites (8).**

- [`src/platform/auth/read-identity.ts:13-19`](../../src/platform/auth/read-identity.ts#L13-L19) — publishReadIdentity value-equality at L15 (null==null counts as same); currentReadIdentity at L19. Canonical home
- [`src/components/composition/industry-workspace/StructuresManager.tsx:289`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L289) — `identity?.userId === owner.userId && identity.characterId === owner.characterId` (owner non-null)
- [`src/components/composition/industry-workspace/StructuresManager.tsx:325, 353`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L325) — `if (identity === null \|\| identity !== currentReadIdentity()) return;` in onSaved / onCorpSaved
- [`src/features/industry-planner/profiles/use-industry-profiles.ts:74`](../../src/features/industry-planner/profiles/use-industry-profiles.ts#L74) — isCurrent: `identity !== null && identity === currentReadIdentity()`
- [`src/features/industry-planner/profiles/use-industry-profiles.ts:85, 88, 113, 116`](../../src/features/industry-planner/profiles/use-industry-profiles.ts#L85) — negative guards; 88/116 omit the null check because identity is narrowed by 85/113
- [`src/components/remembered-read.ts:32, 34`](../../src/components/remembered-read.ts#L32) — L32 positive form on `owner`; L34 negative guard on the write
- [`src/components/use-live-dataset.ts:57-58, 82`](../../src/components/use-live-dataset.ts#L57-L58) — effect returns early on null at L58; L82 `cancelled \|\| identity !== currentReadIdentity()`
- [`src/features/industry-jobs/use-slots-live.ts:25, 32`](../../src/features/industry-jobs/use-slots-live.ts#L25) — early null return at L25; L32 `!cancelled && identity === currentReadIdentity()`

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/profiles/use-industry-profiles.ts:61, 63`](../../src/features/industry-planner/profiles/use-industry-profiles.ts#L61) — `published.identity === identity` and `busyIdentity === identity` compare against component state, not the live store; a different concept
- [`src/components/use-live-dataset.ts:53`](../../src/components/use-live-dataset.ts#L53) — `failure === identity` is identity-scoped state, not a currency check
- [`src/components/composition/industry-workspace/StructuresManager.tsx:295`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L295) — the React key string `${owner.userId}:${owner.characterId}` has a single site

</details>

**Home.** `src/platform/auth/read-identity.ts`

**Boundary check.** Home zone platform/auth. read-identity.ts already imports only @/lib/client-store, and the rule {from: platform/auth} allows lib. Consumers: src/components/remembered-read.ts and use-live-dataset.ts are in zone components, whose rule allows platform/auth. StructuresManager.tsx is in components-composition, whose rule allows platform/auth. use-industry-profiles.ts and use-slots-live.ts are in features, whose rule allows platform/auth. All of these consumers already import this module.

**API sketch.**

```ts
export function isCurrentReadIdentity(identity: ReadIdentity | null): identity is ReadIdentity { return identity !== null && identity === identityStore.get(); }
export function sameReadIdentity(a: ReadIdentity | null, b: ReadIdentity | null): boolean { return a === b || (a !== null && b !== null && a.userId === b.userId && a.characterId === b.characterId); }
```

**Migration steps.**

1. Add both functions to src/platform/auth/read-identity.ts and rewrite publishReadIdentity L15 as `if (sameReadIdentity(identityStore.get(), identity)) return;`.
2. remembered-read.ts: L32 becomes `isCurrentReadIdentity(owner) ? store.get() : null`; L34 becomes `if (!isCurrentReadIdentity(identity)) return;`.
3. use-live-dataset.ts L82: `if (cancelled || !isCurrentReadIdentity(identity)) return;`. use-slots-live.ts L32: `if (!cancelled && isCurrentReadIdentity(identity)) onResult(result);` (skip this one if useSlotsLive is first moved onto useLiveDataset).
4. use-industry-profiles.ts: L74 `isCurrent: () => isCurrentReadIdentity(identity)`. L85, L88, L113 and L116 all become `if (!isCurrentReadIdentity(identity)) return null|false;`. The helper is correct at 88 and 116 too.
5. StructuresManager.tsx: L289 `const matches = sameReadIdentity(identity, owner);`; L325 and L353 become `if (!isCurrentReadIdentity(identity)) return;`.
6. Update the full-module mocks that would lose the new export: StructuresManager.test.ts L26-29 and use-live-dataset.test.ts L56-59 must add `isCurrentReadIdentity: (i) => i !== null && i === live.identity` (h.identity in the second file). Do not spread the real module there: the real helper reads the real store, not the mocked currentReadIdentity.
7. Once the remaining direct uses are gone, drop currentReadIdentity from imports that no longer need it. Fallow's unused-exports rule will catch any that linger.

**Tests.** Add src/platform/auth/read-identity.test.ts. Cover: isCurrentReadIdentity(null) is false even while the store holds null; it is true only for the very object last published; an object that is value-equal but distinct is false after a different account was published in between. sameReadIdentity: null/null, null/obj, value-equal distinct objects. publishReadIdentity keeps the same object on a value-equal publish. Existing guards: remembered-read.test.ts, use-live-dataset.test.ts, use-slots-live.test.ts, use-industry-profiles.test.ts, use-account-characters.test.ts, StructuresManager.test.ts.

**Notes.** No drift bug: every site that leaves out the null check runs after an earlier null return or a narrowing guard. Keep reference equality for currency. The comment above publishReadIdentity relies on it: a new object marks a new session scope, even on a return to an earlier account. sameReadIdentity is value equality and belongs only where server data (StructuresManager's owner) or a re-publish is compared. Typing isCurrentReadIdentity as a type guard lets later uses of `identity` in the same callback stay narrowed.

<sub>Reported by: area:components-composition.</sub>

<a id="p337"></a>

## P337: Read the EVE SSO client credentials inside eve-sso's token-request builder and drop clientId/clientSecret from the three token inputs

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -20 / +6
- **Depends on:** —
- **Existing primitive:** `src/platform/auth/eve-sso.ts:buildTokenRequestInit`

**Problem.** exchangeCodeForToken, refreshEveToken and revokeEveRefreshToken each take clientId and clientSecret only so that buildTokenRequestInit can build a Basic header. Every production caller threads the same requireEnv pair, so the credential plumbing is spread across auth.ts and eve-token-service.ts instead of living with the SSO client that uses it.

**Verifier revision.** The concept is real. All three production callers read the same requireEnv('EVE_CLIENT_ID'/'EVE_CLIENT_SECRET') pair (auth.ts:137-138, eve-token-service.ts:198-199 and 230-231), and no caller passes different credentials. They are a private concern of the SSO client. Two design changes. (1) Drop the proposed optional-with-default fields: they create two ways to supply credentials, and tests can use vi.stubEnv, which eve-token-service.test.ts:61-62 already does. (2) The read must stay outside each function's own error handling. In refreshEveToken, buildTokenRequestInit is called inside the fetch try (150-154), so a naive move would turn a missing env var into a 'retryable/connection' result instead of a throw. Payoff is low.

**Sites (7).**

- [`src/platform/auth/eve-sso.ts:52-68`](../../src/platform/auth/eve-sso.ts#L52-L68) — buildTokenRequestInit(body, clientId, clientSecret)
- [`src/platform/auth/eve-sso.ts:70-104`](../../src/platform/auth/eve-sso.ts#L70-L104) — ExchangeCodeInput and exchangeCodeForToken (no try around the request)
- [`src/platform/auth/eve-sso.ts:106-110, 139-187`](../../src/platform/auth/eve-sso.ts#L106-L110) — RefreshTokenInput; the request init is built inside the fetch try at 150-154
- [`src/platform/auth/eve-sso.ts:189-227`](../../src/platform/auth/eve-sso.ts#L189-L227) — RevokeTokenInput; revoke is documented as never throwing, and the init is built inside its try at 218-222
- [`src/platform/auth/auth.ts:120-139`](../../src/platform/auth/auth.ts#L120-L139) — Load-tolerant readEnv ?? '' for the genericOAuth config at 124-125 (stays); requireEnv pair for the exchange at 137-138
- [`src/platform/auth/eve-token-service.ts:193-205`](../../src/platform/auth/eve-token-service.ts#L193-L205) — revokeStoredCharacterToken reads the requireEnv pair inside its own try, so a missing env var is logged via console.error
- [`src/platform/auth/eve-token-service.ts:228-232`](../../src/platform/auth/eve-token-service.ts#L228-L232) — requireEnv pair read before refreshEveToken, so a missing env var throws (it is not counted as a retryable failure)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/auth/auth.ts:124-125`](../../src/platform/auth/auth.ts#L124-L125) — The genericOAuth plugin config needs load-time values and tolerates missing env (readEnv ?? ''). It must not switch to requireEnv
- [`src/composition/__tests__/vendor-resilience-registry.ts:63`](../../src/composition/__tests__/vendor-resilience-registry.ts#L63) — Refers to exchangeCodeForToken by symbol name only; the signature change does not affect it

</details>

**Home.** `src/platform/auth/eve-sso.ts (existing buildTokenRequestInit)`

**Boundary check.** eve-sso.ts is in platform/auth. Its new import of requireEnv from @/lib/env is legal: the platform/auth rule allows lib, and eve-token-service.ts already imports the same module. Every consumer (auth.ts, eve-token-service.ts) is in platform/auth, and the module is already 'server-only'.

**API sketch.**

```ts
function buildTokenRequestInit(body: URLSearchParams): RequestInit // reads requireEnv('EVE_CLIENT_ID'), requireEnv('EVE_CLIENT_SECRET')
export interface ExchangeCodeInput { code: string; codeVerifier: string }
export interface RefreshTokenInput { refreshToken: string }
export interface RevokeTokenInput { refreshToken: string }
```

**Migration steps.**

1. In eve-sso.ts, make buildTokenRequestInit(body) read the credentials via requireEnv (import from '@/lib/env').
2. In refreshEveToken, build `const init = buildTokenRequestInit(body)` before the try at line 150, so a missing env var still throws rather than returning a retryable 'connection' result.
3. In revokeEveRefreshToken, either build init inside the try, which keeps the documented never-throws contract but makes a missing env var a silent {ok:false}, or build it before the try, which keeps today's console.error in revokeStoredCharacterToken but contradicts the doc comment. Pick one and update the doc comment to match. The recommended choice is before the try, since today the env failure is logged.
4. Remove clientId and clientSecret from the three input interfaces and destructurings.
5. Delete the requireEnv pairs at auth.ts:137-138, eve-token-service.ts:198-199 and 230-231. Remove eve-token-service's requireEnv import if nothing else uses it (check first).

**Tests.** src/platform/auth/eve-sso.test.ts: replace the credential fields in the inputs (125-130, 146-151, 165-170, input objects at 186-190 and 316-320) with vi.stubEnv('EVE_CLIENT_ID'/'EVE_CLIENT_SECRET') in beforeEach. The Basic-header assertion at 335-336 must still pass. Add one case: refreshEveToken rejects, rather than returning retryable, when EVE_CLIENT_ID is unset. Update the toHaveBeenCalledWith assertions to `{ refreshToken }` in src/platform/auth/eve-token-service.test.ts:139-143 and src/platform/auth/eve-token-service.revoke.test.ts:52-56. The '@/lib/env' mock in the revoke test (26-29) may become unneeded. Keep the never-throws test at revoke.test.ts:68-73.

**Notes.** Behavior to preserve: (a) a missing credential during refresh throws out of getFreshAccessTokenForCharacter today and must not become kind:'retryable' (that would record a backoff against the character's row); (b) revokeStoredCharacterToken must still never throw; (c) the genericOAuth config keeps readEnv ?? ''. No drift exists between the three call sites today.

<sub>Reported by: gap:env-and-runtime-config-access.</sub>

<a id="p222"></a>

## P222: Reuse the eve-account-shared predicates, import EVE_PROVIDER_ID only from @/lib/eve-provider, and add signInWithEve beside startCharacterLink

- **Status:** [ ] not started
- **Category:** persistence · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -30 / +20
- **Depends on:** [P067](wave-08-charts-images-and-board-workspace-adoption.md#p067)
- **Existing primitive:** `src/platform/auth/eve-account-shared.ts:eveAccountsForUser,accountMatch; src/lib/eve-provider.ts:EVE_PROVIDER_ID`

**Problem.** eve-account-shared exports eveAccountsForUser and accountMatch, but authorization-store (ownerCondition), eve-token-service and synthetic-pilot-store write them out again. The 'user owns this character' composite is written five ways: purge.characterLink, linked-characters.accountBelongsToUser, admin-users unlink, admin-users reassign (fully inline), and deletion-jobs (eveAccountsForUser plus accountMatch, which tests providerId twice). admin-users joins characters with `character_id::text = account_id` instead of characterProfileJoin. EVE_PROVIDER_ID is reached through @/lib/eve-provider, through ./eve-sso-constants, and through ./eve-sso, which is server-only; 'eve' is hard-coded in four client and auth call sites, in telemetry SQL, and in a script. The three signIn.oauth2 calls and the one oauth2.link call each pass providerId by hand. Three of the four discard the promise with `void`, so a network failure surfaces as an unhandled rejection.

**Verifier revision.** The duplicates are real, but the finding overcounts some and misses others. The 'user owns this character' composite appears at 5 sites (7 occurrences), not 6. synthetic-pilot-store is accountMatch plus ne(userId), a different predicate, though it can still reuse accountMatch. The double providerId in deletion-jobs is redundant but harmless. The admin-users ::text join is confirmed; it is equivalent for EVE ids but cannot use the characters PK the way characterProfileJoin can. EVE_PROVIDER_ID really is imported through three paths, and the './eve-sso' path drags in a 'server-only' module with jose just to get a constant. The unhandled-rejection claim holds: better-fetch awaits fetch() outside any try unless catchAllError is set (node_modules/.pnpm/@better-fetch+fetch@1.3.1/.../dist/index.js:504-518, 628), and better-auth never sets it. It applies to LoginButton, PlannerRail and also startCharacterLink, which the finding missed. Missed sites added: account-token-encryption, owner-hash-claim, the unlink route, and the scripts/backfill-users-if-empty raw-SQL literals.

**Sites (22).**

- [`src/platform/auth/eve-account-shared.ts:1-15`](../../src/platform/auth/eve-account-shared.ts#L1-L15) — characterProfileJoin, eveAccountsForUser and accountMatch; imports EVE_PROVIDER_ID from './eve-sso'
- [`src/platform/auth/authorization-store.ts:1-9`](../../src/platform/auth/authorization-store.ts#L1-L9) — ownerCondition duplicates eveAccountsForUser (used at 13, 23, 39, 45)
- [`src/platform/auth/eve-token-service.ts:7-12, 42-60`](../../src/platform/auth/eve-token-service.ts#L7-L12) — imports EVE_PROVIDER_ID from ./eve-sso; inline accountMatch at 56-58
- [`src/platform/auth/admin-users.ts:125-147`](../../src/platform/auth/admin-users.ts#L125-L147) — EXISTS joins linkedCharacter.characterId::text = linkedAccount.accountId (line 139) instead of the characterProfileJoin shape
- [`src/platform/auth/admin-users.ts:184-187`](../../src/platform/auth/admin-users.ts#L184-L187) — and(eveAccountsForUser(userId), eq(account.accountId, String(characterId)))
- [`src/platform/auth/admin-users.ts:237-247`](../../src/platform/auth/admin-users.ts#L237-L247) — fully inline providerId + accountId + userId
- [`src/platform/auth/purge.ts:8-10, 56`](../../src/platform/auth/purge.ts#L8-L10) — local characterLink(userId, characterId): the composite to promote
- [`src/platform/auth/linked-characters.ts:184-191`](../../src/platform/auth/linked-characters.ts#L184-L191) — accountBelongsToUser: same composite inline
- [`src/platform/auth/deletion-jobs.ts:80-83, 111-114`](../../src/platform/auth/deletion-jobs.ts#L80-L83) — and(eveAccountsForUser, accountMatch) tests providerId twice
- [`src/composition/synthetic-pilot-store.ts:66-74`](../../src/composition/synthetic-pilot-store.ts#L66-L74) — inline accountMatch plus ne(account.userId, ...)
- [`src/platform/auth/link-character.ts:1-9`](../../src/platform/auth/link-character.ts#L1-L9) — startCharacterLink: providerId 'eve' literal and void without catch
- [`src/components/composition/account/LoginButton.tsx:33-37`](../../src/components/composition/account/LoginButton.tsx#L33-L37) — void authClient.signIn.oauth2({ providerId: 'eve', callbackURL }), no catch
- [`src/features/industry-planner/components/PlannerRail.tsx:114-123`](../../src/features/industry-planner/components/PlannerRail.tsx#L114-L123) — same, no catch
- [`src/composition/search/commands-source.ts:90-100`](../../src/composition/search/commands-source.ts#L90-L100) — same, with an empty .catch
- [`src/data/telemetry/queries.ts:359-363`](../../src/data/telemetry/queries.ts#L359-L363) — eq(account.providerId, 'eve') literal in the data zone
- [`src/platform/auth/eve-sso.ts:17-24`](../../src/platform/auth/eve-sso.ts#L17-L24) — re-exports EVE_PROVIDER_ID from a server-only module
- [`src/platform/auth/eve-sso-constants.ts:1`](../../src/platform/auth/eve-sso-constants.ts#L1) — second re-export of EVE_PROVIDER_ID
- [`src/lib/eve-provider.ts:1-2`](../../src/lib/eve-provider.ts#L1-L2) — canonical EVE_PROVIDER_ID
- [`src/platform/auth/owner-hash-claim.ts:1, 24`](../../src/platform/auth/owner-hash-claim.ts#L1) — missed: imports via eve-sso-constants
- [`src/app/api/account/characters/unlink/route.ts:11, 64`](../../src/app/api/account/characters/unlink/route.ts#L11) — missed: imports via @/platform/auth/eve-sso-constants
- [`src/platform/auth/account-token-encryption.ts:1-2`](../../src/platform/auth/account-token-encryption.ts#L1-L2) — missed: imports via ./eve-sso
- [`src/scripts/backfill-users-if-empty.ts:34-36, 48-51`](../../src/scripts/backfill-users-if-empty.ts#L34-L36) — missed: provider_id = 'eve' literals in raw SQL

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/auth/affiliation-store.ts:74, 91, 109`](../../src/platform/auth/affiliation-store.ts#L74) — provider-only filters with no user or character; a predicate here would add churn without saving anything
- [`src/platform/auth/linked-characters.ts:130`](../../src/platform/auth/linked-characters.ts#L130) — provider-only filter
- [`src/platform/auth/admin-users.ts:48-58`](../../src/platform/auth/admin-users.ts#L48-L58) — oldestEveAccountJoin is a different concept (oldest linked account per user)
- [`src/data/maps/queries.ts:613-630`](../../src/data/maps/queries.ts#L613-L630) — IN-subquery over characters.characterId::text; different shape, and data cannot import platform/auth
- [`src/components/eve-image.tsx:17`](../../src/components/eve-image.tsx#L17) — source: 'eve' is an image-source discriminator, not the provider id
- [`src/db/__tests__/support/db-test-harness.ts:140`](../../src/db/__tests__/support/db-test-harness.ts#L140) — test fixture

</details>

**Home.** `src/platform/auth/eve-account-shared.ts (predicates); src/platform/auth/link-character.ts (signInWithEve); src/lib/eve-provider.ts (sole EVE_PROVIDER_ID source)`

**Boundary check.** eve-account-shared and link-character are in platform/auth. Rule platform/auth -> [..., db, lib, config] permits @/db/auth-schema and @/lib/eve-provider. Consumers of the predicates: platform/auth modules (same zone), and composition/synthetic-pilot-store, where composition allows platform/auth. Consumers of signInWithEve: LoginButton (components-composition allows platform/auth), PlannerRail (features allows platform/auth), commands-source (composition allows platform/auth). EVE_PROVIDER_ID from @/lib/eve-provider: platform/auth, data (telemetry), api (unlink route), scripts (backfill), and client components all allow lib. data/telemetry cannot import platform/auth, so it only swaps the literal for the constant.

**API sketch.**

```ts
// eve-account-shared.ts
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
export function userAccountMatch(userId: string, characterId: number): SQL | undefined {
  return and(eq(account.userId, userId), accountMatch(characterId));
}
export function characterProfileJoinOn(accountId: AnyPgColumn, characterId: AnyPgColumn): SQL {
  return sql`${characterId} = CASE WHEN ${accountId} ~ '^[0-9]+$' THEN ${accountId}::bigint END`;
}
export const characterProfileJoin = characterProfileJoinOn(account.accountId, characters.characterId);

// link-character.ts
export function signInWithEve(callbackURL = '/'): void;
export function startCharacterLink(callbackURL = '/settings/characters'): void; // both use EVE_PROVIDER_ID and catch
```

**Migration steps.**

1. Switch every EVE_PROVIDER_ID import to '@/lib/eve-provider'. That covers eve-account-shared, authorization-store, affiliation-store, linked-characters, admin-users, account-token-encryption (and its test), eve-token-service, owner-hash-claim, and api/account/characters/unlink/route.ts. Then remove EVE_PROVIDER_ID from the eve-sso.ts re-export list (line 20) and delete the line 1 re-export in eve-sso-constants.ts. Drop EVE_PROVIDER_ID from the vi.mock('./eve-sso') factory in eve-token-service.revoke.test.ts.
2. Add userAccountMatch to eve-account-shared.ts. Replace purge.characterLink (delete the local function), linked-characters:188, admin-users:186, admin-users:241-245 (userAccountMatch(fromUserId, characterId)), and the three deletion-jobs composites at 81, 83 and 112.
3. Delete authorization-store.ownerCondition and use eveAccountsForUser. Replace the inline match in eve-token-service:57 with accountMatch(characterId), and synthetic-pilot-store:68-72 with and(accountMatch(SYNTHETIC_PILOT.characterId), ne(account.userId, ...)).
4. Add characterProfileJoinOn and redefine characterProfileJoin through it. In admin-users:139, write .innerJoin(linkedCharacter, characterProfileJoinOn(linkedAccount.accountId, linkedCharacter.characterId)).
5. Add signInWithEve(callbackURL) to link-character.ts using EVE_PROVIDER_ID and one shared .catch. Make startCharacterLink use the constant and the same catch. Replace the inline calls in LoginButton:36, PlannerRail:119 and commands-source:97.
6. Replace 'eve' in data/telemetry/queries.ts:361 with EVE_PROVIDER_ID, and interpolate ${EVE_PROVIDER_ID} into the backfill-users-if-empty SQL at 35 and 50 as a bound parameter.

**Tests.** Extend src/platform/auth/eve-account-shared.test.ts: render userAccountMatch and characterProfileJoinOn with PgDialect.sqlToQuery and assert the SQL and params, including the aliased form. Existing guards: linked-characters.db.test.ts, authorization-store.db.test.ts, admin-users.db.test.ts and admin-users.reassign.test.ts, deletion-jobs tests, account-token-encryption.test.ts, eve-token-service tests, and commands-source.test.ts. Add a small link-character test that mocks authClient to reject, then asserts signInWithEve and startCharacterLink pass the 'eve' provider id and do not leak the rejection.

**Notes.** None of the predicate changes alters behavior. Dropping the duplicated providerId condition in deletion-jobs does not change which rows match. characterProfileJoin's CASE form and the ::text form agree for every EVE id (plain digits, no leading zeros). The CASE form also lets the planner probe the characters PK inside the admin search EXISTS. On error handling, commands-source currently swallows sign-in failures silently. Pick one behavior for both helpers (silent, or console.error) and apply it in both, so startCharacterLink's six callers get the fix too.

<sub>Reported by: area:platform.</sub>

<a id="p257"></a>

## P257: Route linked-account-to-characterId conversions through parseLinkedAccountId and one ids helper

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -25 / +15
- **Depends on:** [P222](#p222)
- **Existing primitive:** `src/platform/auth/eve-account-shared.ts:parseLinkedAccountId`

**Problem.** parseLinkedAccountId (digits only, safe integer) is the canonical parser. Six conversions bypass it with Number(...) and sometimes isFinite:
- account-purge repairUserIdentity, which can mint 'NaN@eve.invalid'
- the account-purge projection-restore loop
- the account.create.after hook (where '' becomes character 0)
- toAdminUser
- the merge movedCharacterIds list
- tracking-merge-retry

Six sites copy the 'rows → parseLinkedAccountId → drop null' flatMap by hand.

**Verifier revision.** Confirmed that 6 conversions in 5 files use Number(accountId), some guarded by Number.isFinite, instead of the canonical parseLinkedAccountId. 6 sites in platform/auth repeat the same 'parse, then drop null' flatMap.

The impact is overstated. Every EVE account row's accountId is minted as `String(character.characterId)` from a verified JWT (auth.ts:171), so '', ' 12 ' and '1e3' never occur in production. The finding is about consistency with the documented invariant, which characterProfileJoin's regex and linked-characters.db.test.ts:174 also encode, not a live bug.

Scope changes:
- purge.ts:103-106 also filters requestedAt, so it does not fit the helper.
- The composition account-purge deliberately throws on malformed ids (account-purge.ts:33), so 'drop malformed' is not universal and that site must stay.
- repairUserIdentity needs an explicit choice when the oldest remaining row is malformed. Today it would write 'NaN@eve.invalid'.

**Sites (10).**

- [`src/platform/auth/eve-account-shared.ts:17-23`](../../src/platform/auth/eve-account-shared.ts#L17-L23) — canonical parseLinkedAccountId; the home for the new helpers
- [`src/platform/auth/account-purge.ts:20-35, 44-58`](../../src/platform/auth/account-purge.ts#L20-L35) — Number(replacementAccountId) at :29 inside syntheticEmail; Number(link.accountId) at :56
- [`src/platform/auth/auth.ts:68-73`](../../src/platform/auth/auth.ts#L68-L73) — Number plus isFinite in account.create.after
- [`src/platform/auth/admin-users.ts:31-46`](../../src/platform/auth/admin-users.ts#L31-L46) — toAdminUser uses Number plus isFinite
- [`src/composition/account-lifecycle/account-merge.ts:75-79`](../../src/composition/account-lifecycle/account-merge.ts#L75-L79) — movedCharacterIds via map(Number).filter(isFinite)
- [`src/composition/account-lifecycle/tracking-merge-retry.ts:30-33`](../../src/composition/account-lifecycle/tracking-merge-retry.ts#L30-L33) — new Set(linked.map(row => Number(row.accountId)))
- [`src/platform/auth/linked-characters.ts:119-122, 156-161`](../../src/platform/auth/linked-characters.ts#L119-L122) — flatMap parse/map copies
- [`src/platform/auth/affiliation-store.ts:77-80, 98-101, 110-113`](../../src/platform/auth/affiliation-store.ts#L77-L80) — one mapping copy and two ids-only copies
- [`src/platform/auth/deletion-jobs.ts:27-32`](../../src/platform/auth/deletion-jobs.ts#L27-L32) — ids-only copy in insertJob
- [`src/platform/auth/auth.ts:170-176`](../../src/platform/auth/auth.ts#L170-L176) — getUserInfo mints accountId = String(characterId), so production ids are canonical

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/auth/purge.ts:103-106`](../../src/platform/auth/purge.ts#L103-L106) — loop that also requires requestedAt !== null; the helper would not simplify it
- [`src/composition/account-lifecycle/account-purge.ts:18-24, 33`](../../src/composition/account-lifecycle/account-purge.ts#L18-L24) — already uses parseLinkedAccountId and throws on malformed ids on purpose; must not switch to silently dropping them
- [`src/platform/auth/linked-characters.ts:200-214`](../../src/platform/auth/linked-characters.ts#L200-L214) — single-row parse in repointActiveToOldest; already canonical

</details>

**Home.** `src/platform/auth/eve-account-shared.ts`

**Boundary check.** - The home is in platform/auth.
- Internal platform/auth callers import within their own zone.
- composition/account-lifecycle/account-merge.ts and tracking-merge-retry.ts may import platform/auth (rule composition→[...,platform/auth,...]), and both already import eve-account-shared.
- The helper imports nothing new.

**API sketch.**

```ts
// src/platform/auth/eve-account-shared.ts
export function linkedCharacterIds(rows: readonly { accountId: string }[]): number[]; // order-preserving, malformed dropped
export function mapLinkedRows<R extends { accountId: string }, T>(
  rows: readonly R[],
  toValue: (characterId: number, row: R) => T,
): T[];
```

**Migration steps.**

1. Add linkedCharacterIds and mapLinkedRows to eve-account-shared.ts. Extend eve-account-shared.test.ts: preserves order; drops '', ' 12 ', '1e3', 'not-a-number' and unsafe integers.
2. Ids-only sites: affiliation-store.ts:98-101 and :110-113, deletion-jobs.ts:29-32, account-merge.ts:75-79 (`linkedCharacterIds(await tx.select(...))`), tracking-merge-retry.ts:32 (`new Set(linkedCharacterIds(linked))`), and account-purge.ts:55-57 (`for (const characterId of linkedCharacterIds(remaining))`).
3. Mapping sites: linked-characters.ts:119-122 (mapLinkedRows(rows, toLinkedCharacter)), linked-characters.ts:156-161, and affiliation-store.ts:77-80.
4. Single-value sites:
- auth.ts:70-71: `const characterId = parseLinkedAccountId(acct.accountId); if (characterId === null) return;`
- admin-users.ts toAdminUser: `characterId: row.characterId == null ? null : parseLinkedAccountId(row.characterId)`.
5. account-purge.ts reconcileAfterCharacterRemoval:
- Keep the emptiness test on the raw rows. Any EVE row blocks user deletion, matching deleteUserIfUnlinked.
- Pass `linkedCharacterIds(remaining)[0] ?? null` to repairUserIdentity.
- Change repairUserIdentity to take `replacementCharacterId: number | null` and skip the email rewrite when it is null.
6. Leave purge.ts and the composition account-purge as they are.

**Tests.** Add: helper cases in eve-account-shared.test.ts, and an account-purge.test.ts case where the oldest remaining accountId is malformed, asserting no 'NaN@eve.invalid' write.

Guards:
- admin-users.test.ts:39 ('not-a-number' gives null)
- linked-characters.db.test.ts:174 (drops a non-numeric id)
- affiliation-store.db.test.ts:127-130
- account-merge.test.ts and account-merge.db.test.ts
- tracking-merge-retry.db.test.ts
- account-purge.test.ts
- the deletion-jobs tests

**Notes.** Production data is canonical (auth.ts:171), so behaviour on real rows is unchanged. Only malformed rows change: they are dropped instead of being coerced ('' to 0, ' 12 ' to 12) or kept as NaN.

The correct copy is parseLinkedAccountId, which matches characterProfileJoin's `~ '^[0-9]+$'`.

repairUserIdentity: skipping the email rewrite when no parseable replacement exists is safer than writing 'NaN@eve.invalid'. user.email is UNIQUE, so two such users would collide.

The composition deletion path's throw on malformed ids is intentional (a purge must not silently skip a link) and stays.

<sub>Reported by: area:platform.</sub>

<a id="p176"></a>

## P176: Resolve every guard through getFullSession, reuse the get-session response for the background check, and coalesce the opportunistic affiliation drain

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** efficiency · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** medium · **Size:** about -15/+35 in source; +60 test lines
- **Depends on:** [P287](wave-01-quick-wins-delete-dead-code-fix-small.md#p287), [P167](#p167)
- **Existing primitive:** `src/composition/session.ts:getFullSession; src/platform/auth/authorization-store.ts:claimAuthorization`

**Problem.** Whether a request schedules the per-user authorization check depends on which guard it uses, because checkSession and checkAdmin bypass getFullSession. The /api/auth/get-session hook pays for a second full session resolution, including the customSession DB query, just to learn a user id the response already carries. Every visit with no authorization work, and every map chrome load, runs two global outbox reads. When the outbox has rows, concurrent requests project the same maps. corp-sharing reads the session twice because checkUserId returns only userId.

**Verifier revision.** Confirmed:
(1) route-guards resolves the session two ways. checkSession and checkAdmin call auth.api.getSession directly (18-32), while checkUserId and requireAdminPage go through getFullSession (48-62). The 6 checkSession consumers, 2 checkAdmin routes and 4 adminMutationGate routes therefore never schedule the authorization check, and AtlasBound (a Server Component) loses getFullSession's per-render cache. CustomStructuresContent.tsx:10-11 is another bypass the finders missed.
(2) The get-session handler's after() runs a second auth.api.getSession (route.ts:16-19) only to recover user.id. That re-runs customSession's resolveActiveCharacter query (auth.ts:202-205, linked-characters.ts:141-154) on every client session fetch (AuthProvider useSession).
(3) A visit with no authorization work still runs the global drain (character-authorization.ts:30-33 → readPendingTrackingMerges plus readPendingMapAccessChanges), and listMapChromeData schedules the same drain (map-access.ts:47-49). An atlas visit after step 3 would therefore drain twice.
Changes from the proposal:
(a) Do not widen checkUserId's result across 23 consumers for one route. corp-sharing should authorize with checkSession and read gate.session.characterId.
(b) Throttle the opportunistic global drain with a single-flight and minimum interval, local to map-affiliation-access.ts, rather than a per-user throttleByKey in src/lib. The throttle has one module owner, and AGENTS.md wants a second consumer before a lib primitive. Post-enqueue drains must stay unthrottled: character-authorization.ts:22, corp-access.ts:16, map-affiliation-access.ts:26 and :64 must see rows they just queued.
(c) Demote the outbox lease to optional. acknowledgeMapAccessChanges is version-guarded, projections are idempotent, the table is bounded at one row per map and is usually empty, and a lease needs a schema migration.
(d) Exclude industry-characters.ts. It runs inside 'use cache: private', where scheduling after() through getFullSession is inappropriate.

**Sites (18).**

- [`src/composition/route-guards.ts:18-32`](../../src/composition/route-guards.ts#L18-L32) — checkSession and checkAdmin call auth.api.getSession directly
- [`src/composition/route-guards.ts:48-62`](../../src/composition/route-guards.ts#L48-L62) — checkUserId (via getCurrentUserId) and requireAdminPage use getFullSession
- [`src/composition/session.ts:9-14`](../../src/composition/session.ts#L9-L14) — getFullSession = cache(getSession plus after(checkUserCharacterAuthorizations))
- [`src/composition/session.ts:27-35`](../../src/composition/session.ts#L27-L35) — getSessionCharacterId and getCurrentUserId each call getFullSession
- [`src/app/api/auth/[...all]/route.ts:13-20`](../../src/app/api/auth/[...all]/route.ts#L13-L20) — after() repeats auth.api.getSession({ headers: request.headers }) to get user.id
- [`src/platform/auth/auth.ts:202-205`](../../src/platform/auth/auth.ts#L202-L205) — customSession runs resolveActiveCharacter on every getSession, including cookie-cache hits
- [`src/platform/auth/linked-characters.ts:141-154`](../../src/platform/auth/linked-characters.ts#L141-L154) — resolveActiveCharacter is a DB join query
- [`src/platform/auth/components/AuthProvider.tsx:17`](../../src/platform/auth/components/AuthProvider.tsx#L17) — authClient.useSession drives repeated get-session fetches
- [`src/composition/character-authorization.ts:29-33`](../../src/composition/character-authorization.ts#L29-L33) — the no-work branch still runs the global reconcileAffiliationAccess
- [`src/composition/character-authorization.ts:14-23, 54-60`](../../src/composition/character-authorization.ts#L14-L23) — publishAccessChanges drains after enqueuing, so it must stay unthrottled; cache() wrapper
- [`src/composition/map-affiliation-access.ts:16-19, 33-60`](../../src/composition/map-affiliation-access.ts#L16-L19) — global drain: reconcileTrackingMerges, then readPendingMapAccessChanges, projections and acknowledgement
- [`src/composition/map-access.ts:47-49`](../../src/composition/map-access.ts#L47-L49) — listMapChromeData schedules after(reconcileAffiliationAccess) on every chrome load; missed by the finders
- [`src/app/(site)/atlas/AtlasBound.tsx:79-95`](../../src/app/%28site%29/atlas/AtlasBound.tsx#L79-L95) — checkSession plus listMapChromeData in one render; would drain twice once guards use getFullSession
- [`src/app/(site)/industry/CustomStructuresContent.tsx:10-11`](../../src/app/%28site%29/industry/CustomStructuresContent.tsx#L10-L11) — Server Component calling auth.api.getSession directly, bypassing getFullSession; missed by the finders
- [`src/platform/auth/affiliation-store.ts:192-203`](../../src/platform/auth/affiliation-store.ts#L192-L203) — readPendingMapAccessChanges is a plain select with no claim
- [`src/data/location-tracking/merge-store.ts:22-27`](../../src/data/location-tracking/merge-store.ts#L22-L27) — global readPendingTrackingMerges, limit 10
- [`src/platform/auth/authorization-store.ts:29-35`](../../src/platform/auth/authorization-store.ts#L29-L35) — claimAuthorization lease pattern, the model for an optional outbox lease
- [`src/app/api/account/corp-sharing/route.ts:12-26`](../../src/app/api/account/corp-sharing/route.ts#L12-L26) — checkUserId, then getSessionCharacterId: two session resolutions

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/industry/industry-characters.ts:48-51`](../../src/app/%28site%29/industry/industry-characters.ts#L48-L51) — Runs inside 'use cache: private' (browser-cached), so it must not schedule after() through getFullSession. Keep the direct getSession.
- [`src/composition/corp-access.ts:16`](../../src/composition/corp-access.ts#L16) — Post-enqueue drain after accessChanged. It must observe the rows just queued, so it stays on the unthrottled reconcileAffiliationAccess.
- [`src/composition/map-affiliation-access.ts:21-31, 62-65`](../../src/composition/map-affiliation-access.ts#L21-L31) — deliverCapturedMapAccessChanges overflow and refreshAffiliationsAndReconcile are post-enqueue and stay unthrottled
- [`src/composition/account-lifecycle/tracking-merge-retry.ts:17-60`](../../src/composition/account-lifecycle/tracking-merge-retry.ts#L17-L60) — Concurrent merge drains are already serialized by FOR UPDATE on the user and the job, with a re-check of the job row. No lease is needed.

</details>

**Home.** `src/composition/session.ts (getFullSession, export names unchanged); src/composition/route-guards.ts; src/composition/map-affiliation-access.ts (new reconcileAffiliationAccessOnVisit); src/app/api/auth/[...all]/route.ts`

**Boundary check.** All new and changed shared code is in the composition zone. route-guards → session and character-authorization/map-access → map-affiliation-access are imports inside the zone. map-affiliation-access already imports data/maps and platform/auth, which {from: composition} allows ('data', 'platform/auth'). Consumers:
- AtlasBound.tsx and CustomStructuresContent.tsx are in the app zone; {from: app} allows 'composition'.
- The get-session route, corp-sharing and the account and admin routes are in the api zone; {from: api} allows 'composition'.
- The get-session route also uses zod, a package rather than a zone.
No new src/lib export is added, so the lib rule ({allow: [config]}) is not touched.

**API sketch.**

```ts
// map-affiliation-access.ts
const VISIT_DRAIN_INTERVAL_MS = 15_000;
let visitDrain: { startedAt: number; run: Promise<{ processed: number; failed: number }> } | null = null;
/** Opportunistic, per-instance coalesced drain for page/session visits; post-enqueue callers keep reconcileAffiliationAccess(). */
export function reconcileAffiliationAccessOnVisit(now?: number): Promise<{ processed: number; failed: number }>;

// route-guards.ts (signatures unchanged)
export async function checkSession(): Promise<SessionCheckResult>; // const session = await getFullSession()
export async function checkAdmin(): Promise<SessionCheckResult>;   // const session = await getFullSession()

// app/api/auth/[...all]/route.ts
const sessionUserSchema = z.object({ user: z.object({ id: z.string().min(1) }) }).nullable();
// const body = response.clone(); after(async () => { const parsed = sessionUserSchema.safeParse(await body.json().catch(() => null)); if (parsed.success && parsed.data) await checkUserCharacterAuthorizations(parsed.data.user.id); });
```

**Migration steps.**

1. Add reconcileAffiliationAccessOnVisit to map-affiliation-access.ts. If a drain started less than VISIT_DRAIN_INTERVAL_MS ago, return its promise. Otherwise start reconcileAffiliationAccess() and record { startedAt, run }. If it rejects, clear the record so the next visit retries.
2. Switch only the opportunistic callers to it: character-authorization.ts:31 (the no-work branch) and map-access.ts:49 (`after(reconcileAffiliationAccessOnVisit)`). Leave publishAccessChanges (character-authorization.ts:22), corp-access.ts:16, deliverCapturedMapAccessChanges (map-affiliation-access.ts:26) and refreshAffiliationsAndReconcile (64) on reconcileAffiliationAccess.
3. In the get-session GET handler, take `const body = response.clone()` before returning, and in after() parse it with sessionUserSchema instead of calling auth.api.getSession. Skip the check when the body is null, unparseable or the response is not ok. Return the original response object unchanged.
4. Make checkSession and checkAdmin use getFullSession(). Keep the BetterAuthSession type and the failure mapping: unauthenticated for checkSession, forbidden for checkAdmin. Switch CustomStructuresContent.tsx to getFullSession(). Do this only after the drain throttle in the first two steps has landed, so the 12 newly scheduling consumers do not multiply global drains.
5. Change corp-sharing to `authorize: checkSession` and `handle: async ({ session }, body) => ... directorGate(session.user.id, ...) ... setCorpSharing(corporationId, enabled, session.characterId)`, then drop the getSessionCharacterId import. Leave checkUserId's shape alone.
6. Optional, only if telemetry shows concurrent duplicate projections: add a claimed_until column to map_access_changes. readPendingMapAccessChanges becomes an UPDATE ... WHERE claimed_until IS NULL OR claimed_until < now() ... RETURNING claim modeled on claimAuthorization, with the existing version-guarded acknowledgement. This needs a migration plus table-growth and data-ownership registry review.

**Tests.** Tests to add:
- map-affiliation-access.test.ts: two concurrent reconcileAffiliationAccessOnVisit calls run one readPendingMapAccessChanges. A call after the interval (fake timers) runs a second. A rejected drain does not suppress the next call. reconcileAffiliationAccess itself is never coalesced.
Tests to update:
- character-authorization.test.ts:101-131: 'checks queued access changes on a healthy visit' and 'delivers a failed queued revocation on a later healthy visit'. Advance fake timers past the interval between visits, or mock reconcileAffiliationAccessOnVisit.
- src/app/api/auth/[...all]/route.test.ts 'checks returning client sessions after responding': assert getSessionMock is never called, checkAuthorizationsMock gets the id from the body, and the response is still toBe(response). Add a malformed-body case.
- route-guards.test.ts:42-70: mock @/composition/session getFullSession for checkSession and checkAdmin.
- src/app/api/account/corp-sharing/route.test.ts: authorize via checkSession and assert characterId comes from the session.
Existing guards: session.test.ts (after scheduling), guard-emissions.test.ts (CORE_EXPORTS for route-guards), and the AtlasBound and admin-mutation tests.

**Notes.** Behavior the migration must preserve or accept:
(1) A queued revocation's delivery to Convex can wait up to VISIT_DRAIN_INTERVAL_MS longer on visit-driven paths only. Keep the interval short (10-30 s) because no cron drains map_access_changes today (the src/app/api/cron list has no such job). Post-enqueue paths are unchanged.
(2) After step 4, the account/delete, unlink, purge, sessions/revoke, active-character and admin routes, plus AtlasBound, schedule the authorization check. For a just-deleted user, hasAuthorizationWork returns false and only the coalesced visit drain runs, which is harmless.
(3) The get-session body is customSession output (deriveSessionIdentity returns { user, session, characterId, ... }), so user.id is present whenever a session exists.
(4) Unverified lead: React cache() memoizes only inside a Flight render, so getFullSession and checkUserCharacterAuthorizations probably do not dedupe inside route handlers. Moving the guards to getFullSession is for consistency, not deduplication, and corp-sharing's double read is fixed by step 5, not by cache().
(5) Separate lead: deliverTrackingMerge (tracking-merge-retry.ts:21-42) holds a FOR UPDATE transaction on the direct client across projectMapAccess Convex calls (4 s timeout each), so concurrent visit drains contend on those row locks. Coalescing reduces this, but it deserves its own review against the src/AGENTS.md rule about holding connections across network calls.
(6) Keep session.ts export names stable; it has 35 dependents.

<sub>Reported by: concern:efficiency, concern:request-pipeline.</sub>

<a id="p161"></a>

## P161: Route user unlink, admin unlink and reassign through one unlinkCharacter that ends in reconcileAfterCharacterRemoval

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** high · **Size:** about -100 / +70 (user route -35/+12, admin-users -45/+22, reassign route -12, admin unlink route -6/+3, new helper +35)
- **Depends on:** [P141](#p141), [P146](#p146), [P256](#p256), [P257](#p257)
- **Existing primitive:** `src/platform/auth/account-purge.ts:reconcileAfterCharacterRemoval`

**Problem.** The runner protocol around removing a linked EVE character is hand-written three times: runBeforeCharacterUnlink, then remove, then runAfterFailedCharacterUnlink on a throw or zero rows, then runAfterCharacterUnlink, then a settle step. The settle step has drifted. The user unlink route and admin deleteLinkedCharacter only repoint the active character. They never repair user.email, which Better Auth sets to the last-signed-in character's synthetic email and later uses to implicitly re-link that character to the old user, a cross-owner sign-in after a character sale. reassignCharacter repairs the source's email only when the source is emptied, and leaves the multi-character case to a second reconcile bolted onto the admin route. The admin unlink route also reads membership twice (accountBelongsToUser, then listLinkedCharacters) where the user route answers both checks from one listLinkedCharacters read.

**Verifier revision.** The core is real and more serious than the finder rated it. Three sites run the same before, remove, restore, after and settle runner protocol, and two of them skip the identity repair. I confirmed the security consequence in Better Auth 1.6.30. findOAuthUser (node_modules/better-auth/dist/db/internal-adapter.mjs:429-475) falls back to a user lookup by email when no account row matches. handleOAuthUserInfo (node_modules/better-auth/dist/oauth2/link-account.mjs:9-50) then implicitly links the account to that user, because userInfo.emailVerified is true (auth.ts:175) and implicit linking is not disabled (auth.ts:102 sets only allowDifferentEmails). overrideUserInfo: true (auth.ts:132; link-account.mjs:67-76) rewrites user.email to the synthetic email of whichever character last signed in. So after a user unlinks the character they last signed in with, a fresh EVE sign-in as that character re-attaches it to the old user and opens that user's session. proveCharacter returns NONE because no account row exists (owner-transfer.ts:74-79). If the character has since been sold, the new owner lands in the old account. The transfer path calls reconcileAfterCharacterRemoval exactly to prevent this (owner-transfer.test.ts:133-147). Corrections to the finding: (1) The reassign route's second reconcile is NOT redundant in the common case. reassignCharacter only reconciles when the source is emptied (admin-users.ts:267-271); otherwise it only repoints active. The route's call (reassign/route.ts:53-62) is the only email repair for a source that keeps other characters. It is redundant only in the fresh-link race, where reassignCharacter already reconciled and returned accountEmptied false. (2) Reassign deliberately settles the source even when its compare-and-swap moves nothing (admin-users.reassign.test.ts:130-137 expects sourceDeleted true), while deleteLinkedCharacter returns early on no match (admin-users.reassign.test.ts:63-68). The primitive needs a settle-on-miss option. (3) character-transfer.ts is a fourth copy, but it resumes history erasure on retry even when the link is already gone, so it stays out of scope. It already reconciles.

**Sites (13).**

- [`src/app/api/account/characters/unlink/route.ts:42-88`](../../src/app/api/account/characters/unlink/route.ts#L42-L88) — inline protocol around auth.api.unlinkAccount; the settle step is linkChanged then a conditional repointActiveToOldest, with no email repair
- [`src/platform/auth/admin-users.ts:176-205`](../../src/platform/auth/admin-users.ts#L176-L205) — deleteLinkedCharacter: same protocol under changeCharacterOwnership; early return on no match; no email repair
- [`src/platform/auth/admin-users.ts:223-277`](../../src/platform/auth/admin-users.ts#L223-L277) — reassignCharacter: same protocol; the settle step pre-selects remaining (261-265) and reconciles only when emptied, otherwise just repoints; settles even when the CAS misses
- [`src/app/api/admin/characters/reassign/route.ts:47-62`](../../src/app/api/admin/characters/reassign/route.ts#L47-L62) — second reconcile when !sourceDeleted; the only email repair for a multi-character source; failure is logged and the route still returns 303
- [`src/app/api/admin/characters/unlink/route.ts:34-52`](../../src/app/api/admin/characters/unlink/route.ts#L34-L52) — accountBelongsToUser then listLinkedCharacters: two reads where one suffices
- [`src/platform/auth/account-purge.ts:20-61`](../../src/platform/auth/account-purge.ts#L20-L61) — repairUserIdentity (email and active repoint) plus reconcileAfterCharacterRemoval (deletes an emptied user and restores projection on a race)
- [`src/platform/auth/auth.ts:100-103, 128-133, 170-176`](../../src/platform/auth/auth.ts#L100-L103) — accountLinking only sets allowDifferentEmails; overrideUserInfo true; synthetic email with emailVerified true
- [`src/composition/account-lifecycle/owner-transfer.ts:70-79`](../../src/composition/account-lifecycle/owner-transfer.ts#L70-L79) — proveCharacter returns NONE when no account row exists, so it does not block the email fallback
- [`src/platform/auth/linked-characters.ts:100-123, 184-223`](../../src/platform/auth/linked-characters.ts#L100-L123) — listLinkedCharacters, accountBelongsToUser, repointActiveToOldest, getStoredActiveCharacterId
- [`src/composition/map-access-identity.ts:48-91`](../../src/composition/map-access-identity.ts#L48-L91) — runners: before-hook self-restores on failure; linkChanged does not read activeCharacterId, so moving the repoint ahead of it is safe
- [`src/platform/auth/admin-users.reassign.test.ts:56-145`](../../src/platform/auth/admin-users.reassign.test.ts#L56-L145) — pins no-match early return for delete, settle-on-miss for reassign, and no linkChanged when runBeforeUserDelete fails
- [`src/app/api/admin/characters/reassign/route.test.ts:111-148`](../../src/app/api/admin/characters/reassign/route.test.ts#L111-L148) — pins the route-level reconcile and its catch-and-log on failure
- [`src/composition/account-lifecycle/account-purge.db.test.ts:484-548`](../../src/composition/account-lifecycle/account-purge.db.test.ts#L484-L548) — fresh-link race during reconcile and reassign; expects email = syntheticEmail(SECOND_CHAR)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/account-lifecycle/character-transfer.ts:9-35`](../../src/composition/account-lifecycle/character-transfer.ts#L9-L35) — Same protocol and already reconciles, but it skips the before-hook and still runs runAfterCharacterUnlink when the link is already gone (a retry resumes history erasure; see account-purge.ts:50). That conflicts with no-match restore semantics. Leave it as is.
- [`src/composition/account-lifecycle/account-purge.ts:18-52`](../../src/composition/account-lifecycle/account-purge.ts#L18-L52) — Deletion path (purgeLink plus reconcile) with no before/after unlink runners; it already repairs identity

</details>

**Home.** `src/platform/auth/character-unlink.ts (new), next to account-purge.ts, which it imports`

**Boundary check.** The new module is in zone platform/auth and imports only ./account-purge and ./identity-projection-runners (same zone). Consumers: src/platform/auth/admin-users.ts is the same zone. src/app/api/account/characters/unlink/route.ts is zone api, and the rule 'from: api' allows 'platform/auth'. character-transfer.ts (zone composition) could adopt it later; the rule 'from: composition' allows 'platform/auth'. No cycle: account-purge.ts does not import admin-users or the new module.

**API sketch.**

```ts
export type CharacterUnlinkOutcome =
  | { removed: false; reason: 'revocation-failed' | 'remove-failed'; error: unknown }
  | { removed: false; reason: 'no-match'; accountEmptied: boolean }
  | { removed: true; accountEmptied: boolean };

export async function unlinkCharacter(args: {
  userId: string;
  characterId: number;
  runners: IdentityProjectionRunners;
  /** Commits the removal; resolves false when no row matched. */
  remove: () => Promise<boolean>;
  /** Reassign: reconcile the source even when the compare-and-swap matched nothing. */
  settleOnMiss?: boolean;
  /** Runs last inside the settle block (reassign: the receiving user's linkChanged). */
  afterSettle?: (removed: boolean) => Promise<void>;
}): Promise<CharacterUnlinkOutcome>;
// body: mapIds = runBefore (catch: return revocation-failed, no restore since the runner self-restores);
// try remove (catch: runAfterFailed, return remove-failed); if !removed { runAfterFailed; if !settleOnMiss return no-match };
// try { if (removed) runAfterCharacterUnlink } finally { emptied = reconcileAfterCharacterRemoval(); runAfterCharacterLinkChanged(source); afterSettle?.(removed) }
```

**Migration steps.**

1. Add src/platform/auth/character-unlink.ts with unlinkCharacter as sketched, plus character-unlink.test.ts using mocked runners and a mocked ./account-purge.
2. Rewrite deleteLinkedCharacter (admin-users.ts:176-205) to call unlinkCharacter. remove runs the existing changeCharacterOwnership delete and returns rows.length > 0. On an outcome that carries `error`, rethrow it. Return outcome.removed.
3. Rewrite reassignCharacter (admin-users.ts:223-277) to call unlinkCharacter with remove = the existing changeCharacterOwnership CAS update, settleOnMiss: true, and afterSettle = (removed) => removed ? runners.runAfterCharacterLinkChanged({ userId: toUserId, characterId }) : undefined. Rethrow error outcomes and return { sourceDeleted: outcome.accountEmptied }. Delete the `remaining` pre-select and the repoint branch, then drop the getStoredActiveCharacterId/repointActiveToOldest imports if nothing else uses them.
4. In src/app/api/admin/characters/reassign/route.ts, delete lines 53-62 (second reconcile and its try/catch) and the account-purge import. Update route.test.ts: remove the reconcile mock and the 'rebinds the source identity' and 'keeps the committed move successful' cases, which move to admin-users tests.
5. In src/app/api/account/characters/unlink/route.ts, replace lines 51-88 with unlinkCharacter({ userId: session.user.id, characterId, runners: identityProjectionRunners, remove: async () => { await auth.api.unlinkAccount({...}); return true; } }). When !removed, log with the existing messages ('map access revocation failed' for revocation-failed, 'unlinkAccount failed' for remove-failed) and return redirectWithError('unlink_failed'). Drop the getStoredActiveCharacterId/repointActiveToOldest imports. Update route.test.ts to assert reconcile instead of repointActiveToOldest, and keep the enqueue < revoke < unlinkAccount ordering and failure-mapping cases.
6. In src/app/api/admin/characters/unlink/route.ts, read listLinkedCharacters(userId) once. Return not_linked when `!linked.some(c => c.characterId === characterId)` and last_character when `linked.length <= 1`. Drop the accountBelongsToUser import there (the reassign route still uses it) and update route.test.ts.
7. Add DB regressions: unlinking the character whose syntheticEmail is user.email, through deleteLinkedCharacter and through unlinkCharacter with a direct remove, leaves email = syntheticEmail(oldest remaining). Reassigning one of several characters off a source whose email is the moved character's leaves the source repaired with no route-level call.

**Tests.** New: character-unlink.test.ts covering ordering; revocation-failed (no remove, no restore); remove throw (restore, then remove-failed); no-match with and without settleOnMiss; runAfterCharacterUnlink throw (settle runs, then rethrows); reconcile throw (linkChanged and afterSettle skipped). New DB cases in src/platform/auth/admin-users.db.test.ts for email repair after admin unlink and multi-character reassign. Existing guards to keep green: admin-users.reassign.test.ts:56-145 (adjust the state.results queues, since the `remaining` pre-select disappears), admin-users.db.test.ts:185-340, account-purge.db.test.ts:484-548, owner-transfer.test.ts:124-170, account/characters/unlink/route.test.ts:125-225, admin/characters/unlink/route.test.ts:61-100, admin/characters/reassign/route.test.ts.

**Notes.** Behavior to preserve: (1) Before-hook failure: no runAfterFailedCharacterUnlink call (the runner self-restores, map-access-identity.ts:61-71); the user route redirects unlink_failed and the admin paths rethrow. (2) Remove failure: restore first, then the same mapping. (3) Delete no-match returns false with no linkChanged; reassign no-match still settles the source (sourceDeleted can be true). (4) A runAfterCharacterUnlink failure still runs the whole settle block, then rethrows. (5) A reconcile failure (for example runBeforeUserDelete) skips the source and target linkChanged. Intentional changes: (a) the user and admin unlink paths now repair user.email; this is the security fix. (b) In those two paths the settle order becomes reconcile then linkChanged, matching reassign and transfer; linkChanged does not depend on activeCharacterId. (c) Reassign of one of several characters: a reconcile failure now propagates (500 after the committed move) instead of being logged with a 303, which is consistent with the emptied case and with the other paths. If the 303 is wanted, keep a catch around unlinkCharacter only for errors thrown after `removed`. (d) If a race empties the account, reconcile deletes the user on the user and admin unlink paths too. Today the user route's linked.length guard and Better Auth's FAILED_TO_UNLINK_LAST_ACCOUNT (better-auth dist/api/routes/account.mjs:243) make that rare, and it matches reassign. Separate follow-up: the user route removes via Better Auth without the withLockedUsers/usersHavePendingDeletion guard that changeCharacterOwnership gives the admin paths (admin-users.ts:166-174). With this helper, its remove can switch to the locked delete if that guard is wanted. Efficiency: reassign stops selecting `remaining` before reconcile, which selects it again (account-purge.ts:44-45), and admin unlink drops one query.

<sub>Reported by: area:app-api.</sub>

← [Wave 8: Charts, images and board/workspace adoption](wave-08-charts-images-and-board-workspace-adoption.md) · [Index](README.md#roadmap) · [Wave 10: Server pipelines, purge, telemetry and the admin console](wave-10-server-pipelines-purge-telemetry-and-the-admin.md) →
