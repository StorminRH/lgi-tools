# Wave 6: Config, env, ids and shared domain vocabularies

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 5: Persistence primitives and data-layer SQL](wave-05-persistence-primitives-and-data-layer-sql.md) · [Index](README.md#roadmap) · [Wave 7: UI kit primitives (src/components/ui)](wave-07-ui-kit-primitives-src-components-ui.md) →

Single-source env readers: the public Convex URL, Convex-configured check with door reasons, a portable bearer compare, Convex deployment env and appFetch for statics. Add src/lib/id-schemas and UUID map ids. Move EVE scopes into config. hasScopes and scopeHolderOf follow, plus the table-driven scope test and ESI owner types. The closed vocabularies are then derived from one source each: CostBasis, modifier kinds, attributable wormhole codes, percent drafts, door sides and Convex validators. Last come the codex index, code sets, the typed-lifetime anchor and deathWindowFrom.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☑ | [P134](#p134) | Own the public Convex URL in one config-zone reader and fix SITE_URL's empty-string fallback | generic-utility | S | low | low | — |
| ☑ | [P209](#p209) | Give the 'Convex is not configured' check one owner and report the door's reason | server-pipeline | S | low | low | [P134](#p134) |
| ☐ | [P210](#p210) | Share one runtime-portable bearerMatches between Next and Convex, and make Convex answer 500 when its service secret is unset | convex | S | low | medium | — |
| ☐ | [P211](#p211) | Read SITE_URL through one Convex reader and CONVEX_SERVICE_SECRET through readEnv, then lint convex for raw env reads | convex | S | low | low | [P210](#p210), [P134](#p134) |
| ☐ | [P212](#p212) | Fetch system statics from Convex through the service-client with the systemStaticsEndpoint contract | contracts-validation | S | low | low | [P211](#p211) |
| ☐ | [P247](#p247) | Add src/lib/id-schemas.ts (positive id, int4 id, path id) and bound the int4 reads that currently 500 | contracts-validation | M | low | medium | — |
| ☐ | [P248](#p248) | Validate public map ids as UUIDs in data/maps/api-contract.ts; optionally share the owned-row text-id bound | contracts-validation | S | low | low | — |
| ☐ | [P187](#p187) | Move EVE_SCOPES into src/config/eve-scopes.ts with an EveScope type, type every sync scope list against it, and gloss every requested scope | esi-sync | S | low | medium | — |
| ☐ | [P350](#p350) | Turn corp-context-sync.test.ts into a table-driven EVE_SCOPES membership test for every sync scope set, then delete the scope pins | testing | S | low | low | [P187](#p187) |
| ☐ | [P186](#p186) | Replace the ten canSyncX copies with one hasScopes predicate in src/lib and one scopeHolderOf projection in platform/auth | esi-sync | S | low | medium | [P187](#p187) |
| ☐ | [P252](#p252) | Export a syncEligibility projection from scope-health and use it wherever the canSync input is built | contracts-validation | S | low | low | [P186](#p186), [P303](wave-01-quick-wins-delete-dead-code-fix-small.md#p303) |
| ☐ | [P258](#p258) | Add one unnamed-entity fallback label helper and define the ESI owner-type vocabulary once in platform/owner-sync | contracts-validation | M | low | low | [P094](wave-04-formatting-dates-and-names-have-one-home.md#p094) |
| ☐ | [P260](#p260) | Reuse the existing CostBasis, modifier-kind, roman-level, map-create-role and admin-query vocabularies instead of restating them | contracts-validation | S | low | low | — |
| ☐ | [P266](#p266) | Name the 'attributable (non-K162) wormhole type code' predicate once in wormhole-contract | contracts-validation | S | low | low | — |
| ☐ | [P265](#p265) | Parse PercentInput drafts with one grammar and name the 99% entered-bonus bound | contracts-validation | S | low | low | — |
| ☐ | [P262](#p262) | Use ConnectionDoorSide and a CONNECTION_DOOR_SIDES tuple instead of 36 inline 'from' \| 'to' unions and the ConnectionDoor alias | contracts-validation | S | low | low | — |
| ☐ | [P261](#p261) | Derive Convex TS types from their validators and build every enum validator from its data-zone tuple | contracts-validation | M | low | medium | [P262](#p262) |
| ☐ | [P124](#p124) | Give the wormhole codex one code index (lowest typeId wins, conflicts exposed) shared by client, hole-matching, emission and the eliminator | generic-utility | S | low | low | — |
| ☐ | [P125](#p125) | Share the system-code-set comparison between wh-statics diff and cross-check | generic-utility | S | low | low | — |
| ☐ | [P082](#p082) | Anchor the typed lifetime ceiling on firstSeenAt through one connection-lifetime helper, make isCodexSizeLocked a type guard, and reuse staticClassForCode | client-data | M | low | medium | [P124](#p124), [P266](#p266) |
| ☐ | [P329](#p329) | Make deathWindowFrom the single death-window constructor (mapper optimistic args, convex validation) and delete test-only data wrappers | simplification | S | low | medium | [P082](#p082) |

<a id="p134"></a>

## P134: Own the public Convex URL in one config-zone reader and fix SITE_URL's empty-string fallback

- **Status:** [x] done
- **Category:** generic-utility · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About +10 source (new module) / -2 net at call sites; +30 tests
- **Depends on:** —
- **Existing primitive:** `src/config/site-url.ts:SITE_URL`

**Problem.** NEXT_PUBLIC_CONVEX_URL is read directly in 7 places (6 files). Some reads happen at module load (client, proxy CSP) and some at call time (service door, two purge guards, synthetic-pilot store twice). Three of them repeat the door's own 'convex_not_configured' decision as an inline truthiness guard. Nothing owns the rule that '' means unset, although the repo's .env.example and cloud setup produce empty values. Separately, SITE_URL uses `??`, so an empty NEXT_PUBLIC_SITE_URL produces '' and crashes `new URL(SITE_URL)` at module load in proxy.ts and the root layout.

**Verifier revision.** Narrowed. One concept is genuinely repeated: 'what is the Convex URL / is Convex configured', read raw in 7 places across data, lib, runtime and composition. The empty-string semantics are load-bearing: .env.example:147 ships `NEXT_PUBLIC_CONVEX_URL=` empty, and convex-service-door.test.ts:25 and map-purge.test.ts:22 rely on '' meaning unset. All current Convex readers use truthiness, but nothing owns that rule. The SITE_URL drift is real: site-url.ts uses `??`, so '' yields SITE_URL='' and `new URL(SITE_URL)` throws at module load in proxy.ts:7 and app/layout.tsx:41. It is fixed with one character in the existing single owner, though. Dropped from scope: (a) AFK. AfkGate.tsx is the only reader, and afk-model's afkConfigFromOverrides already parses it, so it moves only if the lint is narrowed. (b) Moving deriveConvexSiteUrl. It is a pure URL transform, and four test files mock it at '@/lib/sync-engine' while exercising the door, so moving it into convex-service-door.ts would make it a same-module call they can no longer mock. (c) Lint narrowing becomes optional. eslint.config.mjs:370-377 states the policy 'NODE_ENV and NEXT_PUBLIC_* stay direct reads', so reversing it is an owner decision.

**Sites (11).**

- [`src/data/convex/client.ts:3, 20-22`](../../src/data/convex/client.ts#L3) — Module-load read; truthiness decides whether to construct ConvexReactClient (client bundle)
- [`src/lib/convex-service-door.ts:8-9`](../../src/lib/convex-service-door.ts#L8-L9) — Call-time read; falsy returns {ok:false, reason:'convex_not_configured'}
- [`src/proxy.ts:17-23`](../../src/proxy.ts#L17-L23) — Module-load read for the CSP connect-src
- [`src/composition/synthetic-pilot-store.ts:43-46`](../../src/composition/synthetic-pilot-store.ts#L43-L46) — Local-URL assertion that tolerates unset
- [`src/composition/synthetic-pilot-store.ts:83-94`](../../src/composition/synthetic-pilot-store.ts#L83-L94) — Is-configured guard before Convex teardown
- [`src/data/location-tracking/purge.ts:20-28`](../../src/data/location-tracking/purge.ts#L20-L28) — `if (!process.env.NEXT_PUBLIC_CONVEX_URL) return;` duplicates the door's not-configured branch before postConvexHttpDoor
- [`src/data/online-status/purge.ts:5-15`](../../src/data/online-status/purge.ts#L5-L15) — Same guard
- [`src/lib/convex-http-door.ts:27-30`](../../src/lib/convex-http-door.ts#L27-L30) — Door turns any not-ok result into a throw, which is why the purges pre-check 'configured'
- [`src/config/site-url.ts:1-4`](../../src/config/site-url.ts#L1-L4) — `??` drift: '' is not treated as unset
- [`src/proxy.ts:7`](../../src/proxy.ts#L7) — `new URL(SITE_URL)` at module load throws when SITE_URL is ''
- [`eslint.config.mjs:370-377`](../../eslint.config.mjs#L370-L377) — Selector exempts NEXT_PUBLIC_*; message states direct reads are policy

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/tracking/AfkGate.tsx:19-23`](../../src/mapper/tracking/AfkGate.tsx#L19-L23) — Single reader, already parsed by afkConfigFromOverrides. Migrate only if the optional lint narrowing is adopted.
- [`src/lib/sync-engine.ts:79-94`](../../src/lib/sync-engine.ts#L79-L94) — deriveConvexSiteUrl is a URL transform, not env access. It is mocked at '@/lib/sync-engine' by composition/signature-elimination/convex-door.test.ts:5-13, composition/jump-resolver/convex-door.test.ts:5-13, composition/map-access-projection.test.ts:14,40 and lib/convex-http-door.test.ts:6-14, so moving it costs test rewrites for no gain.
- [`src/scripts/vercel-convex-deploy.ts:28`](../../src/scripts/vercel-convex-deploy.ts#L28) — String literal naming the variable, not a read

</details>

**Home.** `src/config/public-env.ts (new), alongside the existing src/config/site-url.ts`

**Boundary check.** Home zone: config. Rule `{from:'config', allow:[]}`: the module has no imports. Consumers: data (data/convex/client.ts, data/location-tracking/purge.ts, data/online-status/purge.ts), whose rule allows config; lib (lib/convex-service-door.ts), whose rule `{from:'lib', allow:['config']}` permits it; runtime (src/proxy.ts), whose rule allows config and which already imports @/config/site-url; composition (synthetic-pilot-store.ts), whose rule allows config. Optional AFK consumer: mapper allows config. Because the module has zero dependencies it is safe in the client bundle that data/convex/client.ts ships in, unlike lib/convex-service-door.ts, which pulls in zod via readEnv.

**API sketch.**

```ts
// src/config/public-env.ts
// Literal member access so Next inlines it at build time (no destructuring, no dynamic key).
export function publicConvexUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_CONVEX_URL || undefined;
}
export function isConvexConfigured(): boolean {
  return publicConvexUrl() !== undefined;
}
// src/config/site-url.ts
export const SITE_URL: string = process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE_URL;
```

**Migration steps.**

1. Ask docs-researcher to confirm, against node_modules/next/dist/docs/01-app/02-guides/environment-variables.md:158-190, that a literal `process.env.NEXT_PUBLIC_CONVEX_URL` inside a function is inlined: only dynamic `process.env[name]` lookups are not.
2. Add src/config/public-env.ts with publicConvexUrl() and isConvexConfigured() as sketched.
3. Fix src/config/site-url.ts:4 from `??` to `||`.
4. lib/convex-service-door.ts:8-9: `const convexUrl = publicConvexUrl(); if (convexUrl === undefined) return { ok: false, reason: 'convex_not_configured' };`
5. data/location-tracking/purge.ts:25 and data/online-status/purge.ts:6: `if (!isConvexConfigured()) return;`
6. composition/synthetic-pilot-store.ts:43 (`const convexUrl = publicConvexUrl();`) and :83 (`if (isConvexConfigured())`).
7. data/convex/client.ts:3: `const url = publicConvexUrl();`. Keep it at module load so a single client instance is preserved.
8. src/proxy.ts:17: `const CONVEX_URL = publicConvexUrl();`. Keep module-load evaluation for the CSP string.
9. Optional, owner decision: split processEnvSelectors so NEXT_PUBLIC_* reads are flagged outside src/config/**, following the src/lib/env.ts block pattern at eslint.config.mjs:1252-1273. Move AfkGate's two reads into public-env.ts as afkOverrides() first and update the rule message.

**Tests.** New: src/config/public-env.test.ts using vi.stubEnv: unset → undefined/false; '' → undefined/false; 'http://127.0.0.1:3210' → value/true; also check it re-reads at call time. New site-url case: vi.stubEnv('NEXT_PUBLIC_SITE_URL', '') then vi.resetModules() and a dynamic import, expecting SITE_URL === PRODUCTION_SITE_URL. Existing guards: lib/convex-service-door.test.ts:17-27 ('' → convex_not_configured), data/convex/client.test.ts:16, data/location-tracking/purge.test.ts:73-122 (raw process.env set/delete still works at call time), data/online-status/purge.test.ts:76-77, composition/map-access-projection.test.ts:265-271, composition/map-purge.test.ts:17-22, data/location-tracking/merge.test.ts:43, composition/synthetic-pilot-store.test.ts:78.

**Notes.** Preserve module-load evaluation in client.ts and proxy.ts. Changing them to call-time would construct the Convex client per call or rebuild the CSP per request. Preserve truthiness semantics exactly: '' must mean unset everywhere, since .env.example:147 and .claude/cloud/setup.sh:109 produce empty values. synthetic-pilot-store:43-46 accepts unset but rejects a set non-local URL; keep that order. The proposal's deriveConvexSiteUrl move and AFK reads are not part of the required change.

<sub>Reported by: gap:env-and-runtime-config-access.</sub>

<a id="p209"></a>

## P209: Give the 'Convex is not configured' check one owner and report the door's reason

- **Status:** [x] done
- **Category:** server-pipeline · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -3 / +8
- **Depends on:** [P134](#p134)
- **Existing primitive:** `src/lib/convex-service-door.ts:resolveConvexServiceDoor`

**Problem.** Server code that must keep working without Convex re-implements the 'configured?' test by reading NEXT_PUBLIC_CONVEX_URL directly in three places. The same classification already exists in src/lib/convex-service-door.ts. postConvexHttpDoor collapses convex_not_configured, unrecognized_convex_url and service_secret_missing into one message, so a misconfigured deployment cannot tell a missing secret from an unset URL. The purge contributors also disagree on Convex-less behavior: online-status and location-tracking no-op, while maps logs or throws.

**Verifier revision.** The core holds. resolveConvexServiceDoor classifies 'convex_not_configured', postConvexHttpDoor throws that reason away, and three call sites re-read process.env.NEXT_PUBLIC_CONVEX_URL to decide whether to skip. The thrown message also hides which of the three reasons applied. The proposed design does not fit: an overloaded `whenUnconfigured: 'skip'` returning T | null. Of the three skip sites, synthetic-pilot-store guards a whole block (a Postgres query plus four door calls). location-tracking guards after cancelPendingTracking and leaves the same poster unguarded for tracking-merge-retry, where an unconfigured Convex must throw so the merge retries. Only online-status would use a per-call option, so a plain predicate covers all three sites with no overloads. The claim that purgeLocationTracking is 'exported unguarded' is by design: tracking-merge-retry needs the throw. The maps contributor difference is real. Without Convex, purgeUserClaims logs through bestEffort for every purged user, and purgeMapChain throws for owners of maps, keeping the deletion requested. Whether that should change is a product decision.

**Sites (9).**

- [`src/lib/convex-service-door.ts:5-17`](../../src/lib/convex-service-door.ts#L5-L17) — returns ok:false with reason convex_not_configured / unrecognized_convex_url / service_secret_missing. Its only caller is convex-http-door
- [`src/lib/convex-http-door.ts:27-30`](../../src/lib/convex-http-door.ts#L27-L30) — throws `${label}: Convex URL or service secret is unset or unsafe` for every reason
- [`src/data/online-status/purge.ts:5-15`](../../src/data/online-status/purge.ts#L5-L15) — `if (!process.env.NEXT_PUBLIC_CONVEX_URL) return;` before the door call
- [`src/data/location-tracking/purge.ts:20-28`](../../src/data/location-tracking/purge.ts#L20-L28) — teardownLocationTracking runs cancelPendingTracking, then the same env read, then purgeLocationTracking
- [`src/composition/synthetic-pilot-store.ts:79-94`](../../src/composition/synthetic-pilot-store.ts#L79-L94) — block guard around the owned-maps query plus purgeMapChain, teardownMapAccessProjection, purgeUserMapAccessProjection and purgeLocationTracking
- [`src/composition/account-lifecycle/tracking-merge-retry.ts:35-40`](../../src/composition/account-lifecycle/tracking-merge-retry.ts#L35-L40) — unguarded purgeLocationTracking and restoreMergeTracking. A throw is required so the job stays pending; the 'skip' policy must not reach here
- [`src/data/maps/purge.ts:30-39,119-125`](../../src/data/maps/purge.ts#L30-L39) — purgeMapChain is called for each owned map before deleteOwnedMaps (throws when unconfigured); purgeUserClaims is wrapped in bestEffort (logs when unconfigured)
- [`src/composition/purge/register-all.ts:27-31`](../../src/composition/purge/register-all.ts#L27-L31) — wires the unguarded maps hooks into PURGE_CONTRIBUTORS next to the guarded online-status and location-tracking contributors
- [`src/lib/best-effort.ts:1-12`](../../src/lib/best-effort.ts#L1-L12) — logs console.error on failure, which is the maps purgeUserClaims symptom

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/synthetic-pilot-store.ts:43-46`](../../src/composition/synthetic-pilot-store.ts#L43-L46) — Reads the URL value to enforce a local http URL. It needs the value, not a configured boolean
- [`src/data/convex/client.ts:1-20`](../../src/data/convex/client.ts#L1-L20) — Browser ConvexReactClient. NEXT_PUBLIC is inlined at build time, a separate concern from the server door
- [`src/proxy.ts:17`](../../src/proxy.ts#L17) — Runtime proxy reads the URL value. Not a skip decision

</details>

**Home.** `src/lib/convex-service-door.ts: add isConvexConfigured() next to resolveConvexServiceDoor, and use it inside that function`

**Boundary check.** src/lib is the lib zone, and 'lib -> [config]' is enough since the function only reads process.env. Consumers: src/data/online-status/purge.ts and src/data/location-tracking/purge.ts (data children, 'data -> [..., lib, ...]'); src/composition/synthetic-pilot-store.ts ('composition -> [..., lib, ...]'); src/data/maps/purge.ts if the owner chooses skip (data → lib). The message change stays inside src/lib/convex-http-door.ts.

**API sketch.**

```ts
// src/lib/convex-service-door.ts
export function isConvexConfigured(): boolean; // Boolean(process.env.NEXT_PUBLIC_CONVEX_URL), the same test resolveConvexServiceDoor uses for 'convex_not_configured'
// src/lib/convex-http-door.ts
if (!door.ok) throw new DoorError(`${label}: Convex URL or service secret is unset or unsafe (${door.reason})`);
```

**Migration steps.**

1. Add isConvexConfigured() to src/lib/convex-service-door.ts and make resolveConvexServiceDoor's first branch use it. Add unit tests in convex-service-door.test.ts for unset, empty string and set.
2. In postConvexHttpDoor, append door.reason to the thrown message and keep the existing prefix, so the substring assertions in src/data/location-tracking/purge.test.ts (83, 95, 123) still pass. Update the exact-message assertion at src/lib/convex-http-door.test.ts:75 and add one case per reason.
3. Replace the env reads with isConvexConfigured(): src/data/online-status/purge.ts:6, src/data/location-tracking/purge.ts:25 and src/composition/synthetic-pilot-store.ts:83. Leave synthetic-pilot-store.ts:43 as it is.
4. Record the maps decision in src/data/maps/purge.ts (createMapsPurgeContributor). Either guard purgeUser's Convex calls with isConvexConfigured(), matching online-status and location-tracking, or keep fail-and-retry for owned chains and add a comment saying why. Do not change it without the owner's decision; src/composition/account-lifecycle/account-purge.db.test.ts:644 pins the current retry-on-Convex-failure behavior.

**Tests.** Guarding tests: src/lib/convex-http-door.test.ts (75, exact message), src/lib/convex-service-door.test.ts, src/data/location-tracking/purge.test.ts (73 'no-ops when Convex is not configured', 83/95/123 message substrings), src/data/online-status/purge.test.ts, src/composition/synthetic-pilot-store.test.ts and .db.test.ts (40, empty URL), src/composition/map-purge.test.ts (22, unconfigured → MapPurgeUnavailableError), src/data/location-tracking/merge.test.ts (43). New tests: isConvexConfigured unit tests, and a door message test asserting each of the three reasons appears.

**Notes.** Keep the semantics exact. Only an unset or empty URL counts as 'not configured' and skips. A URL that is set but unsafe, or a missing service secret, must still throw at every site, because that is a misconfiguration. resolveConvexServiceDoor already separates these cases, and the predicate must match its first branch. Do not add a skip option to postConvexHttpDoor. tracking-merge-retry.ts and purgeMapChain depend on the throw to keep their work durable and retried. The three proposal variants (F296 ifConfigured, F386 door-level optional, F558 call-site option) are all superseded by the predicate.

<sub>Reported by: gap:env-and-runtime-config-access.</sub>

<a id="p210"></a>

## P210: Share one runtime-portable bearerMatches between Next and Convex, and make Convex answer 500 when its service secret is unset

- **Status:** [ ] not started
- **Category:** convex · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -15: delete bearerAuth.ts (17) and its test (14) plus the node:crypto copy (5); add bearer.ts (17) and the unset-secret branch (5)
- **Depends on:** —
- **Existing primitive:** `src/lib/service-auth.ts:bearerMatches`

**Problem.** Constant-time bearer comparison for CONVEX_SERVICE_SECRET and CRON_SECRET is implemented twice. src/lib/service-auth.ts hashes with node:crypto and compares with timingSafeEqual (sync). convex/lib/bearerAuth.ts hashes with Web Crypto and uses an XOR loop (async). Each copy has its own test file with the same cases. Missing-secret handling has drifted. checkBearerSecret logs and returns unexpected/not_configured (HTTP 500). convex/lib/httpAuth.ts returns false from bearerOk, so authorizedAction answers a plain 401 and nothing is logged. A Convex deployment missing the secret therefore looks like a wrong bearer to the Next caller, which throws `answered 401` from postConvexHttpDoor.

**Verifier revision.** The core holds up. The same hash-then-compare bearer check exists twice: node:crypto in src/lib/service-auth.ts and Web Crypto in convex/lib/bearerAuth.ts. Their test files assert the same cases. Convex cannot import the lib copy because service-auth.ts imports next/server and node:crypto. The missing-secret drift is also real: Next answers 500 not_configured and logs, while Convex answers a plain 401 with no log. The rest of the proposal does not survive. (1) isSafeServiceUrl is not a redundant re-parse. deriveConvexSiteUrl accepts any URL that has a port (http://evil.example:3210 becomes http://evil.example:3211), so isSafeServiceUrl is the HTTPS-or-loopback guard, and convex-service-door.test.ts pins it. One extra URL parse per call costs nothing. (2) The ternaries on the two internal routes are two one-liners. apiResponse already throws in tests when the status disagrees with the failure category. Any new Response-returning transport helper would also need edits to the pinned allowlists in guard-emissions.test.ts. (3) The only consumer of requireBearerSecret is requireCronAuth, and both are pinned delivery wrappers. Moving them buys nothing.

**Sites (8).**

- [`src/lib/service-auth.ts:1-2, 10-14`](../../src/lib/service-auth.ts#L1-L2) — node:crypto bearerMatches. The module also imports next/server (connection), which is why Convex cannot import it
- [`src/lib/service-auth.ts:16-37`](../../src/lib/service-auth.ts#L16-L37) — checkBearerSecret is already async. An unset secret logs and returns unexpectedFailure('not_configured')
- [`convex/lib/bearerAuth.ts:1-17`](../../convex/lib/bearerAuth.ts#L1-L17) — Web Crypto copy: SHA-256 of both strings, then XOR-accumulate over the fixed 32-byte digests
- [`convex/lib/httpAuth.ts:6-10`](../../convex/lib/httpAuth.ts#L6-L10) — bearerOk reads process.env.CONVEX_SERVICE_SECRET raw, and a falsy secret means false
- [`convex/lib/httpAuth.ts:20-27`](../../convex/lib/httpAuth.ts#L20-L27) — authorizedAction turns both an unset secret and a bad bearer into 'Unauthorized' 401
- [`src/lib/service-auth.test.ts:26-33`](../../src/lib/service-auth.test.ts#L26-L33) — bearerMatches cases (exact, trailing space, raw secret, null)
- [`convex/lib/bearerAuth.test.ts:1-14`](../../convex/lib/bearerAuth.test.ts#L1-L14) — Same cases plus 'Bearer wrong', async
- [`src/platform/auth/api-contract.ts:22-35, 53-63`](../../src/platform/auth/api-contract.ts#L22-L35) — The internal endpoints declare 500 not_configured: the Next side treats an unset secret as a server error

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/lib/convex-service-door.ts:5-25`](../../src/lib/convex-service-door.ts#L5-L25) — isSafeServiceUrl is the HTTPS-or-loopback guard, not a redundant re-parse. deriveConvexSiteUrl maps any URL with a port. The guard is covered by src/lib/convex-service-door.test.ts:6-30. Folding it into the HTTP door is a separate, low-value move
- [`src/lib/convex-http-door.ts:27-31`](../../src/lib/convex-http-door.ts#L27-L31) — Its only consumer, which discards the reason. Leave it
- [`src/lib/sync-engine.ts:79-94`](../../src/lib/sync-engine.ts#L79-L94) — deriveConvexSiteUrl is misplaced in the cadence module, but that is a cohesion issue unrelated to bearer auth. See notes for the optional follow-up
- [`src/app/api/internal/eve-characters/route.ts:17-18`](../../src/app/api/internal/eve-characters/route.ts#L17-L18) — The status ternary is two lines and is backstopped by apiResponse's category-to-status assertion (src/transport/api-response.ts:64-69). A helper would need new guard-emissions pins
- [`src/app/api/internal/eve-token/route.ts:19-20`](../../src/app/api/internal/eve-token/route.ts#L19-L20) — Same as above
- [`src/transport/cron.ts:4-22`](../../src/transport/cron.ts#L4-L22) — requireBearerSecret and requireCronAuth are pinned delivery wrappers (src/app/api/guard-emissions.test.ts:20-23, 365-369). Moving or adding a variant churns the pins for no consumer gain

</details>

**Home.** `src/lib/bearer.ts (new, imports nothing)`

**Boundary check.** Home zone: lib (src/lib/**). Rule {from: lib, allow: [config]} holds because the module imports nothing and uses only the global crypto.subtle and TextEncoder. Consumer src/lib/service-auth.ts is in lib, a same-zone import. Consumer convex/lib/httpAuth.ts is in convex, and rule {from: convex, allow: [platform/esi, platform/auth, data, lib]} permits lib. There is precedent: convex/mapStatics.ts:4-5 already imports @/lib/env and @/lib/fetch-with-timeout.

**API sketch.**

```ts
// src/lib/bearer.ts
export async function bearerMatches(authorization: string | null, secret: string): Promise<boolean>
// hash both `authorization ?? ''` and `Bearer ${secret}` with crypto.subtle.digest('SHA-256'), then OR-accumulate the XOR of every byte (no early exit)
```

**Migration steps.**

1. Create src/lib/bearer.ts with the body of convex/lib/bearerAuth.ts verbatim: the sha256 helper plus bearerMatches. Keep the full-length XOR accumulation with no short-circuit.
2. Create src/lib/bearer.test.ts from the union of the two existing case lists: exact match true; trailing space, raw secret, 'Bearer wrong' and null all false.
3. src/lib/service-auth.ts: drop the node:crypto import and the local bearerMatches. Import it from '@/lib/bearer' and change line 33 to `if (!(await bearerMatches(req.headers.get('authorization'), secret)))`. Delete the bearerMatches describe block at src/lib/service-auth.test.ts:26-33.
4. convex/lib/httpAuth.ts: import bearerMatches from '@/lib/bearer' and readEnv from '@/lib/env'. In authorizedAction, read `readEnv('CONVEX_SERVICE_SECRET')`. When it is undefined, console.error a fixed message such as '[httpAuth] CONVEX_SERVICE_SECRET is not set on this Convex deployment' and return `new Response('Service authentication is not configured', { status: 500 })`. Keep 401 'Unauthorized' for a mismatched bearer. Delete bearerOk.
5. Delete convex/lib/bearerAuth.ts and convex/lib/bearerAuth.test.ts.
6. Add a Convex HTTP test (for example in convex/httpEngine.test.ts) that stubs CONVEX_SERVICE_SECRET to '' and expects 500, plus the existing 401 assertions for a wrong or absent bearer.

**Tests.** Add src/lib/bearer.test.ts with the merged cases from both test files, and a Convex HTTP case where an unset CONVEX_SERVICE_SECRET returns 500. Existing tests that guard this: src/lib/service-auth.test.ts:35-71 (checkBearerSecret typed failures and admission); src/transport/cron.test.ts:27-90; src/app/api/internal/eve-characters/route.test.ts:47 and eve-token/route.test.ts:47 (empty secret gives 500); the 401 assertions in convex/httpEngine.test.ts:21, httpMapAccess.test.ts:26/224/245/309/320, httpAccountMerge.test.ts:19/55/92 and httpLocation.test.ts:32; src/app/api/guard-emissions.test.ts (CORE_EXPORTS still pins only checkBearerSecret in service-auth.ts).

**Notes.** Timing: both copies compare fixed-length SHA-256 digests, so neither the comparison loop nor timingSafeEqual leaks anything about the secret. The property to keep is hash-then-compare over equal-length buffers with no early exit. The Next Node runtime (20+) exposes globalThis.crypto.subtle, and checkBearerSecret is already async, so moving Next to the async Web Crypto version is safe. Convex already runs this exact code. Behavior change: only on Convex, where an unset secret goes from 401 to 500 and is now logged. No Convex test stubs an unset secret today, and Next callers (postConvexHttpDoor) throw on any non-2xx, so nothing else changes. Coordination with P211: this change moves httpAuth's secret read to readEnv. Land it first so that adding processEnvSelectors to the convex ESLint block in P211 finds no raw read there. Optional, separate follow-up found during verification: deriveConvexSiteUrl (src/lib/sync-engine.ts:79-94) has a single production consumer, convex-service-door.ts. Moving it there, with its test from sync-engine.test.ts:77-84, would let four test files drop their vi.mock('@/lib/sync-engine') deriveConvexSiteUrl stubs: src/lib/convex-http-door.test.ts:13-15/44, src/composition/signature-elimination/convex-door.test.ts:12-14/28, src/composition/jump-resolver/convex-door.test.ts:12-14/40 and src/composition/map-access-projection.test.ts:38-41/74. Every one of those mocks returns exactly what the real function derives from the stubbed NEXT_PUBLIC_CONVEX_URL.

<sub>Reported by: area:app-api, area:lib-infra, concern:generic-utils, concern:request-pipeline.</sub>

<a id="p211"></a>

## P211: Read SITE_URL through one Convex reader and CONVEX_SERVICE_SECRET through readEnv, then lint convex for raw env reads

- **Status:** [ ] not started
- **Category:** convex · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About +25 (reader, test, ESLint block) and -12 (two raw reads, trailing-slash code, raw secret checks)
- **Depends on:** [P210](#p210), [P134](#p134)
- **Existing primitive:** `src/lib/env.ts:readEnv`

**Problem.** Convex reads its deployment env ad hoc. requireSyncEnv (convex/lib/characterSync.ts:20-27) accepts '' for both SITE_URL and CONVEX_SERVICE_SECRET and hands SITE_URL to serviceFetch raw. serviceFetch then builds `${baseUrl}${endpoint.path}` (src/platform/auth/service-client.ts:35), so a trailing slash yields `//api/internal/...`. mapStatics re-reads SITE_URL with its own undefined-only check and its own trailing-slash normalisation (convex/mapStatics.ts:47-50, 73-78). httpAuth reads CONVEX_SERVICE_SECRET raw with a falsy check, although the registry entry (required: z.string().min(1)) already gives '' the meaning undefined. Nothing in the convex lint block stops a fourth copy.

**Verifier revision.** The drift is real. SITE_URL is read twice with different rules: characterSync rejects only undefined and passes the value through raw, while mapStatics rejects only undefined and strips one trailing slash. CONVEX_SERVICE_SECRET is read raw in two places with different emptiness rules, even though it is a registry entry that Convex can already reach through @/lib/env. The convex ESLint block also lacks processEnvSelectors. The proposed module is over-built, though. readServiceSecret() would be a one-line wrapper around readEnv('CONVEX_SERVICE_SECRET'); callers should just call readEnv. requireAppService duplicates the existing requireSyncEnv. The claim that a test matches the requireSyncEnv wording is false: grep finds the string only at the throw site. Only SITE_URL needs a Convex-local reader, because it is a Convex-only variable and should not join the Next registry, where the Next app's own SITE_URL comes from NEXT_PUBLIC_SITE_URL via @/config/site-url. The reader should also reuse the existing HTTPS-or-loopback rule, because Convex sends the service secret to SITE_URL.

**Sites (10).**

- [`convex/lib/characterSync.ts:20-27`](../../convex/lib/characterSync.ts#L20-L27) — requireSyncEnv: raw reads, '=== undefined' checks, so '' passes; SITE_URL is returned unnormalised
- [`src/platform/auth/service-client.ts:24-42`](../../src/platform/auth/service-client.ts#L24-L42) — Concatenates `${baseUrl}${endpoint.path}`, which is where an unnormalised SITE_URL would yield a double slash
- [`convex/mapStatics.ts:47-50`](../../convex/mapStatics.ts#L47-L50) — systemStaticsUrl strips a single trailing slash
- [`convex/mapStatics.ts:73-78`](../../convex/mapStatics.ts#L73-L78) — Second raw SITE_URL read; undefined-only skip, so '' builds a relative URL and is logged as 'fetch failed'
- [`convex/lib/httpAuth.ts:6-10`](../../convex/lib/httpAuth.ts#L6-L10) — Raw CONVEX_SERVICE_SECRET read with a falsy check
- [`src/lib/env.ts:3, 14-15, 54-63, 76-80`](../../src/lib/env.ts#L3) — The registry holds CONVEX_SERVICE_SECRET and VERCEL_AUTOMATION_BYPASS_SECRET as required (min 1). readEnv already works inside Convex via vercelProtectionBypassHeaders
- [`eslint.config.mjs:1415-1429`](../../eslint.config.mjs#L1415-L1429) — The convex no-restricted-syntax block omits processEnvSelectors (defined at 370-377)
- [`eslint.config.mjs:1204, 1252`](../../eslint.config.mjs#L1204) — Precedent for exempting the one sanctioned raw reader (src/lib/env.ts) through ignores plus a dedicated block
- [`src/lib/convex-service-door.ts:19-25`](../../src/lib/convex-service-door.ts#L19-L25) — isSafeServiceUrl (HTTPS, or HTTP on loopback via isLocalUrl). It is the same rule Convex should apply before sending the secret to SITE_URL
- [`convex/auth.config.ts:3-4`](../../convex/auth.config.ts#L3-L4) — AUTH_ISSUER_URL and AUTH_JWKS are raw reads that must stay raw (Convex auth config, not in the registry). Needs an exemption

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/config/site-url.ts:1-4`](../../src/config/site-url.ts#L1-L4) — The Next app's SITE_URL comes from NEXT_PUBLIC_SITE_URL, a different variable. Do not add a Convex-only SITE_URL to the Next registry, where readEnv('SITE_URL') would silently be undefined on Vercel

</details>

**Home.** `convex/lib/deploymentEnv.ts (new: readAppOrigin). isSafeServiceUrl moves to src/lib/url-safety.ts so both doors share it`

**Boundary check.** convex/lib/deploymentEnv.ts is in the convex zone and imports @/lib/url-safety, which rule {from: convex, allow: [..., lib]} permits. Its consumers convex/lib/characterSync.ts and convex/mapStatics.ts are in the same convex zone. Their readEnv imports come from @/lib/env, also convex to lib. Moving isSafeServiceUrl into src/lib/url-safety.ts keeps it in lib, which imports nothing, satisfying {from: lib, allow: [config]}. src/lib/convex-service-door.ts imports it lib to lib.

**API sketch.**

```ts
// src/lib/url-safety.ts
export function isSafeServiceUrl(value: string): boolean // https:, or http: on localhost/127.0.0.1/[::1]

// convex/lib/deploymentEnv.ts
/** The Next app origin Convex calls back into; undefined when SITE_URL is unset, empty, unparsable, or not HTTPS/loopback. */
export function readAppOrigin(): string | undefined
```

**Migration steps.**

1. Land P210 first, so httpAuth.ts already reads readEnv('CONVEX_SERVICE_SECRET').
2. Move isSafeServiceUrl from src/lib/convex-service-door.ts:19-25 into src/lib/url-safety.ts as an export, and import it back into convex-service-door.ts. Its existing tests in convex-service-door.test.ts keep covering it.
3. Add convex/lib/deploymentEnv.ts with readAppOrigin(). Read process.env.SITE_URL. Return undefined when it is empty or when isSafeServiceUrl rejects it. Otherwise return new URL(raw).origin.
4. convex/lib/characterSync.ts requireSyncEnv: `const siteUrl = readAppOrigin(); const secret = readEnv('CONVEX_SERVICE_SECRET'); if (siteUrl === undefined || secret === undefined) throw new Error('SITE_URL and CONVEX_SERVICE_SECRET must be set on this Convex deployment');`. Keep the export where it is, because convex/__tests__/export-coverage.test.ts:35 imports it from there.
5. convex/mapStatics.ts loadSystemStaticCodes: replace the raw read with `const origin = readAppOrigin()`, skipping with reason 'missing or invalid SITE_URL'. Drop the trailing-slash handling in systemStaticsUrl; if P212 lands, the whole URL builder goes.
6. eslint.config.mjs: add ...processEnvSelectors to the convex block at 1415-1429. Add 'convex/lib/deploymentEnv.ts' and 'convex/auth.config.ts' to its ignores, and add a block for exactly those two files with the original selector list (no processEnvSelectors), mirroring the src/lib/env.ts precedent at 1204/1252.

**Tests.** Add convex/lib/deploymentEnv.test.ts: unset, '', 'lgi.tools' (no scheme) and 'http://evil.example' give undefined; 'https://lgi.tools/' gives 'https://lgi.tools'; 'http://localhost:3000' gives 'http://localhost:3000'. Move the isSafeServiceUrl cases to url-safety tests, or keep them in convex-service-door.test.ts. Add a characterSync or characterLocationSync case where SITE_URL 'https://app.test/' produces a single-slash fetch URL. Existing tests that guard this: convex/engine.test.ts:1073-1092 (unset SITE_URL path); convex/mapStatics.test.ts:278-289 ('skips apply when SITE_URL is missing', which asserts only the note), 291-327 (exact URL with SITE='https://app.test'); convex/characterLocationSync.test.ts:81 and characterLocationSync.prep.test.ts:32 (stubbed SITE_URL).

**Notes.** Behavior changes the migration introduces on purpose: '' is now treated as unset at every site (requireSyncEnv throws instead of fetching a relative URL, and mapStatics logs a config skip instead of 'fetch failed'). A trailing slash on SITE_URL no longer produces '//api/internal/...' in characterSync. A non-HTTPS, non-loopback SITE_URL is now refused, so the service secret is never sent over plain HTTP. The documented values (https://lgi.tools, https://staging.lgi.tools, http://localhost:3000 in .env.example:164-166 and .claude/cloud/configure-convex-auth.sh:68) and the test value https://app.test all pass. The mapStatics copy (normalising) was the right one on the slash question; characterSync was the drifted copy. No test pins the requireSyncEnv message, despite the proposal's claim, so the wording is free to keep.

<sub>Reported by: gap:env-and-runtime-config-access.</sub>

<a id="p212"></a>

## P212: Fetch system statics from Convex through the service-client with the systemStaticsEndpoint contract

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -20 in mapStatics.ts, +12 in service-client.ts, +20 in tests
- **Depends on:** [P211](#p211)
- **Existing primitive:** `src/data/wh-statics/api-contract.ts:systemStaticsEndpoint`

**Problem.** convex/mapStatics.ts calls the public route /api/universe/statics/[systemId] with a hand-built URL and a hand-written type guard (parseStaticsPayload), outside the endpoint-contract client that every other Convex-to-Next call uses. If the route moves or its response shape changes, Convex just logs a skip and nothing fails at compile or test time. serviceFetch cannot serve it today for two reasons. It always sends a bearer. It also concatenates `${baseUrl}${endpoint.path}`, which would send the literal '[systemId]' for any endpoint with path params, a latent bug that this change also fixes.

**Verifier revision.** The bypass is real, and repo policy confirms it. ESLint's apiFetchSelectors (eslint.config.mjs:279-295) say raw /api fetches bypass the shared contracts. The resilience registry says Convex-to-first-party calls go through src/platform/auth/service-client.ts (vendor-resilience-registry.ts:94). Every other Convex-to-Next call (characterSync) uses serviceFetch with an endpoint contract. mapStatics hand-builds the path, hand-validates the body, and only dodges the lint because the URL starts with the origin. The proposed design is wrong, though. Convex cannot import endpointUrl, which lives in transport and is not on convex's allow list, so 'build the URL from systemStaticsEndpoint.path' means a hand-rolled '[systemId]' replace. The right fix is to give the existing Convex-to-app client, platform/auth/service-client, path-param support through endpointUrl, plus a bearer-less entry point. Once decodeEndpointResponse validates against systemStaticsEndpoint.responses[200], exporting systemStaticsResponseSchema is unnecessary.

**Sites (9).**

- [`convex/mapStatics.ts:43-57`](../../convex/mapStatics.ts#L43-L57) — systemStaticsUrl hand-builds '/api/universe/statics/${systemId}'; parseStaticsPayload re-implements the {statics: string[]} schema
- [`convex/mapStatics.ts:73-98`](../../convex/mapStatics.ts#L73-L98) — Raw fetchWithTimeout plus bypass headers, with ad-hoc mapping of !ok, invalid payload and thrown errors to skip reasons
- [`src/data/wh-statics/api-contract.ts:36-52`](../../src/data/wh-statics/api-contract.ts#L36-L52) — systemStaticsEndpoint (GET, path param systemId, declares only 200 jsonBody(systemStaticsResponseSchema))
- [`src/app/api/universe/statics/[systemId]/route.ts:10-23`](../../src/app/api/universe/statics/[systemId]/route.ts#L10-L23) — The route always answers 200 (an invalid param gives {statics: []}), so declaring only 200 is accurate
- [`src/platform/auth/service-client.ts:10-52`](../../src/platform/auth/service-client.ts#L10-L52) — The existing Convex-to-app client (bypass headers, fetchWithTimeout, decodeEndpointResponse). It always sends Authorization and ignores path params
- [`src/transport/endpoint.ts:166-186`](../../src/transport/endpoint.ts#L166-L186) — endpointUrl substitutes [param] segments with encodeURIComponent. platform/auth may import it; convex may not
- [`convex/lib/characterSync.ts:29-73`](../../convex/lib/characterSync.ts#L29-L73) — The precedent: Convex calls Next routes through serviceFetch and endpoint contracts
- [`eslint.config.mjs:279-295`](../../eslint.config.mjs#L279-L295) — Policy that /api fetches must go through declared contracts
- [`src/composition/__tests__/vendor-resilience-registry.ts:94`](../../src/composition/__tests__/vendor-resilience-registry.ts#L94) — States that Convex-to-first-party calls are bounded by service-client.ts; mapStatics is the exception

**Home.** `src/platform/auth/service-client.ts (extend: add appFetch, and give serviceFetch path params)`

**Boundary check.** service-client.ts is in platform/auth. Rule {from: platform/auth, allow: [platform/esi, platform/purge, data, transport, db, lib, config]} permits the new import of endpointUrl from @/transport/endpoint, and it already imports @/transport/decode and @/lib/*. Consumer convex/mapStatics.ts is in convex. Rule {from: convex, allow: [platform/esi, platform/auth, data, lib]} permits @/platform/auth/service-client and @/data/wh-statics/api-contract. That api-contract imports @/transport/endpoint only transitively, the same as @/platform/auth/api-contract, which convex/lib/characterSync.ts already imports.

**API sketch.**

```ts
// src/platform/auth/service-client.ts
export interface AppCallInit { baseUrl: string; timeoutMs?: number }
export type AppCallArgs<E extends EndpointContract> = AppCallInit & PathParamsOf<E> & ServiceBodyArgs<E>;
/** First-party call from Convex without service auth (bypass header only). */
export function appFetch<const E extends EndpointContract>(endpoint: E, init: AppCallArgs<E>): Promise<OutcomeOf<E>>;
/** Same, plus Authorization: Bearer <secret>. */
export function serviceFetch<const E extends EndpointContract>(endpoint: E, init: AppCallArgs<E> & { secret: string }): Promise<OutcomeOf<E>>;
// both delegate to a private core that fetches `${baseUrl}${endpointUrl(endpoint, init)}`
```

**Migration steps.**

1. In service-client.ts, extract the current serviceFetch body into a private core that takes extra headers. Build the URL as `${baseUrl}${endpointUrl(endpoint, init)}` (import endpointUrl from '@/transport/endpoint'). Export appFetch (no Authorization) and serviceFetch (adds Authorization), both typed with PathParamsOf<E>. ServiceCallInit can become AppCallInit & { secret: string }, or stay as an alias.
2. Add service-client.test.ts cases. A path-param endpoint ('/api/x/[id]') is fetched at 'https://app.test/api/x/42'. appFetch sends no Authorization header but still sends x-vercel-protection-bypass when set. The existing cases stay green, because endpoints without params produce the same URL.
3. In convex/mapStatics.ts loadSystemStaticCodes, take origin from readAppOrigin() (P211). Call `appFetch(systemStaticsEndpoint, { baseUrl: origin, params: { systemId } })`. On ok, return uniqueStaticCodes(outcome.data.statics). On network, skip with 'fetch failed'. On protocol, skip with `HTTP ${outcome.status}` when status !== 200, otherwise 'invalid statics payload'.
4. Delete systemStaticsUrl, parseStaticsPayload, the try/catch, and the fetchWithTimeout and vercelProtectionBypassHeaders imports from mapStatics.ts. Keep uniqueStaticCodes, which applyStaticPlaceholders also uses at line 151.

**Tests.** Add service-client.test.ts cases for path-param substitution and for appFetch omitting Authorization while still sending the bypass header. Existing tests that guard this, in convex/mapStatics.test.ts: 264-276 (500 skips), 278-289 (missing SITE_URL), 291-309 (exact URL `${SITE}/api/universe/statics/${WH_ROOT}` and bypass header sent), 311-327 (bypass header omitted, signal present), 329-340 (warn includes 'HTTP 302'), 342+ (backfill). Also src/platform/auth/service-client.test.ts and the convex characterLocationSync tests for serviceFetch callers.

**Notes.** Mapping differences to preserve or accept. A 200 with invalid JSON was 'fetch failed' (the json() throw was caught) and becomes 'invalid statics payload' (a protocol failure). No test asserts that string. A non-200 status was `HTTP ${status}` and stays so through the protocol failure's status; the 302 test asserts that text. The timeout stays at fetchWithTimeout's 10s default because timeoutMs is undefined. The request stays bearer-less: the route is public ('authz: public'), so do not route it through serviceFetch. Sending the secret would be harmless to the same origin but unneeded. Also make CONVEX_SERVICE_SECRET optional for this fetch, which it is today. endpointUrl encodes params with encodeURIComponent, so a numeric systemId produces the same URL as today.

<sub>Reported by: area:convex.</sub>

<a id="p247"></a>

## P247: Add src/lib/id-schemas.ts (positive id, int4 id, path id) and bound the int4 reads that currently 500

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -45 / +30 (6 constants, ~12 inline schemas, 5 predicate copies)
- **Depends on:** —
- **Existing primitive:** `convex/lib/mapEntityContracts.ts:isPositiveId (runtime only); src/transport/route-id.ts:parseNumericRouteId`

**Problem.** PG_INT4_MAX is redeclared in 6 contracts, once as POSTGRES_SERIAL_MAX. Integer-column ids are validated inconsistently:
- typeNamesRequestSchema bounds ids only to safe integers. getTypeNames then runs inArray(eve_types.id integer), so ids from 2^31 to 2^53 produce a Postgres out-of-range error (500), where the sibling market contracts return 400.
- parseNumericRouteId (/^\d+$/) accepts 0, leading zeros and values above int4. The proxy gate only covers /sites/<id>. /sites/<id>/opengraph-image and /industry/<id> therefore pass oversized ids into int4/serial lookups (500), and /sites/0123 renders at a non-canonical URL.
- wormhole-sites already has the correct path-id parser, but it is private.
- skillLevels caps characterId at int4 although character columns are bigint.
- maps/api-contract defines characterIdSchema and then re-spells it three times.

The runtime predicate `Number.isSafeInteger(v) && v > 0` exists in convex plus 4 local copies. entity-names and names-client use the weaker Number.isInteger. names-client's uncached branch does not filter at all, so one bad id fails the whole entity-names request.

**Verifier revision.** The int4 constant is copied six times, and int4 columns are reached through unbounded parsers. Both are real, and two are user-reachable 500s: typeNames ids reach eve_types.id integer unbounded, and parseNumericRouteId feeds the OG image and industry pages unbounded ids. The premise of three bound policies is wrong, though. In the installed zod 4.5.4, `.int()` and `.safe()` both apply the 'safeint' format (node_modules/zod/v4/classic/schemas.js:598-603, core/api.js:333-340). Every `z.number().int().positive()` is therefore already bounded to safe integers. The claimed drift at platform/auth, owned-structures structureId/corporationId and convex/httpJump is not drift, and `.safe()` everywhere is redundant. The '79 sites' count also includes non-ids (problem.ts retryAfterSeconds, auth expiresAt). The doorbell-model predicate checks expiresAt, not an id. Scope is trimmed to the real two-tier split (safe positive vs int4), the route-id fix, and the predicate copies. idListSchema and formIdSchema are dropped as indirection with no payoff.

**Sites (26).**

- [`src/data/eve-data/api-contract.ts:24-33`](../../src/data/eve-data/api-contract.ts#L24-L33) — typeNamesRequestSchema ids not bounded to int4 (the bug); entityNamesRequestSchema is correctly the safe positive id
- [`src/data/eve-data/schema.ts:37-40`](../../src/data/eve-data/schema.ts#L37-L40) — eve_types.id integer
- [`src/data/eve-data/queries.ts:95-104`](../../src/data/eve-data/queries.ts#L95-L104) — getTypeNames inArray(eveTypes.id, ids)
- [`src/app/api/eve/type-names/route.ts:13-22`](../../src/app/api/eve/type-names/route.ts#L13-L22) — only the schema stands between the body and the int4 query
- [`src/transport/route-id.ts:1-4`](../../src/transport/route-id.ts#L1-L4) — /^\d+$/ accepts 0, leading zeros, > int4
- [`src/transport/route-id.test.ts:5-8`](../../src/transport/route-id.test.ts#L5-L8) — currently asserts parseNumericRouteId('0') === 0; must change
- [`src/app/(site)/sites/[id]/opengraph-image.tsx:13-18`](../../src/app/%28site%29/sites/[id]/opengraph-image.tsx#L13-L18) — unbounded id passed to getPricedSiteDetail
- [`src/features/wormhole-sites/queries.ts:323-327, 395-403`](../../src/features/wormhole-sites/queries.ts#L323-L327) — eq(sites.id, id) on a serial column
- [`src/proxy.ts:9-15`](../../src/proxy.ts#L9-L15) — gate regex matches /sites/<id> only
- [`src/app/(site)/industry/[id]/page.tsx:75-80`](../../src/app/%28site%29/industry/[id]/page.tsx#L75-L80) — missed: unbounded id passed to getBlueprintStructure
- [`src/data/eve-data/queries.ts:221-231`](../../src/data/eve-data/queries.ts#L221-L231) — getBlueprintOutput filters industryBlueprints.blueprintTypeId / eveTypes.id (int4)
- [`src/app/(site)/sites/[id]/page.tsx:126-128`](../../src/app/%28site%29/sites/[id]/page.tsx#L126-L128) — third parseNumericRouteId consumer (proxy-gated)
- [`src/features/wormhole-sites/api-contract.ts:102-110`](../../src/features/wormhole-sites/api-contract.ts#L102-L110) — POSTGRES_SERIAL_MAX plus the correct /^[1-9]\d*$/ to int4 path parser; becomes the shared pathIdParamSchema
- [`src/features/industry-planner/api-contract.ts:23, 43-46, 79-81, 102-104, 131-133, 164-166`](../../src/features/industry-planner/api-contract.ts#L23) — local PG_INT4_MAX plus 5 inline int4 id schemas; skillLevels characterId wrongly int4
- [`src/features/custom-structures/api-contract.ts:11, 18, 125-130`](../../src/features/custom-structures/api-contract.ts#L11) — local PG_INT4_MAX and typeId; structureId .int().positive().safe() (redundant .safe())
- [`src/features/owned-structures/api-contract.ts:37-43`](../../src/features/owned-structures/api-contract.ts#L37-L43) — local PG_INT4_MAX for rigTypeIds
- [`src/data/market-history/api-contract.ts:6-13`](../../src/data/market-history/api-contract.ts#L6-L13) — PG_INT4_MAX copy plus typeIds array
- [`src/data/market-prices/api-contract.ts:6-13`](../../src/data/market-prices/api-contract.ts#L6-L13) — identical constant and schema
- [`src/data/maps/api-contract.ts:14, 82, 113, 176, 193, 198, 275`](../../src/data/maps/api-contract.ts#L14) — characterIdSchema re-spelled at 82, 176 (ownerId), 275; systemIdSchema at 113
- [`src/db/auth-schema.ts:18`](../../src/db/auth-schema.ts#L18) — character ids are bigint, so skillLevels' int4 cap is wrong (also features/skill-queue/schema.ts:5)
- [`convex/lib/mapEntityContracts.ts:234-236`](../../convex/lib/mapEntityContracts.ts#L234-L236) — isPositiveId; callers at 281, 296 and convex/lib/mapSystemLookup.ts:4-7
- [`src/data/wh-observations/queries.ts:53-55`](../../src/data/wh-observations/queries.ts#L53-L55) — validSolarSystemId copy
- [`src/mapper/tracking/doorbell-model.ts:145-152`](../../src/mapper/tracking/doorbell-model.ts#L145-L152) — same predicate, applied to expiresAt (not an id), so the shared name must be generic
- [`src/features/search-recents/storage.ts:41-45`](../../src/features/search-recents/storage.ts#L41-L45) — inline copy
- [`src/data/eve-data/entity-names.ts:29`](../../src/data/eve-data/entity-names.ts#L29) — Number.isInteger variant
- [`src/data/eve-data/names-client.ts:10-15`](../../src/data/eve-data/names-client.ts#L10-L15) — Number.isInteger in the cached branch; uncached branch (entity names, use-entity-names.ts:7-10) unfiltered

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/auth/api-contract.ts:13, 42, 46, 95, 115, 158`](../../src/platform/auth/api-contract.ts#L13) — `.int().positive()` is already safe-bounded in zod 4.5.4, and these are bigint ids, so there is no drift. Adopting positiveIdSchema is optional. Lines 18 (expiresAt) and 65-88 (z.coerce form fields from their own forms) are out of scope.
- [`src/features/owned-structures/api-contract.ts:40-41`](../../src/features/owned-structures/api-contract.ts#L40-L41) — corporationId/structureId are safe-bounded by .int() and are bigint ids. Not drift.
- [`convex/httpJump.ts:12, 42-44, 84, 90`](../../convex/httpJump.ts#L12) — Safe-bounded by .int(). Convex numbers have no int4 column. P246's shared contracts cover these.
- [`src/data/wh-statics/api-contract.ts:36-38`](../../src/data/wh-statics/api-contract.ts#L36-L38) — z.coerce accepts '0x10'/'1e3', but the id is only used for an in-memory find (statics/[systemId]/route.ts:14-21), so this is harmless.
- [`src/data/wh-statics/lineage.ts:20-28`](../../src/data/wh-statics/lineage.ts#L20-L28) — Parse-and-throw with line context is a different contract. It may call the predicate internally, but nothing gets deleted.
- [`src/lib/problem.ts:22`](../../src/lib/problem.ts#L22) — retryAfterSeconds is not an id; it counts toward the 79 but is out of scope

</details>

**Home.** `src/lib/id-schemas.ts (new, imports only zod)`

**Boundary check.** Zone lib may import only config, and the module imports only zod; lib already uses zod in env.ts, problem.ts and preferences.ts. Every consumer zone may import lib:
- transport (route-id.ts): from:transport allows lib.
- data/* (eve-data, maps, market-*, wh-observations): from:data allows lib.
- features/* (industry-planner, custom-structures, owned-structures, wormhole-sites, search-recents): from:features allows lib.
- mapper (doorbell-model): from:mapper allows lib.
- convex (mapEntityContracts, mapSystemLookup): from:convex allows lib.
- runtime (proxy.ts, via transport): from:runtime allows transport and lib.
- app (OG image, industry page): from:app allows transport and lib.
The earlier src/transport/ids.ts option stays rejected because convex may not import transport.

**API sketch.**

```ts
// src/lib/id-schemas.ts
export const PG_INT4_MAX = 2_147_483_647;
/** Positive safe integer (zod 4 .int() is already safe-bounded): character, corporation, alliance, structure, item ids (bigint columns). */
export const positiveIdSchema = z.number().int().positive();
/** Postgres integer/serial ids: type, system, blueprint, site rows. */
export const int4IdSchema = positiveIdSchema.max(PG_INT4_MAX);
/** Route segment: no sign, no leading zero, no exponent/hex, int4-bounded. */
export const pathIdParamSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(int4IdSchema);
export function isPositiveSafeInteger(value: number): boolean; // Number.isSafeInteger(value) && value > 0

// src/transport/route-id.ts
export function parseNumericRouteId(raw: string): number | null { const r = pathIdParamSchema.safeParse(raw); return r.success ? r.data : null; }
```

**Migration steps.**

1. Create src/lib/id-schemas.ts with PG_INT4_MAX, positiveIdSchema, int4IdSchema, pathIdParamSchema and isPositiveSafeInteger, plus src/lib/id-schemas.test.ts.
2. Fix the user-reachable 500s first:
- typeNamesRequestSchema (eve-data/api-contract.ts:27-29) becomes z.array(int4IdSchema).min(1).max(TYPE_NAMES_MAX_IDS). Leave entityNamesRequestSchema on positiveIdSchema, because entity ids may exceed int4.
- parseNumericRouteId (transport/route-id.ts:1-4) becomes pathIdParamSchema.safeParse. This covers the proxy, the site page, the OG image and the industry page together.
- Update route-id.test.ts:7: '0' now returns null. Add cases for '0123', '2147483648', '1e3' and '0x10'.
3. wormhole-sites/api-contract.ts:102-110: replace siteIdParamSchema's body with `id: pathIdParamSchema` and delete POSTGRES_SERIAL_MAX.
4. Delete the local PG_INT4_MAX copies and use int4IdSchema in:
- industry-planner/api-contract.ts:23,44,45,80,103,132;
- custom-structures/api-contract.ts:11,18;
- owned-structures/api-contract.ts:37,42;
- market-history/api-contract.ts:6,10;
- market-prices/api-contract.ts:6,10.
Keep the per-contract .min/.max list bounds inline.
5. In industry-planner/api-contract.ts:164-166, change skillLevelsRequestSchema.characterId to positiveIdSchema, because the character column is bigint.
6. In data/maps/api-contract.ts:
- Replace the local characterIdSchema (14) with positiveIdSchema and use it at 82, 176 and 275.
- systemIdSchema (113) may become int4IdSchema.
- Drop the redundant .safe() calls while touching these lines.
7. Runtime predicate:
- Delete convex isPositiveId (mapEntityContracts.ts:234-236) and import isPositiveSafeInteger at mapEntityContracts.ts:281/296 and mapSystemLookup.ts:4-7.
- Replace the copies at wh-observations/queries.ts:53-55, doorbell-model.ts:150-152 and search-recents/storage.ts:44.
- In entity-names.ts:29 and names-client.ts:13, switch to isPositiveSafeInteger, and apply the filter in names-client's uncached branch too (both branches of normalize).
8. Optional and cosmetic: platform/auth body ids may adopt positiveIdSchema. Leave its z.coerce form schemas alone.

**Tests.** New:
- src/lib/id-schemas.test.ts: 0, -1, 1.5 and 2^53 are rejected. 2^31-1 is accepted by int4IdSchema and 2^31 is rejected. pathIdParamSchema rejects '0', '0123', '1e3', '0x10', ' 7' and '2147483648'.

Updates:
- src/transport/route-id.test.ts: the '0' case becomes null.
- src/app/api/eve/type-names/route.test.ts: an oversized id returns 400.

Existing guards:
- src/proxy.test.ts and src/proxy-coverage.test.ts: the gate's behavior for unpublished and malformed ids.
- src/app/(site)/sites/[id]/page.test.ts.
- src/data/eve-data/names-client.test.ts and entity-names.test.ts: the filter in both branches.
- src/app/api/api-contracts.test.ts.
- convex map entity validation tests for isPositiveId callers.

**Notes.** In zod 4.5.4, `.int()` already rejects unsafe integers, so do not add `.safe()`. It is an alias of `.int()`.

Tightening parseNumericRouteId changes which URLs resolve:
- /sites/0123 and /industry/0123 become 404, which is correct because they are non-canonical duplicates.
- /sites/0 already 404s.
- Oversized ids become 404 instead of 500.

Lead, not part of this finding: /sites/<id>/opengraph-image does not apply isPublishedWormholeSiteId (proxy.ts:9-15 only gates /sites/<id>), so it renders OG cards for unpublished sites.

The doorbell-model predicate checks expiresAt, so the shared helper keeps the generic name isPositiveSafeInteger rather than isEveId.

The idListSchema and formIdSchema from the original proposal are dropped: the market typeIds lists are one line each with different max constants, and the coerce form ids are harmless.

<sub>Reported by: area:data-eve, area:data-services, area:features-sites-misc, area:industry-planner, concern:contracts-types, dupes-triage-1, dupes-triage-2.</sub>

<a id="p248"></a>

## P248: Validate public map ids as UUIDs in data/maps/api-contract.ts; optionally share the owned-row text-id bound

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -2 / +2 in source; about 15 test fixture string changes. The optional ownedRowIdSchema adds about -5 / +3.
- **Depends on:** —
- **Existing primitive:** `src/lib/db-columns.ts:ownedRowIdentityColumns; src/data/maps/api-contract.ts:mapLifecycleRequestSchema (already uses z.uuid())`

**Problem.** maps.id is a Postgres uuid (data/maps/schema.ts:42), and mapLifecycleRequestSchema already uses z.uuid(). Every other public map contract uses `mapIdSchema = z.string().trim().min(1).max(200)`: access, signature-elimination, jump, block and unblock, plus the create response. On /api/maps/access a malformed mapId reaches the `value::uuid` cast or the `maps.id = ${mapId}` comparison and fails with a 500 instead of a 400.

Separately, the owned-row text-id bound z.string().min(1).max(100) is written 5 times. custom-structures still uses the deprecated z.string().uuid() for createdId.

**Verifier revision.** The map-id drift is real and has a concrete effect. data/maps/api-contract.ts validates mapId as any trimmed string up to 200 characters, while maps.id is a uuid. On /api/maps/access, applyAuthorizedMapGrantChange either casts it (`value::uuid`, authorization-sql.ts:59-61) or compares it to maps.id (queries.ts:525). A non-UUID mapId therefore raises Postgres 22P02, a 500 instead of a 400. The jump and elimination routes reach Convex first and return canEdit:false, so they do not 500. The design changes in three ways. (1) No new lib home is needed: the public map-id schema has one consumer module, so fix the local mapIdSchema and reuse it for mapLifecycleRequestSchema. (2) Do not require UUIDs at the Convex doors: Convex stores mapId as an opaque string, Next forwards only validated or Postgres-sourced ids, and Convex tests use 'map-a'/'map-1' fixtures throughout. Convex only needs consistent .min(1), which P246 covers. (3) ownedRowIdSchema is a one-line dedupe of `z.string().min(1).max(100)` over 5 sites with no bug, because owned-row ids are text columns. It is optional and belongs in P247's lib module, not db-columns.ts, which imports drizzle pg-core while lib/preferences.ts runs on the client.

**Sites (11).**

- [`src/data/maps/api-contract.ts:5-6, 57, 115-118, 180-199, 221, 271-287`](../../src/data/maps/api-contract.ts#L5-L6) — loose mapIdSchema used by elimination, access (upsert/revoke/block/unblock), jump and the create response; lifecycle already uses z.uuid()
- [`src/data/maps/schema.ts:39-42`](../../src/data/maps/schema.ts#L39-L42) — maps.id uuid('id').defaultRandom()
- [`src/data/maps/queries.ts:509-529`](../../src/data/maps/queries.ts#L509-L529) — revoke path: SELECT ... WHERE maps.id = ${mapId} FOR UPDATE
- [`src/data/maps/authorization-sql.ts:47-61`](../../src/data/maps/authorization-sql.ts#L47-L61) — upsert path: requested map ids cast with value::uuid
- [`src/composition/map-access-update.ts:41-56`](../../src/composition/map-access-update.ts#L41-L56) — input.mapId flows to the SQL unchecked
- [`src/app/api/maps/access/route.ts:22-27`](../../src/app/api/maps/access/route.ts#L22-L27) — only the schema guards the body
- [`src/features/custom-structures/api-contract.ts:62, 70-72, 85-87`](../../src/features/custom-structures/api-contract.ts#L62) — deprecated z.string().uuid() createdId; id string(1..100) twice
- [`src/features/industry-planner/api-contract.ts:241`](../../src/features/industry-planner/api-contract.ts#L241) — savedPlanId copy
- [`src/features/industry-planner/profiles/api-contract.ts:5`](../../src/features/industry-planner/profiles/api-contract.ts#L5) — profileId copy
- [`src/lib/preferences.ts:33-37`](../../src/lib/preferences.ts#L33-L37) — missed: industry.profileId preference uses the same bound (nullable)
- [`src/app/api/account/custom-structures/route.ts:38-41`](../../src/app/api/account/custom-structures/route.ts#L38-L41) — createdId comes from randomUUID(), so z.uuid() accepts it

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/httpMapAccess.ts:13, 46, 50, 54`](../../convex/httpMapAccess.ts#L13) — Convex keys mapId as an opaque string with no uuid column, and its tests use non-UUID fixtures. Only align line 13 to .min(1) (P246).
- [`convex/httpJump.ts:11, 17, 41, 53, 59, 83, 89`](../../convex/httpJump.ts#L11) — Same reason: Convex-internal, already min(1).
- [`src/composition/jump-resolver/resolver.ts:102-118`](../../src/composition/jump-resolver/resolver.ts#L102-L118) — Jump and elimination send mapId to Convex first. A bad id returns canEdit:false, so no 500 here; the fix is consistency only.
- [`src/features/industry-planner/profiles/profile-document.ts:29`](../../src/features/industry-planner/profiles/profile-document.ts#L29) — Facility id (structure or station id), not an owned-row id.
- [`src/lib/db-columns.ts:23-31`](../../src/lib/db-columns.ts#L23-L31) — Not a valid home: it imports drizzle pg-core, and lib/preferences.ts is client code.

</details>

**Home.** `src/data/maps/api-contract.ts (existing local mapIdSchema; no new module). Optional ownedRowIdSchema goes in src/lib/id-schemas.ts from P247.`

**Boundary check.** mapIdSchema stays private to src/data/maps/api-contract.ts (zone data/maps), whose only importers are app/api routes (from:api allows data), features/maps clients (from:features allows data) and composition (from:composition allows data). The optional ownedRowIdSchema lives in src/lib/id-schemas.ts (zone lib). Its consumers are features/custom-structures and features/industry-planner (from:features allows lib) and src/lib/preferences.ts (lib to lib).

**API sketch.**

```ts
// src/data/maps/api-contract.ts
const mapIdSchema = z.uuid();
export const mapLifecycleRequestSchema = z.strictObject({ mapId: mapIdSchema });

// optional, src/lib/id-schemas.ts
export const OWNED_ROW_ID_MAX = 100;
export const ownedRowIdSchema = z.string().min(1).max(OWNED_ROW_ID_MAX);
```

**Migration steps.**

1. In src/data/maps/api-contract.ts:5, change mapIdSchema to z.uuid() and use it in mapLifecycleRequestSchema (221). Leave connectionIdSchema (6) alone: those are Convex document ids.
2. Update the fixtures that go through the schema to UUIDs (e.g. the existing '11111111-1111-4111-8111-111111111111' pattern):
- route tests: src/app/api/maps/{access,jump,signature-elimination,create}/route.test.ts;
- src/features/maps/map-creation-client.test.ts (it decodes createMapResponseSchema);
- any api-contracts test cases.
Composition tests that call functions directly with 'map-1' bypass the schema and need no change.
3. In custom-structures/api-contract.ts:62, replace z.string().uuid() with z.uuid().
4. Optional, after P247: add ownedRowIdSchema to src/lib/id-schemas.ts and use it at custom-structures/api-contract.ts:71 and 86, industry-planner/api-contract.ts:241, profiles/api-contract.ts:5 and preferences.ts:36 (.nullable()). Do not tighten these to UUIDs: the columns are text and older rows may not be UUIDs.

**Tests.** Add an api-contract case (src/app/api/api-contracts.test.ts or src/app/api/maps/access/route.test.ts): a non-UUID mapId returns 400 invalid_body without reaching applyMapAccessUpdate.

Existing guards:
- src/app/api/maps/lifecycle-routes.test.ts (already UUID).
- src/data/maps/queries.db.test.ts.
- src/features/maps/map-access-client.test.ts and map-creation-client.test.ts.
- composition/map-access-update.test.ts.

**Notes.** z.uuid() in zod 4 enforces the RFC variant. randomUUID() and gen_random_uuid() v4 ids pass, and the existing lifecycle tests already use v4-shaped fixtures.

The UI never sends malformed ids, so the user-visible effect is limited to 500s turning into 400s for crafted requests and to cleaner error telemetry.

Owned-row ids are also randomUUID() today (custom-structures route.ts:38, saved-plans route.ts:54, profile-writes.ts:23), but they live in text columns. Keep the loose bound so existing rows stay addressable.

The ownedRowIdSchema part depends on P247's module existing; the map-id fix is independent.

<sub>Reported by: concern:contracts-types.</sub>

<a id="p187"></a>

## P187: Move EVE_SCOPES into src/config/eve-scopes.ts with an EveScope type, type every sync scope list against it, and gloss every requested scope

- **Status:** [ ] not started
- **Category:** esi-sync · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About +15/-30. The new config file is mostly a move (about 30 lines). The 6 glosses and the legacy split add about 12, and the satisfies annotations add about 15. The four stale comments remove about 25.
- **Depends on:** —
- **Existing primitive:** `src/platform/auth/eve-sso-constants.ts:EVE_SCOPES; src/platform/auth/corp-roles.ts:CorpRole`

**Problem.** EVE_SCOPES lives in platform/auth/eve-sso-constants.ts with no exported EveScope type. data/location-tracking and data/corp-holdings cannot reference it, because data may not import platform/auth.

The nine per-dataset scope tuples are bare string literals: skills, jobs, corp jobs, assets, corp assets, blueprints, corp blueprints, corp structures and location. So are corp-viewer's ROLES_SCOPE and structure-search's list. Nothing at compile time ties them to what sign-in requests, and only the sheet sections and corp context have runtime membership tests. A literal that is not requested reads as 'granted', because missingScopes contains only EVE_SCOPES members. The sync then runs and fails at ESI; this is the PR #83 class of bug, which the stale comments claim is already guarded.

scope-health's SCOPE_GLOSS is Record<string, string> and has no gloss for 6 requested scopes, so the settings page lists them without a description.

**Verifier revision.** The scope half is real and verified:
- EVE_SCOPES (platform/auth) exports no EveScope type.
- The data zone may not import platform/auth.
- The four comments in features that claim a 'feature -> feature edge' or 'pinned ∈ EVE_SCOPES by the co-located test' are false. features may import platform/auth, and owned-assets itself does so in production (asset-map.ts:2, queries.ts:11). The co-located tests only `toEqual` literals.
- Only sheet sections and corp context have membership tests, so 9 scope tuples rely on literal pins alone.
- SCOPE_GLOSS lacks exactly the 6 named active scopes, and GrantedScopesList renders a bare id without one, so the gap is user-visible.

The corp-role half is rejected. CorpRole is the visibility subset (VISIBILITY_ROLES, narrowed by narrowCorpRoles), not the ESI corp-role vocabulary. Typing REQUIRED_ROLES as CorpRole would force any future gate role that does not affect visibility into the visibility set and change narrowCorpRoles' semantics; renaming it EVE_CORP_ROLES would mislabel it. Feature-side role typos are already pinned by literal tests.

Home change: a dedicated src/config/eve-scopes.ts, not config/esi.ts. esi.ts documents ESI request posture; the character-roles.ts tuple-plus-type file is the precedent to follow.

**Sites (26).**

- [`src/platform/auth/eve-sso-constants.ts:10, 14-37`](../../src/platform/auth/eve-sso-constants.ts#L10) — EVE_CHARACTER_SEARCH_SCOPE and EVE_SCOPES `as const`; no EveScope type
- [`src/platform/auth/scope-health.ts:1, 23-46, 50-69`](../../src/platform/auth/scope-health.ts#L1) — deriveScopeHealth takes required: readonly string[]. SCOPE_GLOSS has no gloss for esi-characters.read_blueprints, esi-corporations.read_blueprints, esi-assets.read_assets, esi-assets.read_corporation_assets, esi-corporations.read_structures or esi-search.search_structures. It also holds 2 legacy keys (manage_planets, read_standings) that are not in EVE_SCOPES.
- [`src/components/composition/account/GrantedScopesList.tsx:17-18`](../../src/components/composition/account/GrantedScopesList.tsx#L17-L18) — renders the gloss only when present, so missing glosses are user-visible
- [`src/features/owned-assets/sync-eligibility.ts:1-7`](../../src/features/owned-assets/sync-eligibility.ts#L1-L7) — false comment: says the co-located test pins EVE_SCOPES membership and that an EVE_SCOPES import is a feature->feature edge
- [`src/features/owned-assets/corp-sync-eligibility.ts:1-12`](../../src/features/owned-assets/corp-sync-eligibility.ts#L1-L12) — same false comment
- [`src/features/owned-blueprints/corp-sync-eligibility.ts:1-11`](../../src/features/owned-blueprints/corp-sync-eligibility.ts#L1-L11) — same false comment
- [`src/features/owned-structures/corp-sync-eligibility.ts:1-11`](../../src/features/owned-structures/corp-sync-eligibility.ts#L1-L11) — same false comment
- [`src/features/owned-assets/asset-map.ts:2`](../../src/features/owned-assets/asset-map.ts#L2) — the same feature already imports platform/auth in production, which disproves the comment
- [`src/features/owned-assets/corp-sync-eligibility.test.ts:8-17`](../../src/features/owned-assets/corp-sync-eligibility.test.ts#L8-L17) — pins literals only; no EVE_SCOPES membership check
- [`src/features/owned-structures/corp-sync-eligibility.test.ts:16-26`](../../src/features/owned-structures/corp-sync-eligibility.test.ts#L16-L26) — pins literals only
- [`src/features/character-sheet/sections.test.ts:24`](../../src/features/character-sheet/sections.test.ts#L24) — one of only two runtime membership checks
- [`src/composition/sync/corp-context-sync.test.ts:5-11`](../../src/composition/sync/corp-context-sync.test.ts#L5-L11) — the other membership check
- [`src/features/skill-queue/sync-eligibility.ts:1-4`](../../src/features/skill-queue/sync-eligibility.ts#L1-L4) — literal tuple
- [`src/features/industry-jobs/sync-eligibility.ts:1`](../../src/features/industry-jobs/sync-eligibility.ts#L1) — literal tuple
- [`src/features/industry-jobs/corp-sync-eligibility.ts:1-4`](../../src/features/industry-jobs/corp-sync-eligibility.ts#L1-L4) — literal tuple
- [`src/features/owned-blueprints/sync-eligibility.ts:1`](../../src/features/owned-blueprints/sync-eligibility.ts#L1) — literal tuple
- [`src/features/character-sheet/sections.ts:22-23, 57-93`](../../src/features/character-sheet/sections.ts#L22-L23) — WALLET_SCOPE literal; PUBLIC_ENDPOINT_SCOPES explicitly widened to readonly string[]; per-section literal scopes
- [`src/features/character-sheet/types.ts:160, 167`](../../src/features/character-sheet/types.ts#L160) — spec scopes: readonly string[]
- [`src/features/character-sheet/sync-eligibility.ts:4-10`](../../src/features/character-sheet/sync-eligibility.ts#L4-L10) — SHEET_SECTION_SCOPES typed Record<SheetSectionKey, readonly string[]>
- [`src/data/location-tracking/sync-eligibility.ts:1-5`](../../src/data/location-tracking/sync-eligibility.ts#L1-L5) — data zone, so it cannot import platform/auth
- [`src/data/corp-holdings/context-sync.ts:24-30`](../../src/data/corp-holdings/context-sync.ts#L24-L30) — data zone literal tuple
- [`src/composition/corp-viewer.ts:34`](../../src/composition/corp-viewer.ts#L34) — ROLES_SCOPE literal
- [`src/composition/structure-search.ts:11`](../../src/composition/structure-search.ts#L11) — mutable string[] mixing the constant with a literal
- [`src/composition/map-character-search.ts:81`](../../src/composition/map-character-search.ts#L81) — deriveScopeHealth call; would be typed through the parameter
- [`src/composition/board/board-assemble.ts:98-108`](../../src/composition/board/board-assemble.ts#L98-L108) — GAP_SCOPES Record<BoardGap, readonly string[]>
- [`src/platform/auth/panel-character.ts:44-47`](../../src/platform/auth/panel-character.ts#L44-L47) — toAccountCharacter scopes params readonly string[]

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/auth/corp-roles.ts:3-20`](../../src/platform/auth/corp-roles.ts#L3-L20) — VISIBILITY_ROLES/CorpRole is the visibility subset that narrowCorpRoles filters to, not the ESI role vocabulary. Typing gate REQUIRED_ROLES with it would couple gate roles to visibility semantics. The corp-role part is dropped.
- [`src/composition/corp-role-gates.ts:10-14, 32-34`](../../src/composition/corp-role-gates.ts#L10-L14) — requiredRoles: readonly string[] stays, for the same reason.
- [`src/platform/auth/scope-health.ts:60-61`](../../src/platform/auth/scope-health.ts#L60-L61) — The legacy manage_planets and read_standings glosses are not EveScopes. They move to a separate legacy map instead of being typed.

</details>

**Home.** `src/config/eve-scopes.ts (new): EVE_CHARACTER_SEARCH_SCOPE, EVE_SCOPES and export type EveScope = (typeof EVE_SCOPES)[number]. src/platform/auth/eve-sso-constants.ts re-exports both constants so existing importers keep working.`

**Boundary check.** config zone; the rule {from: config, allow: []} is satisfied because the file imports nothing. Every consumer zone may import config:
- platform/auth ({from: platform/auth} allows config): scope-health, eve-sso, auth.ts.
- data ({from: data} allows config): location-tracking, corp-holdings.
- features ({from: features} allows config).
- composition ({from: composition} allows config).
- app and api (both allow config).
- lib ({from: lib, allow: [config]}): lets P186's hasScopes type its parameter as EveScope.

convex does not read scopes. It cannot import config, but it can reach the constants through platform/auth, which it may import. platform/owner-sync (allow: [platform/esi]) never sees scopes. Precedent: src/config/character-roles.ts holds CHARACTER_ROLES with its CharacterRole type.

**API sketch.**

```ts
// src/config/eve-scopes.ts
export const EVE_CHARACTER_SEARCH_SCOPE = 'esi-search.search_structures.v1';
export const EVE_SCOPES = [ /* same 22 entries, same order */ ] as const;
export type EveScope = (typeof EVE_SCOPES)[number];

// consumers
export const SKILL_SYNC_SCOPES = ['esi-skills.read_skills.v1', 'esi-skills.read_skillqueue.v1'] as const satisfies readonly EveScope[];
const SCOPE_GLOSS = { publicData: '...', /* every EveScope */ } as const satisfies Record<EveScope, string>;
const LEGACY_SCOPE_GLOSS: Readonly<Record<string, string>> = { 'esi-planets.manage_planets.v1': '...', 'esi-characters.read_standings.v1': '...' };
export function deriveScopeHealth(c: {...}, required: readonly EveScope[]): CharacterHealth;
```

**Migration steps.**

1. Create src/config/eve-scopes.ts with EVE_CHARACTER_SEARCH_SCOPE, EVE_SCOPES (same order) and EveScope. In platform/auth/eve-sso-constants.ts, delete the two declarations and add `export { EVE_CHARACTER_SEARCH_SCOPE, EVE_SCOPES } from '@/config/eve-scopes'`, so eve-sso.ts's re-export, structure-search, map-character-search and the tests keep resolving. Optionally point scope-health.ts at config directly.
2. In scope-health.ts, type deriveScopeHealth's `required` as readonly EveScope[]. Split SCOPE_GLOSS into `satisfies Record<EveScope, string>` plus a LEGACY_SCOPE_GLOSS for the 2 legacy ids, and make describeScope look up both. Write the 6 missing glosses; the copy needs product input.
3. Add `as const satisfies readonly EveScope[]` to every scope tuple:
- SKILL_SYNC_SCOPES
- INDUSTRY_JOBS_SYNC_SCOPES
- CORP_INDUSTRY_JOBS_SYNC_SCOPES
- ASSETS_SYNC_SCOPES
- CORP_ASSETS_SYNC_SCOPES
- BLUEPRINTS_SYNC_SCOPES
- CORP_BLUEPRINTS_SYNC_SCOPES
- CORP_STRUCTURES_SYNC_SCOPES
- LOCATION_SYNC_SCOPES (data)
- CORP_CONTEXT_SYNC_SCOPES (data)
Type corp-viewer's ROLES_SCOPE as EveScope and structure-search's STRUCTURE_SEARCH_SCOPES as `[...] as const satisfies readonly EveScope[]`.
4. Retype the remaining scope fields:
- character-sheet types.ts:160,167 `scopes: readonly EveScope[]`, and drop the `readonly string[]` widening in sections.ts:23.
- SHEET_SECTION_SCOPES as Record<SheetSectionKey, readonly EveScope[]>.
- GAP_SCOPES as Record<BoardGap, readonly EveScope[]>.
- toAccountCharacter's scopes parameters.
5. If P186 has landed, change hasScopes/scopeEligibility to take readonly EveScope[]; lib may import config.
6. Delete the four stale header comments in owned-assets/sync-eligibility.ts, owned-assets/corp-sync-eligibility.ts, owned-blueprints/corp-sync-eligibility.ts and owned-structures/corp-sync-eligibility.ts. Keep the useful domain note about which ESI group each read lives under.

**Tests.** Typecheck is the primary guard: a literal outside EVE_SCOPES no longer compiles.

Add to src/platform/auth/scope-health.test.ts: every EVE_SCOPES id gets a gloss from listGrantedScopes, and the legacy ids keep their glosses with status 'legacy'.

Keep:
- src/platform/auth/eve-sso.test.ts, which pins the order and the read-only rule.
- src/platform/auth/scope-health.test.ts.
- the literal pins in the features/*/sync-eligibility tests.

sections.test.ts:24 and corp-context-sync.test.ts:5-11 become redundant with the types but are harmless to keep.

**Notes.** Preserve the EVE_SCOPES order exactly: listGrantedScopes orders active scopes by it, and eve-sso.test pins it.

'esi-characters.read_corporation_roles.v1' is written by hand in 6 production places outside the constant and gloss files: corp-viewer, context-sync and 4 corp-sync-eligibility files. The satisfies checks cover all of them without a named constant.

The gloss copy for the 6 scopes is a product decision; the type change forces it to exist.

This pairs with P186: typing the lib predicate's parameter makes every canSyncX vocabulary-checked at the primitive. Either can land first.

<sub>Reported by: concern:contracts-types.</sub>

<a id="p350"></a>

## P350: Turn corp-context-sync.test.ts into a table-driven EVE_SCOPES membership test for every sync scope set, then delete the scope pins

- **Status:** [ ] not started
- **Category:** testing · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -50 lines (9 pin blocks and one file) and +15 lines (table)
- **Depends on:** [P187](#p187)
- **Existing primitive:** `src/composition/sync/corp-context-sync.test.ts membership pattern`

**Problem.** Every per-feature sync scope set is pinned only to itself: owned-assets, corp-assets, corp-structures, industry-jobs, corp-industry-jobs, blueprints, corp-blueprints, skill-queue and location. The real risk is a sync that demands a scope sign-in never requests (the PR #83 lesson), and only CORP_CONTEXT_SYNC_SCOPES (src/composition/sync/corp-context-sync.test.ts) and the SHEET_SECTIONS scopes (src/features/character-sheet/sections.test.ts) are checked against EVE_SCOPES. Four production comments claim a co-located EVE_SCOPES pin that does not exist, and give a boundary reason that is no longer true.

**Verifier revision.** The core holds. Nine test files carry 13 constant-to-self pins, which testing-principles.md lines 57-60 call tautological: 9 scope pins and 4 REQUIRED_ROLES pins. The four 'Pinned ∈ EVE_SCOPES by the co-located test' comments are false, because none of those tests imports EVE_SCOPES. Five design points change.
1. Don't add a new file. composition/sync/corp-context-sync.test.ts already is exactly this membership test, and it never imports corp-context-sync.ts, so rename and extend it.
2. character-sheet/sync-eligibility.test.ts is not the model to copy. It loops the same constant that canSyncSection reads, which is the 'identity predicate' form in testing-principles.md lines 53-56. The existing literal canSyncX tables are the independent oracle; keep them as they are.
3. The 4 role pins are not replaced by an EVE_SCOPES test. Handle them separately.
4. The comments also claim that importing EVE_SCOPES would be a feature→feature edge. That is stale: EVE_SCOPES lives in src/platform/auth/eve-sso-constants.ts, which features may import, and features/character-sheet/sections.test.ts:6 already does.
5. sections.test.ts 22-29 already gives SHEET_SECTIONS and LOCATION_SYNC_SCOPES membership coverage. The finders missed it.

**Sites (17).**

- [`src/composition/sync/corp-context-sync.test.ts:1-12`](../../src/composition/sync/corp-context-sync.test.ts#L1-L12) — Correct membership test for CORP_CONTEXT_SYNC_SCOPES only. It never imports corp-context-sync.ts, so it is effectively the sync-scopes test under the wrong name
- [`src/features/character-sheet/sections.test.ts:6, 22-29`](../../src/features/character-sheet/sections.test.ts#L6) — Membership for every SHEET_SECTIONS scope, plus status.scopes equal to LOCATION_SYNC_SCOPES, so location is already covered. Shows features may import platform/auth. Missed by the finders
- [`src/features/owned-assets/sync-eligibility.test.ts:4-9, 11-20`](../../src/features/owned-assets/sync-eligibility.test.ts#L4-L9) — Scope pin (delete); literal canSyncAssets table (keep: independent oracle)
- [`src/features/owned-assets/corp-sync-eligibility.test.ts:8-17`](../../src/features/owned-assets/corp-sync-eligibility.test.ts#L8-L17) — Scope pin plus a CORP_ASSETS_REQUIRED_ROLES pin in the same it()
- [`src/features/owned-structures/corp-sync-eligibility.test.ts:16-26`](../../src/features/owned-structures/corp-sync-eligibility.test.ts#L16-L26) — Loop over the declared scopes, plus scope pin and roles pin in one it()
- [`src/features/industry-jobs/sync-eligibility.test.ts:4-9`](../../src/features/industry-jobs/sync-eligibility.test.ts#L4-L9) — Scope pin
- [`src/features/industry-jobs/corp-sync-eligibility.test.ts:8-17`](../../src/features/industry-jobs/corp-sync-eligibility.test.ts#L8-L17) — Scope pin plus roles pin
- [`src/features/owned-blueprints/sync-eligibility.test.ts:4-9`](../../src/features/owned-blueprints/sync-eligibility.test.ts#L4-L9) — Scope pin
- [`src/features/owned-blueprints/corp-sync-eligibility.test.ts:8-17`](../../src/features/owned-blueprints/corp-sync-eligibility.test.ts#L8-L17) — Scope pin plus roles pin
- [`src/features/skill-queue/sync-eligibility.test.ts:4-12`](../../src/features/skill-queue/sync-eligibility.test.ts#L4-L12) — Scope pin
- [`src/data/location-tracking/sync-eligibility.test.ts:1-10`](../../src/data/location-tracking/sync-eligibility.test.ts#L1-L10) — The whole file is a pin. The data zone may not import platform/auth (data rule), so its membership check must live in composition
- [`src/features/owned-assets/sync-eligibility.ts:1-6`](../../src/features/owned-assets/sync-eligibility.ts#L1-L6) — False comment: claims a co-located EVE_SCOPES pin and a feature→feature edge
- [`src/features/owned-assets/corp-sync-eligibility.ts:1-8`](../../src/features/owned-assets/corp-sync-eligibility.ts#L1-L8) — Same false comment
- [`src/features/owned-structures/corp-sync-eligibility.ts:1-7`](../../src/features/owned-structures/corp-sync-eligibility.ts#L1-L7) — Same false comment
- [`src/features/owned-blueprints/corp-sync-eligibility.ts:1-7`](../../src/features/owned-blueprints/corp-sync-eligibility.ts#L1-L7) — Same false comment
- [`src/platform/auth/eve-sso-constants.ts:14-37`](../../src/platform/auth/eve-sso-constants.ts#L14-L37) — EVE_SCOPES lives in platform/auth, not in a feature
- [`docs/principles/testing-principles.md:50-67`](../../docs/principles/testing-principles.md#L50-L67) — Defines constant-to-self pins and identity predicates as tautological

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/character-sheet/sync-eligibility.test.ts:5-16`](../../src/features/character-sheet/sync-eligibility.test.ts#L5-L16) — Not the 'better form' the finders cited. It drives canSyncSection with the same SHEET_SECTIONS scopes the predicate reads (the identity-predicate pattern). The literal canSyncX tables elsewhere are the independent oracle; do not convert them to this form
- [`src/platform/auth/eve-sso.test.ts:13-39`](../../src/platform/auth/eve-sso.test.ts#L13-L39) — EVE_SCOPES pin: the least-privilege contract and the oracle every membership check relies on. Out of scope
- [`src/features/owned-assets/refresh.test.ts:141-190`](../../src/features/owned-assets/refresh.test.ts#L141-L190) — The 4 REQUIRED_ROLES pins are not covered by EVE_SCOPES membership. Refresh tests observe roles behaviorally (Director admitted, Accountant skipped) but never show Factory_Manager rejected for assets or blueprints. Deleting role pins needs those behavior cases first; separate follow-up

</details>

**Home.** `src/composition/sync/sync-scopes.test.ts (git mv of src/composition/sync/corp-context-sync.test.ts)`

**Boundary check.** The test lives in the composition zone. Its imports are @/features/{owned-assets,owned-structures,industry-jobs,owned-blueprints,skill-queue}/*sync-eligibility, @/data/location-tracking/sync-eligibility, @/data/corp-holdings/context-sync and @/platform/auth/eve-sso-constants. The composition rule allows "features", "data" and "platform/auth", and board-assemble.ts plus the existing test already make these exact edges. It cannot live in a feature, because the features rule has no "features" entry and the sets span five features. It cannot live in data, because the data rule excludes platform/auth.

**API sketch.**

```ts
const SYNC_SCOPE_SETS = { ASSETS_SYNC_SCOPES, CORP_ASSETS_SYNC_SCOPES, CORP_STRUCTURES_SYNC_SCOPES, INDUSTRY_JOBS_SYNC_SCOPES, CORP_INDUSTRY_JOBS_SYNC_SCOPES, BLUEPRINTS_SYNC_SCOPES, CORP_BLUEPRINTS_SYNC_SCOPES, SKILL_SYNC_SCOPES, LOCATION_SYNC_SCOPES, CORP_CONTEXT_SYNC_SCOPES } satisfies Record<string, readonly string[]>;
test.each(Object.entries(SYNC_SCOPE_SETS))('%s requests only scopes sign-in asks for', (name, scopes) => {
  expect(scopes.length).toBeGreaterThan(0);
  for (const scope of scopes) expect(EVE_SCOPES, `${name}: ${scope}`).toContain(scope);
});
```

**Migration steps.**

1. git mv src/composition/sync/corp-context-sync.test.ts to src/composition/sync/sync-scopes.test.ts. Replace its body with the flat table-driven test.each above, listing all 10 *_SYNC_SCOPES constants. Optionally add SHEET_SECTION_SCOPES entries; sections.test.ts already covers them.
2. Land step 1 first or in the same commit. CORP_ASSETS_SYNC_SCOPES, CORP_INDUSTRY_JOBS_SYNC_SCOPES, BLUEPRINTS_SYNC_SCOPES and CORP_BLUEPRINTS_SYNC_SCOPES have no importer outside their own pin tests. If the pins go first, Fallow's unused-exports check fails.
3. Delete the scope pins: owned-assets/sync-eligibility.test.ts 4-9; industry-jobs/sync-eligibility.test.ts 4-9; owned-blueprints/sync-eligibility.test.ts 4-9; skill-queue/sync-eligibility.test.ts 4-12; the scope lines 11-14 inside owned-assets, industry-jobs and owned-blueprints corp-sync-eligibility.test.ts; and owned-structures corp-sync-eligibility.test.ts 21-24. Delete src/data/location-tracking/sync-eligibility.test.ts entirely; its constant stays imported by sections.test.ts and the new test.
4. Keep every literal canSyncX it.each table and the owned-structures missing-scope loop at 17-19 as they are.
5. Leave the 4 REQUIRED_ROLES pins for now, keeping each as a roles-only it(). They are a separate decision: delete them only after adding refresh-test cases where a non-admitted role (for example Factory_Manager for corp assets and blueprints) is skipped.
6. Rewrite the four header comments (owned-assets/sync-eligibility.ts 1-6, owned-assets/corp-sync-eligibility.ts 1-8, owned-structures/corp-sync-eligibility.ts 1-7, owned-blueprints/corp-sync-eligibility.ts 1-7) to say 'Pinned ∈ EVE_SCOPES by src/composition/sync/sync-scopes.test.ts'. Drop the false feature→feature sentence.

**Tests.** New test: src/composition/sync/sync-scopes.test.ts, a membership check over all 10 sets. Existing guards to keep: the literal canSyncX tables in the 8 feature tests (an independent oracle; they catch a scope dropped from a constant); character-sheet/sections.test.ts 22-29; and platform/auth/eve-sso.test.ts 13-39 (the EVE_SCOPES contract). Sanity check during review: temporarily add 'esi-fake.read_x.v1' to one set and confirm the new test fails, but do not commit that change.

**Notes.** (a) The REQUIRED_ROLES pins are 4 of the 13 'pins'. An EVE_SCOPES check does not cover them. The refresh tests (owned-assets/refresh.test.ts 141-190, owned-blueprints/refresh.test.ts 151-196, owned-structures/refresh.test.ts 61-109, industry-jobs/corp-refresh.test.ts 62, 122, 209) observe some role behavior, but not every non-admitted role. Keep the role pins until those cases exist.
(b) Do not follow the finders' suggestion to model the tables on character-sheet/sync-eligibility.test.ts. Under the repo's own testing principles that form is the identity-predicate tautology. The literal tables are the better form.
(c) The registry stays hand-maintained: a new *_SYNC_SCOPES constant must be added to the table. This is no worse than today's per-file convention, and it is now one place.
(d) Related lead outside this verdict: the canSyncX predicate bodies are semantically identical across 10 production modules (dupes-grouped.txt lines 223-240 and 546-549; e.g. src/features/owned-assets/sync-eligibility.ts 9-15, src/features/skill-queue/sync-eligibility.ts 6-12, src/data/corp-holdings/context-sync.ts 39-42). A shared scope-gate primitive is a separate candidate: it would need a zone that features and data may both import, such as lib or platform/owner-sync.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p186"></a>

## P186: Replace the ten canSyncX copies with one hasScopes predicate in src/lib and one scopeHolderOf projection in platform/auth

- **Status:** [ ] not started
- **Category:** esi-sync · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -100. The predicate bodies and inline types lose about 60 lines, the truth tables about 70, and the projections about 20; the lib module, its test and the mapper add about 50.
- **Depends on:** [P187](#p187)
- **Existing primitive:** `src/platform/owner-sync/types.ts:EnumeratedOwner (structural shape only; no predicate exists yet)`

**Problem.** Ten owner-sync eligibility functions repeat `if (!c.hasRefreshToken) return false; return !SCOPES.some((s) => c.missingScopes.includes(s))`, and each re-declares the inline parameter type `{ hasRefreshToken: boolean; missingScopes: string[] }`. Eight are exported canSyncX functions in features; the others are canSyncSection and the private canSyncCorpContext in data/corp-holdings. corp-viewer's canFetchRoles and board-assemble's boardGaps run the same test inline. The function type is declared again in platform/auth/panel-character.ts:19 and in app industry-characters.ts:23. Five places build the `{hasRefreshToken, missingScopes: deriveCharacterHealth({scope, hasRefreshToken}).missingScopes}` projection by hand: owner-sync-port, board-view, industry-characters, panel-character and the eve-characters route. Every per-feature test repeats the same it.each truth table.

**Verifier revision.** The core claim holds. All 10 predicate copies are the same one-liner over a different tuple, I read each of them, and fallow groups 9 of them as near-duplicates (dupes-grouped lines 222-240). The scope and design change in four ways. (1) The holder projection needs a home in platform/auth (scope-health.ts), not composition/sync/owner-sync-port.ts. platform/auth/panel-character.ts makes the same projection and may not import composition. Two more sites also make it: industry-characters.ts:29-41 and api/internal/eve-characters/route.ts:38-46. (2) P274's alternative is rejected: putting the predicate in platform/owner-sync and deriving `eligible` inside make*Descriptor would not cover platform/auth or app, and corp-viewer's roles check is not an owner-sync concern. (3) deriveScopeHealth(...).needsReconnect is a separate primitive that already exists for raw scope strings; it stays, and the notes record that it agrees with hasScopes only when the sync scopes are a subset of EVE_SCOPES. (4) Each feature test keeps a one-line wiring check instead of deleting all coverage of its canSyncX.

**Sites (22).**

- [`src/features/industry-jobs/sync-eligibility.ts:3-9`](../../src/features/industry-jobs/sync-eligibility.ts#L3-L9) — canSyncIndustryJobs
- [`src/features/industry-jobs/corp-sync-eligibility.ts:8-14`](../../src/features/industry-jobs/corp-sync-eligibility.ts#L8-L14) — canSyncCorpIndustryJobs
- [`src/features/owned-assets/sync-eligibility.ts:9-15`](../../src/features/owned-assets/sync-eligibility.ts#L9-L15) — canSyncAssets
- [`src/features/owned-assets/corp-sync-eligibility.ts:16-22`](../../src/features/owned-assets/corp-sync-eligibility.ts#L16-L22) — canSyncCorpAssets
- [`src/features/owned-blueprints/sync-eligibility.ts:3-9`](../../src/features/owned-blueprints/sync-eligibility.ts#L3-L9) — canSyncBlueprints
- [`src/features/owned-blueprints/corp-sync-eligibility.ts:15-21`](../../src/features/owned-blueprints/corp-sync-eligibility.ts#L15-L21) — canSyncCorpBlueprints
- [`src/features/owned-structures/corp-sync-eligibility.ts:15-21`](../../src/features/owned-structures/corp-sync-eligibility.ts#L15-L21) — canSyncCorpStructures
- [`src/features/skill-queue/sync-eligibility.ts:6-12`](../../src/features/skill-queue/sync-eligibility.ts#L6-L12) — canSyncSkillQueue
- [`src/features/character-sheet/sync-eligibility.ts:12-18`](../../src/features/character-sheet/sync-eligibility.ts#L12-L18) — canSyncSection: same body keyed by SHEET_SECTION_SCOPES[key]; the profile section has [] scopes, so it requires only a token
- [`src/data/corp-holdings/context-sync.ts:39-42, 169`](../../src/data/corp-holdings/context-sync.ts#L39-L42) — private canSyncCorpContext, passed as `eligible`
- [`src/composition/corp-viewer.ts:34, 53-55`](../../src/composition/corp-viewer.ts#L34) — canFetchRoles: inline single-scope variant with an `undefined` guard
- [`src/composition/board/board-assemble.ts:53-56, 411-418`](../../src/composition/board/board-assemble.ts#L53-L56) — BoardHealth re-declares the holder shape; boardGaps runs the token check plus a per-gap missing-scope check inline
- [`src/composition/board/board-view.ts:50-53`](../../src/composition/board/board-view.ts#L50-L53) — builds the holder projection by hand from LinkedCharacter. It needs identity fields, so it cannot call listCharactersWithHealth; it needs a shared mapper
- [`src/composition/sync/owner-sync-port.ts:11-29`](../../src/composition/sync/owner-sync-port.ts#L11-L29) — LinkedCharacterHealth plus the same projection inside listCharactersWithHealth
- [`src/app/(site)/industry/industry-characters.ts:23, 29-41`](../../src/app/%28site%29/industry/industry-characters.ts#L23) — local SyncEligibility type and the same projection again
- [`src/platform/auth/panel-character.ts:19-33`](../../src/platform/auth/panel-character.ts#L19-L33) — inline eligibility function type plus the same projection
- [`src/app/api/internal/eve-characters/route.ts:38-46`](../../src/app/api/internal/eve-characters/route.ts#L38-L46) — same projection, written inline into the response row
- [`src/platform/owner-sync/types.ts:1-8`](../../src/platform/owner-sync/types.ts#L1-L8) — EnumeratedOwner: string[] is assignable to readonly string[], so it satisfies ScopeHolder structurally
- [`src/features/owned-structures/refresh.ts:17`](../../src/features/owned-structures/refresh.ts#L17) — pass-through lambda `(owner) => canSyncCorpStructures(owner)`
- [`src/features/industry-jobs/corp-refresh.ts:28`](../../src/features/industry-jobs/corp-refresh.ts#L28) — pass-through lambda `(owner) => canSyncCorpIndustryJobs(owner)`
- [`src/features/owned-assets/corp-sync-eligibility.test.ts:19-31`](../../src/features/owned-assets/corp-sync-eligibility.test.ts#L19-L31) — repeated it.each truth table
- [`src/features/skill-queue/sync-eligibility.test.ts:14-22`](../../src/features/skill-queue/sync-eligibility.test.ts#L14-L22) — repeated truth table. The same table also appears in industry-jobs (x2), owned-assets, owned-blueprints (x2) and owned-structures tests

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/auth/scope-health.ts:23-46`](../../src/platform/auth/scope-health.ts#L23-L46) — deriveScopeHealth/deriveCharacterHealth take the raw granted-scope string and check required scopes against the granted set directly. This is a different input shape and stays as-is for toAccountCharacter, map-character-search.ts:81 and structure-search.ts:110. It agrees with hasScopes only when the sync scopes are a subset of EVE_SCOPES, because missingScopes lists only EVE_SCOPES members (see P187).
- [`src/features/industry-jobs/types.ts:28-33`](../../src/features/industry-jobs/types.ts#L28-L33) — RefreshCorpMember re-declares EnumeratedOwner. That belongs to the owner-sync port-types cleanup, not this predicate.
- [`src/features/owned-structures/types.ts:32-37`](../../src/features/owned-structures/types.ts#L32-L37) — Second RefreshCorpMember copy; same reason.
- [`src/data/location-tracking/sync-eligibility.ts:1-5`](../../src/data/location-tracking/sync-eligibility.ts#L1-L5) — Scope tuple only, with no predicate. It is consumed through SHEET_SECTIONS.status and GAP_SCOPES.

</details>

**Home.** `src/lib/scope-eligibility.ts (new; predicate and types). The scopeHolderOf mapper goes in src/platform/auth/scope-health.ts, next to deriveCharacterHealth.`

**Boundary check.** src/lib/scope-eligibility.ts is in the lib zone, and the rule {from: lib, allow: [config]} lets it import nothing or, after P187, EveScope from config. Every consumer zone may import lib:
- features ({from: features} allows lib): the 8 canSyncX and canSyncSection.
- data ({from: data} allows lib): data/corp-holdings/context-sync.ts. data may NOT import platform/auth, which rules out a platform/auth home for the predicate.
- composition (allows lib): corp-viewer, board-assemble.
- platform/auth ({from: platform/auth} allows lib): panel-character's type. platform/auth may NOT import platform/owner-sync, which rules out the owner-sync home.
- app (allows lib): industry-characters' type.

platform/owner-sync may import only platform/esi, so it cannot import lib. EnumeratedOwner stays as-is and matches ScopeHolder structurally.

scopeHolderOf lives in the platform/auth zone and needs deriveCharacterHealth/EVE_SCOPES. Its consumers are platform/auth (same zone), app ({from: app} allows platform/auth), api ({from: api} allows platform/auth) and composition ({from: composition} allows platform/auth). composition/sync/owner-sync-port.ts would be an illegal home, because platform/auth may not import composition.

**API sketch.**

```ts
// src/lib/scope-eligibility.ts
export interface ScopeHolder { readonly hasRefreshToken: boolean; readonly missingScopes: readonly string[] }
export type ScopeEligibility = (holder: ScopeHolder) => boolean;
/** A refresh token and none of `scopes` missing. Empty scopes => token only. */
export function hasScopes(holder: ScopeHolder, scopes: readonly string[] /* readonly EveScope[] after P187 */): boolean;
export function scopeEligibility(scopes: readonly string[]): ScopeEligibility; // (h) => hasScopes(h, scopes)

// src/platform/auth/scope-health.ts
export function scopeHolderOf(c: { scope: string | null | undefined; hasRefreshToken: boolean }): ScopeHolder;
// => { hasRefreshToken: c.hasRefreshToken, missingScopes: deriveCharacterHealth(c).missingScopes }
```

**Migration steps.**

1. Add src/lib/scope-eligibility.ts with ScopeHolder, ScopeEligibility, hasScopes and scopeEligibility, plus src/lib/scope-eligibility.test.ts.
2. Rewrite each feature predicate as `export const canSyncX: ScopeEligibility = scopeEligibility(X_SYNC_SCOPES)`. This covers industry-jobs (x2), owned-assets (x2), owned-blueprints (x2), owned-structures and skill-queue. Keep every exported *_SYNC_SCOPES, *_REQUIRED_ROLES and canSyncX name, because board-assemble, refresh modules, the account route and tests import them.
3. Change canSyncSection's body to `hasScopes(character, SHEET_SECTION_SCOPES[key])` and its parameter type to ScopeHolder.
4. In src/data/corp-holdings/context-sync.ts, delete canSyncCorpContext (39-42) and pass `eligible: scopeEligibility(CORP_CONTEXT_SYNC_SCOPES)` at line 169.
5. In corp-viewer.ts, change canFetchRoles to `health !== undefined && hasScopes(health, [ROLES_SCOPE])`.
6. In board-assemble.ts, write boardGaps as `BOARD_GAPS.filter((gap) => denied.has(gap) || !hasScopes(raw.health, GAP_SCOPES[gap]))`. The no-token early return becomes redundant, because hasScopes is false for every gap without a token and BOARD_GAPS order is kept. Replace the BoardHealth interface with ScopeHolder, or alias it.
7. Add scopeHolderOf to platform/auth/scope-health.ts. Use it in owner-sync-port listCharactersWithHealth (`{ characterId, corporationId, ...scopeHolderOf(character) }`), board-view readRaws (`health: scopeHolderOf(character)`), industry-characters eligibleIds, panel-character toPanelCharacter and api/internal/eve-characters/route.ts (spread into the row).
8. Type panel-character's canSync parameter as ScopeEligibility. Delete industry-characters' local SyncEligibility alias and import ScopeEligibility from lib.
9. Drop the pass-through lambdas in owned-structures/refresh.ts:17 and industry-jobs/corp-refresh.ts:28 (`eligible: canSyncCorpX`).
10. Tests: in each per-feature sync-eligibility test, replace the it.each truth table with the literal pin it already has plus a one-line wiring check: for each own scope, canSyncX({hasRefreshToken: true, missingScopes: [scope]}) is false. Keep character-sheet's per-key loop, which checks the SHEET_SECTION_SCOPES wiring.

**Tests.** New: src/lib/scope-eligibility.test.ts. Table rows:
- no token -> false, even with no scopes required.
- token with empty scopes -> true (the profile section).
- token with an unrelated scope missing -> true.
- token with any required scope missing -> false.
- scopeEligibility(scopes) agrees with hasScopes.

New: scopeHolderOf case in src/platform/auth/scope-health.test.ts.

Existing guards to run:
- src/features/*/(corp-)sync-eligibility.test.ts (scope pins).
- src/features/character-sheet/sync-eligibility.test.ts.
- src/composition/board/board-assemble.test.ts and demo-board.test.ts (gaps).
- src/composition/corp-viewer.test.ts (roles fetch gating).
- src/platform/auth/panel-character.test.ts.
- src/app/(site)/industry/industry-characters.test.ts.
- src/composition/sync/owner-sync-port.test.ts.
- src/app/api/internal/eve-characters/route.test.ts.
- the features/*/refresh tests.

**Notes.** Behaviors to preserve:
- An empty scope list still requires a refresh token (profile section).
- canFetchRoles keeps its `undefined` guard.
- boardGaps keeps returning every BOARD_GAPS entry, in order, when there is no token.

hasScopes trusts missingScopes, which deriveCharacterHealth computes only against EVE_SCOPES. A scope outside EVE_SCOPES would therefore read as granted. That invariant is currently enforced by tests only for sheet sections (sections.test.ts:24) and corp context (corp-context-sync.test.ts:5-11). P187 enforces it at compile time.

If P187 lands first, type the `scopes` parameter as `readonly EveScope[]` from day one. lib may import config, so every canSyncX gets vocabulary checking automatically. The two changes are otherwise independent.

Refuted sub-claim: board-view cannot simply call listCharactersWithHealth, because it needs name, portrait, corporation and alliance from LinkedCharacter. The fix is the shared mapper, not reusing the list call.

<sub>Reported by: area:composition, area:data-services, area:features-owned, concern:esi-sync, concern:feature-skeleton, dupes-triage-1, dupes-triage-2.</sub>

<a id="p252"></a>

## P252: Export a syncEligibility projection from scope-health and use it wherever the canSync input is built

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -20 / +8
- **Depends on:** [P186](#p186), [P303](wave-01-quick-wins-delete-dead-code-fix-small.md#p303)
- **Existing primitive:** `src/platform/auth/scope-health.ts:deriveCharacterHealth`

**Problem.** Five sites rebuild the canSync input pair from a linked-character row, four of them by destructuring scope and hasRefreshToken back out of the row. industry-characters builds it in eligibleIds and again inside toPanelCharacter. The internal eve-characters route and listCharactersWithHealth rebuild the same projection. board-view already shows the compact form, `deriveCharacterHealth(character).missingScopes`. The pair has no named type: industry-characters declares a local `SyncEligibility` predicate alias, and panel-character inlines the same parameter type.

**Verifier revision.** The projection half is real. Five production sites build the same `{ hasRefreshToken, missingScopes: deriveCharacterHealth(...).missingScopes }` input that every canSyncX predicate consumes, and that shape is also re-declared as EnumeratedOwner, BoardHealth, RefreshCorpMember and inline predicate parameter types. Rejected parts:
- The efficiency claim: an account has a handful of linked characters, and tokenizing a ~20-token scope string three times each is negligible.
- The staleAffiliationIds selector: there are only two sites, they read different fields (LinkedCharacter.affiliationRefreshedAt vs CachedAffiliation.refreshedAt) and do different things next (fire-and-forget after() vs awaited refreshAffiliationsWithOutcome). The filter is 3 lines, and a shared helper would need a field accessor that costs more than it saves.
- listStaleLinkedCharacterIds is a global DB query, a different concept.

**Sites (8).**

- [`src/app/(site)/industry/industry-characters.ts:23, 29-41, 53-57`](../../src/app/%28site%29/industry/industry-characters.ts#L23) — local predicate type; eligibleIds rebuilds the pair; called twice per load alongside toPanelCharacter
- [`src/platform/auth/panel-character.ts:11-34`](../../src/platform/auth/panel-character.ts#L11-L34) — toPanelCharacter derives health and rebuilds the pair for canSync
- [`src/composition/sync/owner-sync-port.ts:18-29`](../../src/composition/sync/owner-sync-port.ts#L18-L29) — listCharactersWithHealth: the same pair plus characterId and corporationId
- [`src/composition/board/board-view.ts:50-53`](../../src/composition/board/board-view.ts#L50-L53) — same pair, passing the row directly
- [`src/app/api/internal/eve-characters/route.ts:35-48`](../../src/app/api/internal/eve-characters/route.ts#L35-L48) — same pair plus characterId, name and corporationId
- [`src/platform/auth/scope-health.ts:3-46`](../../src/platform/auth/scope-health.ts#L3-L46) — deriveCharacterHealth already accepts any {scope, hasRefreshToken} row; the home
- [`src/features/industry-jobs/sync-eligibility.ts:3-9`](../../src/features/industry-jobs/sync-eligibility.ts#L3-L9) — one of the canSyncX predicates whose input type is the pair, inlined
- [`src/composition/board/board-assemble.ts:53-56`](../../src/composition/board/board-assemble.ts#L53-L56) — BoardHealth re-declares the pair

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/internal/eve-characters/route.ts:25-30`](../../src/app/api/internal/eve-characters/route.ts#L25-L30) — stale-affiliation filter: reads affiliationRefreshedAt and schedules after(refreshAffiliationsAndReconcile)
- [`src/composition/corp-access.ts:9-13`](../../src/composition/corp-access.ts#L9-L13) — stale-affiliation filter on CachedAffiliation.refreshedAt, then awaits refreshAffiliationsWithOutcome; different field and flow, and a 3-line filter
- [`src/platform/auth/affiliation-store.ts:83-102`](../../src/platform/auth/affiliation-store.ts#L83-L102) — listStaleLinkedCharacterIds is a cross-user SQL query for the cron, not an in-memory selector
- [`src/app/(site)/settings/characters/characters-view.ts:10-31`](../../src/app/%28site%29/settings/characters/characters-view.ts#L10-L31) — uses needsReconnect for a label, a different projection
- [`src/app/(site)/admin/users/[userId]/page.tsx:52-55`](../../src/app/%28site%29/admin/users/[userId]/page.tsx#L52-L55) — uses needsReconnect/missingScopes for display, not canSync input
- [`src/composition/structure-search.ts:109-111`](../../src/composition/structure-search.ts#L109-L111) — deriveScopeHealth against a feature-specific scope list, a different concept
- [`src/composition/map-character-search.ts:79-82`](../../src/composition/map-character-search.ts#L79-L82) — same as structure-search
- [`src/platform/owner-sync/types.ts:1-6`](../../src/platform/owner-sync/types.ts#L1-L6) — EnumeratedOwner has the same shape but owner-sync may import only platform/esi, so it cannot reference the new type; structural compatibility is enough

</details>

**Home.** `src/platform/auth/scope-health.ts`

**Boundary check.** The home is in platform/auth. Every consumer may import it:
- app (industry-characters.ts): the `app` rule allows platform/auth.
- api (internal/eve-characters): the `api` rule allows platform/auth.
- composition (owner-sync-port.ts, board-view.ts): the `composition` rule allows platform/auth.
- panel-character.ts is in the same zone.
- Optionally, features canSync predicates may import the type, since the `features` rule allows platform/auth.

platform/owner-sync is not allowed platform/auth, so EnumeratedOwner keeps its structural copy.

**API sketch.**

```ts
export interface SyncEligibility { hasRefreshToken: boolean; missingScopes: string[] }
export function syncEligibility(character: { scope: string | null | undefined; hasRefreshToken: boolean }): SyncEligibility {
  return { hasRefreshToken: character.hasRefreshToken, missingScopes: deriveCharacterHealth(character).missingScopes };
}
// panel-character: toPanelCharacter(character, canSync: (e: SyncEligibility) => boolean)
```

**Migration steps.**

1. Add the SyncEligibility type and syncEligibility() to src/platform/auth/scope-health.ts, with cases in scope-health.test.ts: null scope, no refresh token, and a partial grant.
2. panel-character.ts: type the canSync parameter as `(e: SyncEligibility) => boolean` and set `needsReconnect: !canSync(syncEligibility(character))`. Drop the local health variable.
3. industry-characters.ts: delete the local `SyncEligibility` alias (it would clash with the new name) and make eligibleIds `linked.filter((c) => canSync(syncEligibility(c))).map((c) => c.characterId)`.
4. owner-sync-port.ts listCharactersWithHealth: return `{ characterId, corporationId, ...syncEligibility(character) }`.
5. board-view.ts readRaws: `health: syncEligibility(character)`.
6. internal/eve-characters/route.ts: `({ characterId, name, corporationId, ...syncEligibility(character) })`. The response shape is unchanged, since eveCharacterEntrySchema is a plain z.object and key order does not matter.
7. Optional: switch the inline `{ hasRefreshToken: boolean; missingScopes: string[] }` parameter types in features/*/sync-eligibility.ts and corp-sync-eligibility.ts, and BoardHealth, to SyncEligibility. Coordinate with the separate canSyncX opportunity, which owns those predicates.

**Tests.** Add syncEligibility cases to src/platform/auth/scope-health.test.ts. Existing guards: src/platform/auth/panel-character.test.ts, src/app/(site)/industry/industry-characters.test.ts, src/composition/sync/owner-sync-port.test.ts, src/composition/board/board-view.db.test.ts, src/app/api/internal/eve-characters/route.test.ts.

**Notes.** - Behavior is identical at every site: each calls deriveCharacterHealth against EVE_SCOPES and forwards hasRefreshToken unchanged.
- No drift found between the copies.
- Do not fold this into CharacterHealth by adding hasRefreshToken there. BoardHealth flows into the assembled board, and spreading a CharacterHealth would leak needsReconnect into that object.
- The separate canSyncX-predicate opportunity should consume SyncEligibility and should land after this.

<sub>Reported by: area:app-api, area:app-site.</sub>

<a id="p258"></a>

## P258: Add one unnamed-entity fallback label helper and define the ESI owner-type vocabulary once in platform/owner-sync

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** low · **Size:** about -25 / +15 across ~18 files
- **Depends on:** [P094](wave-04-formatting-dates-and-names-have-one-home.md#p094)
- **Existing primitive:** `src/data/maps/access-contract.ts:MAP_ACCESS_OWNER_TYPES (closest existing tuple); src/platform/owner-sync/types.ts:OwnerKey`

**Problem.** The fallback name for an unresolved character or corporation id is hand-written in about 13 places across features, composition, components-composition, mapper, app and platform/auth. One copy has drifted ('Corporation #id'). owned-assets and owned-blueprints carry byte-identical private ownerFallback functions.

The ESI owner vocabulary ['character','corporation'] is spelled in four places: as four separate `as const` tuples that back four pgEnums, as two inline z.enum calls, and as three inline unions. platform/owner-sync declares OwnerKey and OwnerSyncTarget as two identical interfaces.

**Verifier revision.** Two parts, with different outcomes.

The fallback-label part is stronger than reported. Besides the two byte-identical ownerFallback functions and the linked-characters label, at least 9 more sites rewrite `Character ${id}` or `Corporation ${id}` as the name for an entity with no resolved name: ProfileWorkspace, the admin access-view, map-access (x2), map-access-projection, use-character-identities, MapCatalogue, corp-structures-sync, and CorpJobsBoard. CorpJobsBoard has drifted to `Corporation #${id}`.

The tuple part is real but low value:
- The tuples are tiny, and the TS unions are already structurally compatible.
- MAP_ACCESS_OWNER_TYPES is a different concept: map ACL grantee types, used in SQL casts to map_access_owner_type, and likely to diverge (alliance grants). It should not be tied to the ESI owner tuple, even as an alias.
- With maps excluded, no tuple consumer is in app, api, convex or platform/auth. Every consumer is in features, data or platform/owner-sync, all of which may import platform/owner-sync. platform/owner-sync is therefore the better home than data/eve-data, which platform/owner-sync's own OwnerKey could not import.
- OwnerKey and OwnerSyncTarget are identical interfaces in one file.

**Sites (23).**

- [`src/features/owned-assets/detail.ts:67-69`](../../src/features/owned-assets/detail.ts#L67-L69) — private ownerFallback
- [`src/features/owned-blueprints/detail.ts:47-49`](../../src/features/owned-blueprints/detail.ts#L47-L49) — byte-identical ownerFallback
- [`src/platform/auth/linked-characters.ts:87`](../../src/platform/auth/linked-characters.ts#L87) — `Character ${r.accountId}` fallback
- [`src/platform/auth/admin-users.ts:23-29, 31-46`](../../src/platform/auth/admin-users.ts#L23-L29) — the same fallback built in SQL coalesce; toAdminUser already parses characterId, so the label can move to TS
- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:119`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L119) — `Character ${characterId}` fallback
- [`src/app/(site)/admin/users/access-view.ts:42-43`](../../src/app/%28site%29/admin/users/access-view.ts#L42-L43) — actor and target `Character ${id}` fallbacks
- [`src/composition/map-access.ts:42, 68`](../../src/composition/map-access.ts#L42) — Character and Corporation fallbacks
- [`src/composition/map-access-projection.ts:129`](../../src/composition/map-access-projection.ts#L129) — Character fallback
- [`src/mapper/tracking/use-character-identities.ts:23`](../../src/mapper/tracking/use-character-identities.ts#L23) — Character fallback
- [`src/features/maps/MapCatalogue.tsx:91`](../../src/features/maps/MapCatalogue.tsx#L91) — Corporation fallback
- [`src/composition/sync/corp-structures-sync.ts:144`](../../src/composition/sync/corp-structures-sync.ts#L144) — Corporation fallback
- [`src/features/industry-jobs/components/CorpJobsBoard.tsx:96`](../../src/features/industry-jobs/components/CorpJobsBoard.tsx#L96) — DRIFT: `Corporation #${id}`; every other site and test uses no '#'
- [`src/lib/format/names.ts:1-5`](../../src/lib/format/names.ts#L1-L5) — existing names module (initials); the home for the label
- [`src/platform/owner-sync/types.ts:10-13, 26-29`](../../src/platform/owner-sync/types.ts#L10-L13) — identical OwnerKey and OwnerSyncTarget
- [`src/platform/owner-sync/index.ts:1-19`](../../src/platform/owner-sync/index.ts#L1-L19) — barrel re-exports both types; importing the barrel pulls in the engine
- [`src/features/owned-assets/schema.ts:15-17`](../../src/features/owned-assets/schema.ts#L15-L17) — OWNED_ASSET_OWNER_TYPES plus pgEnum 'owned_asset_owner_type'
- [`src/features/owned-blueprints/schema.ts:4-8`](../../src/features/owned-blueprints/schema.ts#L4-L8) — OWNED_BLUEPRINT_OWNER_TYPES plus pgEnum
- [`src/data/esi-snapshots/constants.ts:3-4`](../../src/data/esi-snapshots/constants.ts#L3-L4) — ESI_SNAPSHOT_OWNER_TYPES (pgEnum in schema.ts:5-8)
- [`src/data/esi-refresh-jobs/constants.ts:21`](../../src/data/esi-refresh-jobs/constants.ts#L21) — ESI_REFRESH_OWNER_TYPES (pgEnum in schema.ts:24-27)
- [`src/data/esi-refresh-jobs/types.ts:2`](../../src/data/esi-refresh-jobs/types.ts#L2) — data already imports platform/owner-sync (OwnerSyncTarget), so this import direction is established
- [`src/features/industry-planner/api-contract.ts:110, 136`](../../src/features/industry-planner/api-contract.ts#L110) — inline z.enum twice; the contract is imported by client hooks
- [`src/features/industry-planner/types.ts:182, 196`](../../src/features/industry-planner/types.ts#L182) — inline unions
- [`src/data/domain-events/types.ts:37`](../../src/data/domain-events/types.ts#L37) — inline union

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/maps/access-contract.ts:5-6`](../../src/data/maps/access-contract.ts#L5-L6) — map ACL grantee vocabulary behind pgEnum map_access_owner_type and the SQL casts in authorization-sql.ts:75-82; a different concept, likely to diverge (alliance grants); leave independent
- [`src/platform/owner-sync/owned.ts:41-45`](../../src/platform/owner-sync/owned.ts#L41-L45) — basePathFor switches on OwnerKey; it consumes the vocabulary and is not a duplicate
- [`src/app/(site)/admin/ops-view.ts:135`](../../src/app/%28site%29/admin/ops-view.ts#L135) — `Character N token ...` is an event sentence, not a fallback name
- [`src/components/composition/industry-workspace/StructuresManager.tsx:196`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L196) — `Corporation ${counts.corp}` is a tab label with a count
- [`convex/mapFixtureTracking.ts:233-245`](../../convex/mapFixtureTracking.ts#L233-L245) — fixture error details

</details>

**Home.** `Label: src/lib/format/names.ts. ESI owner tuple: a new leaf module, src/platform/owner-sync/owner-type.ts, re-exported from the platform/owner-sync index. OwnerSyncTarget becomes an alias of OwnerKey in src/platform/owner-sync/types.ts.`

**Boundary check.** Label in lib (rule lib→[config]; the helper imports nothing). Every consumer may import lib:
- features (features→[...,lib,...])
- composition (composition→[...,lib,...])
- components-composition (components-composition→[...,lib,...])
- mapper (mapper→[...,lib,...])
- app (app→[...,lib,...])
- platform/auth (platform/auth→[...,lib,...])

Tuple in platform/owner-sync (owner-type.ts imports nothing). Every consumer may import it:
- features/owned-assets, owned-blueprints and industry-planner (features→[...,platform/owner-sync,...])
- data/esi-snapshots, esi-refresh-jobs and domain-events (data→[...,platform/owner-sync,...]); data/esi-refresh-jobs/types.ts already does
- platform/owner-sync's own types.ts (same zone)

No app, api, convex or platform/auth file needs the tuple. Grep shows the only ownerType use outside these zones is a template string in admin/ops-view.ts:61. data/eve-data would be wrong here, because platform/owner-sync may import only platform/esi.

**API sketch.**

```ts
// src/lib/format/names.ts
export function fallbackEntityName(kind: 'character' | 'corporation', id: number | string): string; // 'Character 123' | 'Corporation 456'

// src/platform/owner-sync/owner-type.ts (leaf, no imports)
export const ESI_OWNER_TYPES = ['character', 'corporation'] as const;
export type EsiOwnerType = (typeof ESI_OWNER_TYPES)[number];

// src/platform/owner-sync/types.ts
export interface OwnerKey { ownerType: EsiOwnerType; ownerId: number }
export type OwnerSyncTarget = OwnerKey;
```

**Migration steps.**

1. Add fallbackEntityName to src/lib/format/names.ts with cases in names.test.ts.
2. Replace both ownerFallback functions (owned-assets/detail.ts:67-69, owned-blueprints/detail.ts:47-49) and the inline labels at linked-characters.ts:87, ProfileWorkspace.tsx:119, access-view.ts:42-43, map-access.ts:42 and :68, map-access-projection.ts:129, use-character-identities.ts:23, MapCatalogue.tsx:91 and corp-structures-sync.ts:144.
3. Fix CorpJobsBoard.tsx:96 to `fallbackEntityName('corporation', corp.corporationId)`, which drops the '#'.
4. Optional: in admin-users.ts, select characters.name and user.name raw and build the name in toAdminUser as `characterName ?? (characterId != null ? fallbackEntityName('character', characterId) : userName)`. The computed name feeds no WHERE or ORDER BY (ordering is by user.name, and the search uses ilike on the raw columns), so the move is safe. Otherwise leave the SQL with a comment pointing to the helper.
5. Add src/platform/owner-sync/owner-type.ts and re-export it from index.ts. In types.ts, type OwnerKey.ownerType as EsiOwnerType and replace the OwnerSyncTarget interface with `export type OwnerSyncTarget = OwnerKey`. This keeps all ~32 OwnerSyncTarget references compiling unchanged.
6. Point the four tuples at the leaf module, importing '@/platform/owner-sync/owner-type' and not the barrel:
- owned-assets and owned-blueprints schema: pgEnum('owned_asset_owner_type', ESI_OWNER_TYPES) and the blueprint equivalent; change the detail.ts types to EsiOwnerType.
- esi-snapshots and esi-refresh-jobs constants: delete the tuples and use ESI_OWNER_TYPES in schema.ts; alias EsiSnapshotOwnerType to EsiOwnerType or replace it in types.ts.
- Keep every pgEnum name and value list unchanged, so drizzle-kit generates no migration.
7. Replace the inline z.enum calls at industry-planner/api-contract.ts:110 and :136 with z.enum(ESI_OWNER_TYPES), the unions at industry-planner/types.ts:182 and :196 with EsiOwnerType, and the union at domain-events/types.ts:37 with EsiOwnerType (type-only import).
8. Leave MAP_ACCESS_OWNER_TYPES and map_access_owner_type alone. Confirm that `drizzle-kit generate` would produce no diff.

**Tests.** Add: names.test.ts cases for fallbackEntityName.

Guards that pin the exact format:
- owned-assets/detail.test.ts:142
- owned-blueprints/detail.test.ts:122-123
- map-access.test.ts:132-153
- map-access-projection.test.ts:462
- corp-structures-sync.test.ts:149-150
- access-view.test.ts:70

No test pins 'Corporation #'. features/industry-planner/coverage.test.ts and the owned-assets and owned-blueprints refresh tests cover the type changes. The schema db tests cover the unchanged pgEnums.

**Notes.** The industry-planner api-contract is imported by client hooks (use-planner-profile.ts, PricingProvider.tsx and others). They must import the leaf '@/platform/owner-sync/owner-type', not the '@/platform/owner-sync' barrel, which re-exports engine and platform/esi code into the client bundle.

The correct label format is 'Corporation N' / 'Character N' with no '#'. That is the majority form, and the tests pin it. CorpJobsBoard is the drifted copy.

linked-characters.ts:87 formats the raw accountId string. The id is already parsed at that point, so passing characterId gives the same output.

Keep the per-table pgEnum names. Only the TypeScript source of the value list changes.

F196's data/eve-data home is rejected for the tuple. It was chosen to reach data/maps, platform/auth, app and convex, but map access is excluded and none of the others use the tuple.

<sub>Reported by: area:platform, concern:contracts-types.</sub>

<a id="p260"></a>

## P260: Reuse the existing CostBasis, modifier-kind, roman-level, map-create-role and admin-query vocabularies instead of restating them

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -30 / +20 across 14 files.
- **Depends on:** —
- **Existing primitive:** `src/features/industry-planner/cost-basis-view.ts:CostBasis; src/features/skill-queue/progress.ts:romanLevel; src/data/maps/access-contract.ts:MAP_ROLES; src/platform/auth/api-contract.ts:ADMIN_ACCESS_QUERY_MAX_LENGTH; src/data/eve-data/structures.ts:PRODUCTION_ACTIVITIES`

**Problem.** Five closed vocabularies already have a canonical definition but are restated, and two of the copies can drift silently:
- CostBasis is restated as 'batched' | 'marginal' in the preference and in six feature types.
- The production modifier kinds 'material' | 'time' | 'cost' are written three times, and none of the guards checks that every kind is listed.
- MemberDetail keeps a byte-identical copy of skill-queue's ROMAN table and romanLevel.
- The map create-role subset ['viewer','editor'] is written twice and then forced back with a cast.
- The admin users page re-declares the 200-character query cap and its own sanitiseQuery, which already exist in platform/auth and api/admin/role.
- market-prices reads its untyped text `source` column back with an `as PriceSource` cast instead of typing the column.

**Verifier revision.** Most of it holds up. CostBasis, the modifier kinds, the roman-numeral table, the map create-role subset and the admin query cap are each real restatements of a vocabulary that already has a home. Two parts of the proposal are wrong. (1) INDUSTRY_ACTIVITY_NAMES (constants.ts:46-54) is the set of activities the tree resolver walks. PRODUCTION_ACTIVITIES (structures.ts:19) is the set of activities a structure bonus can apply to. Their values coincide today, but the constants.ts comment explicitly forbids casual edits, so aliasing one to the other would couple two independent decisions. Dropped. (2) PriceSource's z.enum copy is already pinned in both directions by a type test (market-prices/api-contract.test.ts:6-7), so a PRICE_SOURCES tuple adds little. The real fix for the `as PriceSource` cast is the repo's existing column idiom, text().$type<T>() (corp-holdings/schema.ts:9). Additions: types.ts:167 is a seventh inline CostBasis union the finders missed. The admin cap duplication is larger than reported: page.tsx:38-42 and api/admin/role/route.ts:15-19 are two near-identical sanitiseQuery functions. The modifier-kind duplication is a real drift risk. MODIFIER_KINDS is typed `readonly string[]` with `satisfies ProductionModifier['kind'][]`, and the zod schema uses `satisfies z.ZodType<ProductionModifier>`. Both checks accept a subset, so adding a kind to the type is caught nowhere, and isProductionModifier/productionModifierSources would silently drop rows of the new kind.

**Sites (20).**

- [`src/features/industry-planner/cost-basis-view.ts:1`](../../src/features/industry-planner/cost-basis-view.ts#L1) — CostBasis type; its only importer is CockpitKpis.tsx:23
- [`src/lib/preferences.ts:27-31`](../../src/lib/preferences.ts#L27-L31) — industryCostBasis = define<'batched' \| 'marginal'>(..., z.enum(['batched','marginal']), 'marginal'); lib cannot import features, so the canonical type must move down here
- [`src/features/industry-planner/build-pricing.ts:139, 228`](../../src/features/industry-planner/build-pricing.ts#L139) — basis?: 'batched' \| 'marginal' and CostBill.basis
- [`src/features/industry-planner/types.ts:167`](../../src/features/industry-planner/types.ts#L167) — summary.basis: 'batched' \| 'marginal' (missed by the finders)
- [`src/features/industry-planner/components/planner-contexts.tsx:47-48`](../../src/features/industry-planner/components/planner-contexts.tsx#L47-L48) — PlannerConfigValue.costBasis and setCostBasis inline unions
- [`src/features/industry-planner/components/PricingProvider.tsx:282`](../../src/features/industry-planner/components/PricingProvider.tsx#L282) — PriceAssembleMirrors.costBasis inline union; line 137 reads the preference
- [`src/features/industry-planner/components/CockpitKpis.tsx:23, 64-65`](../../src/features/industry-planner/components/CockpitKpis.tsx#L23) — imports CostBasis from cost-basis-view; must switch to the new home
- [`src/data/market-prices/schema.ts:28`](../../src/data/market-prices/schema.ts#L28) — source: text('source') with no $type, unlike corp-holdings/schema.ts:9
- [`src/data/market-prices/queries.ts:33`](../../src/data/market-prices/queries.ts#L33) — { ...r, source: r.source as PriceSource }, the only read-side cast
- [`src/data/eve-data/structures.ts:19-31`](../../src/data/eve-data/structures.ts#L19-L31) — PRODUCTION_ACTIVITIES tuple next to an inline kind: 'material' \| 'time' \| 'cost'
- [`src/data/eve-data/queries.ts:402-412, 435-442`](../../src/data/eve-data/queries.ts#L402-L412) — MODIFIER_KINDS: readonly string[] = [...] satisfies ProductionModifier['kind'][]; a subset passes the check; used in the inArray filter and the isProductionModifier guard
- [`src/features/industry-planner/api-contract.ts:198-203`](../../src/features/industry-planner/api-contract.ts#L198-L203) — kind: z.enum(['material','time','cost']) next to activity: z.enum(PRODUCTION_ACTIVITIES); a narrower enum still satisfies z.ZodType<ProductionModifier>
- [`src/components/composition/industry-workspace/MemberDetail.tsx:22-26, 65`](../../src/components/composition/industry-workspace/MemberDetail.tsx#L22-L26) — ROMAN and level() are byte-identical to romanLevel
- [`src/features/skill-queue/progress.ts:63-66`](../../src/features/skill-queue/progress.ts#L63-L66) — the existing ROMAN and exported romanLevel
- [`src/features/maps/access-editor-model.ts:21-22, 33-35, 104-115`](../../src/features/maps/access-editor-model.ts#L21-L22) — CREATE_ROLES literal; accessRolesForMode; `draft.role as 'viewer' \| 'editor'` cast at 108
- [`src/data/maps/api-contract.ts:16-20`](../../src/data/maps/api-contract.ts#L16-L20) — createMapGrantSchema role: z.enum(['viewer','editor'])
- [`src/data/maps/access-contract.ts:1-3`](../../src/data/maps/access-contract.ts#L1-L3) — canonical MAP_ROLES and MapRole
- [`src/app/(site)/admin/users/page.tsx:33, 38-42, 156`](../../src/app/%28site%29/admin/users/page.tsx#L33) — MAX_QUERY_LENGTH = 200, a local sanitiseQuery (also handles string[]), and the Input maxLength
- [`src/app/api/admin/role/route.ts:15-19`](../../src/app/api/admin/role/route.ts#L15-L19) — a second sanitiseQuery using ADMIN_ACCESS_QUERY_MAX_LENGTH; same logic
- [`src/platform/auth/api-contract.ts:73-77`](../../src/platform/auth/api-contract.ts#L73-L77) — ADMIN_ACCESS_QUERY_MAX_LENGTH = 200, used by adminRoleFormSchema

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/eve-data/constants.ts:46-54`](../../src/data/eve-data/constants.ts#L46-L54) — INDUSTRY_ACTIVITY_NAMES is the resolver-walk set, used by tree-resolver.ts:86,100 and blueprint-shaping.ts:26,40,56. PRODUCTION_ACTIVITIES is the structure-bonus set. The values are equal only by coincidence; the comment says not to append casually. Do not alias them.
- [`src/data/market-prices/api-contract.ts:40`](../../src/data/market-prices/api-contract.ts#L40) — The z.enum copy of PriceSource is already pinned in both directions by api-contract.test.ts:6-7. Optional; not needed.
- [`src/features/industry-planner/components/CockpitKpis.tsx:72`](../../src/features/industry-planner/components/CockpitKpis.tsx#L72) — The `value as CostBasis` cast comes from SegmentedControl's string-only API (components/ui/segmented.tsx:70-84), not from a restated vocabulary.
- [`src/features/industry-planner/build-pricing.test.ts:617`](../../src/features/industry-planner/build-pricing.test.ts#L617) — A test-local union; it may adopt CostBasis but is not required.

</details>

**Home.** `Several homes, each the existing owner of its vocabulary: - COST_BASES and CostBasis go in src/lib/preferences.ts. - PRODUCTION_MODIFIER_KINDS goes in src/data/eve-data/structures.ts. - romanLevel stays in src/features/skill-queue/progress.ts. - MAP_CREATE_ROLES, MapCreateRole and isMapCreateRole go in src/data/maps/access-contract.ts. - sanitiseAdminAccessQuery goes in src/platform/auth/api-contract.ts, next to ADMIN_ACCESS_QUERY_MAX_LENGTH. - PriceSource is applied with $type on src/data/market-prices/schema.ts.`

**Boundary check.** - lib/preferences (zone lib) is imported by features/industry-planner. The features rule allows lib. lib itself imports only zod, which is legal under lib → [config].
- data/eve-data/structures is imported by data/eve-data/queries (same zone) and by features/industry-planner/api-contract (features allows data).
- features/skill-queue/progress is imported by components/composition/industry-workspace (the components-composition rule allows features).
- data/maps/access-contract is imported by data/maps/api-contract (same zone) and by features/maps (features allows data).
- platform/auth/api-contract is imported by app/(site)/admin/users (app allows platform/auth) and by app/api/admin/role (api allows platform/auth). It would import lib/sanitise, which the platform/auth rule allows.
- market-prices schema and queries are both in data/market-prices.

**API sketch.**

```ts
// src/lib/preferences.ts
export const COST_BASES = ['batched', 'marginal'] as const;
export type CostBasis = (typeof COST_BASES)[number];
export const industryCostBasis = define<CostBasis>('industry.costBasis', z.enum(COST_BASES), 'marginal');

// src/data/eve-data/structures.ts
export const PRODUCTION_MODIFIER_KINDS = ['material', 'time', 'cost'] as const;
export type ProductionModifier = { activity: (typeof PRODUCTION_ACTIVITIES)[number]; kind: (typeof PRODUCTION_MODIFIER_KINDS)[number]; ... };

// src/data/maps/access-contract.ts
export const MAP_CREATE_ROLES = ['viewer', 'editor'] as const satisfies readonly MapRole[];
export type MapCreateRole = (typeof MAP_CREATE_ROLES)[number];
export function isMapCreateRole(role: MapRole | null): role is MapCreateRole;

// src/platform/auth/api-contract.ts
export function sanitiseAdminAccessQuery(raw: string | readonly string[] | undefined): string | undefined;

// src/data/market-prices/schema.ts
source: text('source').$type<PriceSource>().notNull().default('fuzzwork'),
```

**Migration steps.**

1. CostBasis. In src/lib/preferences.ts, add COST_BASES and CostBasis, and change industryCostBasis to define<CostBasis>(..., z.enum(COST_BASES), 'marginal'). Delete the type from features/industry-planner/cost-basis-view.ts (keep batchedCostOfRows) and point CockpitKpis.tsx:23 at '@/lib/preferences'. Do not add a re-export.
2. Replace the inline 'batched' | 'marginal' with CostBasis at build-pricing.ts:139 and 228, types.ts:167, planner-contexts.tsx:47-48 and PricingProvider.tsx:282.
3. Modifier kinds. In structures.ts, add PRODUCTION_MODIFIER_KINDS and type ProductionModifier.kind from it.
4. In eve-data/queries.ts, delete MODIFIER_KINDS (435). Use [...PRODUCTION_MODIFIER_KINDS] in the inArray at 409 and `(PRODUCTION_MODIFIER_KINDS as readonly string[]).includes(row.kind)` in isProductionModifier.
5. In features/industry-planner/api-contract.ts:200, use z.enum(PRODUCTION_MODIFIER_KINDS).
6. PriceSource. Add .$type<PriceSource>() to market-prices/schema.ts:28. This is type-only, so there is no migration SQL; confirm that drizzle-kit generate produces an empty diff, as with corp-holdings. Then remove the cast in queries.ts:33. If the typecheck now flags literal widening at insert sites (market-prices/ingest.ts:53, source.ts, source-fallback.ts, composition/pipelines/sde-pipeline.ts:51), add `as const` there; those errors are the intended surfacing of untyped writes.
7. Roman levels. In MemberDetail.tsx, delete ROMAN and level() (22-26), import romanLevel from '@/features/skill-queue/progress', and use it at line 65. Moving romanLevel to src/lib/format is optional; do it only if a features-zone consumer outside skill-queue appears, because features cannot import other features.
8. Map create roles. In data/maps/access-contract.ts, add MAP_CREATE_ROLES, MapCreateRole and isMapCreateRole.
9. In data/maps/api-contract.ts:19, use z.enum(MAP_CREATE_ROLES).
10. In features/maps/access-editor-model.ts, replace CREATE_ROLES with MAP_CREATE_ROLES. Rewrite createMapGrantsFromDrafts so that each draft passes isMapCreateRole (return null otherwise) instead of the `as 'viewer' | 'editor'` cast at 108.
11. Admin query. Add sanitiseAdminAccessQuery to platform/auth/api-contract.ts: return undefined for a non-string, call sanitiseUserText(raw, ADMIN_ACCESS_QUERY_MAX_LENGTH), and return undefined for an empty result.
12. Delete sanitiseQuery from admin/users/page.tsx (38-42) and from api/admin/role/route.ts (15-19), and call the shared function in both places.
13. Replace MAX_QUERY_LENGTH in page.tsx (33, 156) with ADMIN_ACCESS_QUERY_MAX_LENGTH.

**Tests.** Existing guards:
- src/lib/preferences.test.ts (preference parsing)
- src/data/market-prices/api-contract.test.ts:6-7 (PriceSource pinned)
- src/features/skill-queue/progress.test.ts (romanLevel)
- src/features/maps/access-editor-model.test.ts:117 (create roles)
- src/app/api/admin/role/route.test.ts and src/app/(site)/admin/users/access-view.test.ts
- src/data/eve-data/queries.db.test.ts (getProductionModifiers)
- src/data/eve-data/structures.test.ts

Tests to add:
- An expectTypeOf in features/industry-planner/api-contract.test.ts asserting that the structure modifier kind options equal ProductionModifier['kind'] exactly. This closes the subset hole.
- A preferences.test case asserting that industryCostBasis rejects a value outside COST_BASES.
- An access-editor-model test asserting that createMapGrantsFromDrafts returns null for an 'admin' draft.
- Unit tests for sanitiseAdminAccessQuery: an array gives undefined, control characters are stripped, input is capped at 200 characters, and whitespace-only input gives undefined.

**Notes.** Behaviour to preserve:
- The page's sanitiseQuery returns undefined for a string[] (repeated ?q=). The route's version never receives arrays. The shared function must keep the array → undefined rule.
- adminRoleFormSchema still accepts q up to ADMIN_ACCESS_QUERY_MAX_LENGTH * 4 before sanitising; leave that as it is.
- The new modifier-kind tuple must keep the order 'material', 'time', 'cost'.
- $type<PriceSource>() is a type assertion at the schema level, so it is no safer than the cast at runtime. Its value is that every read and write of the column is typed in one place.

Drift: the modifier-kind satisfies checks accept subsets; the tuple-based version is the correct one.

The rig-slot MAX_*_RIGS duplication belongs to its own opportunity.

<sub>Reported by: concern:contracts-types.</sub>

<a id="p266"></a>

## P266: Name the 'attributable (non-K162) wormhole type code' predicate once in wormhole-contract

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -6 / +4
- **Depends on:** —
- **Existing primitive:** `src/data/eve-data/wormhole-contract.ts:isWormholeTypeCode/FAR_SIDE_WORMHOLE_CODE`

**Problem.** The domain rule 'a well-formed wormhole type code other than the K162 exit names the hole's type' is written as two private one-liners in two data modules. They read FAR_SIDE_WORMHOLE_CODE and isWormholeTypeCode from wormhole-contract.ts but do not share a named predicate there.

**Verifier revision.** The core holds. isEntranceType (data/maps) and attributableTypeCode (data/wh-observations) are the same predicate: a valid code that is not K162. Only one of them tolerates null. Two of the four cited sites must be dropped. In emission.ts the inline K162 check is a codex-membership path, not the regex predicate. It is also redundant, because the codex K162 entry is always farSide: true and line 29 already rejects farSide entries. The schema.ts check constraint is frozen DDL. Interpolating the constant into sql`` produces a bound parameter, so it would need sql.raw. The migration snapshots keep the literal anyway, and queries.db.test.ts already guards the constraint, so routing it through the constant buys no single source and risks a migration diff.

**Sites (5).**

- [`src/data/eve-data/wormhole-contract.ts:222-228`](../../src/data/eve-data/wormhole-contract.ts#L222-L228) — FAR_SIDE_WORMHOLE_CODE, WORMHOLE_TYPE_CODE, isWormholeTypeCode: the home
- [`src/data/maps/connection-door-types.ts:20-22`](../../src/data/maps/connection-door-types.ts#L20-L22) — isEntranceType: null-tolerant copy; used at 28-29, 44, 56, 60
- [`src/data/wh-observations/queries.ts:57-59, 65-67`](../../src/data/wh-observations/queries.ts#L57-L59) — attributableTypeCode: same predicate without the null case; guards assertObservationInput
- [`src/data/maps/connection-door-types.test.ts:16-20`](../../src/data/maps/connection-door-types.test.ts#L16-L20) — pins C247 true, K162 false, null false
- [`src/data/wh-observations/queries.db.test.ts:128-133`](../../src/data/wh-observations/queries.db.test.ts#L128-L133) — pins the K162 rejection through attributableTypeCode

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/wh-observations/emission.ts:20-29`](../../src/data/wh-observations/emission.ts#L20-L29) — Codex lookup plus entry.farSide, which is stricter than the regex. The K162 check at line 22 is redundant because the codex K162 entry is always farSide: true (universe-assets.ts 169-171; api-contract.ts 165-169 literal K162 ⇔ farSide true). Optional cleanup: delete line 22. Do not replace it with the regex predicate.
- [`src/data/wh-observations/schema.ts:33-37`](../../src/data/wh-observations/schema.ts#L33-L37) — DDL check constraint. Leave the literal: a constant inside sql`` becomes a parameter (it would need sql.raw), the drizzle snapshots freeze 'K162', and queries.db.test.ts 166-171 guards it
- [`src/data/maps/hole-matching.ts:50-57`](../../src/data/maps/hole-matching.ts#L50-L57) — codex-entry predicate (entry !== undefined && !entry.farSide): a different concept, keyed on codex data
- [`src/data/maps/signature-eliminator.ts:82-85`](../../src/data/maps/signature-eliminator.ts#L82-L85) — codex-entry predicate, different concept
- [`src/mapper/authoring/connection-intelligence.ts:50-52`](../../src/mapper/authoring/connection-intelligence.ts#L50-L52) — codex-entry predicate, different concept

</details>

**Home.** `src/data/eve-data/wormhole-contract.ts`

**Boundary check.** The home is in zone data/eve-data. Consumers are data/maps (connection-door-types.ts) and data/wh-observations (queries.ts). The data rule allows 'data/eve-data', and both files already import FAR_SIDE_WORMHOLE_CODE and isWormholeTypeCode from wormhole-contract.ts, so the change adds no new import edge.

**API sketch.**

```ts
export function isAttributableWormholeTypeCode(code: string | null | undefined): code is string {
  return code != null && code !== FAR_SIDE_WORMHOLE_CODE && isWormholeTypeCode(code);
}
```

**Migration steps.**

1. Add isAttributableWormholeTypeCode to wormhole-contract.ts directly after isWormholeTypeCode (line 228).
2. In connection-door-types.ts, delete isEntranceType (20-22) and replace its calls at 28, 29, 44, 56 and 60 with the shared predicate. Keep the FAR_SIDE_WORMHOLE_CODE import (still used at 46-47 and 57) and drop the isWormholeTypeCode import.
3. In wh-observations/queries.ts, delete attributableTypeCode (57-59), call isAttributableWormholeTypeCode(input.whTypeCode) at line 65, and drop the now-unused FAR_SIDE_WORMHOLE_CODE and isWormholeTypeCode imports.
4. Move the isEntranceType cases from connection-door-types.test.ts 16-20 into wormhole-contract.test.ts as cases for the new predicate.
5. Optional: delete the redundant `facts.whTypeCode === FAR_SIDE_WORMHOLE_CODE` disjunct at emission.ts:22. The K162 case in emission.test.ts:47 still returns null through entry.farSide.
6. Leave schema.ts unchanged.

**Tests.** Add to wormhole-contract.test.ts: 'C247' and 'P060' true; 'K162', null, undefined, 'c247', 'K16' and 'C2470' false. Existing guards still apply: connection-door-types.test.ts 22-60 (namedDoorType, applyDoorType behaviour), queries.db.test.ts 128-133 (K162 rejected with /attributable type code/) and 166-171 (DDL check), and emission.test.ts 31-47.

**Notes.** The two copies agree semantically; the only difference is null tolerance, and the shared version keeps the null-tolerant form as a type guard. There is no drift bug. This is low value on its own: bundle it with other wormhole-contract work rather than landing a standalone PR.

<sub>Reported by: area:data-eve.</sub>

<a id="p265"></a>

## P265: Parse PercentInput drafts with one grammar and name the 99% entered-bonus bound

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -8 in structure-draft and fees, +15 for the new module (+30 test lines moved or added)
- **Depends on:** —
- **Existing primitive:** `src/data/industry-math/fees.ts:parseFacilityTaxDraft`

**Problem.** PercentInput drafts are parsed by two hand-written routines. parseFacilityTaxDraft is strict: /^\d+(\.\d+)?$/, blank → null, max MAX_FACILITY_TAX_PCT. The tests pin that it rejects '1e1', '0xa', '.5', '1.' and '+1'. structure-draft.parsePct uses Number(), so it accepts all of those, maps blank to 0, and caps at a local MAX_BONUS_PCT = 99 that restates entered-bonuses' z.number().max(99). The user-facing messages hard-code both bounds a third time: 'Tax must be 0–10%.' in two components and 'Bonuses must be 0–99%.'.

**Verifier revision.** Confirmed. Two percent-draft grammars sit behind the same widget. PercentInput (src/components/PercentInput.tsx) is the only numeric input in the app, and its three uses parse differently. In one StructureComposer form, '.5', '1e1' and '0x0A' are valid bonus cells but invalid as the tax. The 99 bound is restated in structure-draft, and the error strings hard-code '0–10%' and '0–99%' again. Revised design: an options bag for blank handling is not needed. Blank-to-zero only applies after parseBonusDraft has already handled the all-blank grid, so the caller can do `?? 0`. The finders also missed the hard-coded bounds in the error messages.

**Sites (9).**

- [`src/data/industry-math/fees.ts:19, 25-34`](../../src/data/industry-math/fees.ts#L19) — MAX_FACILITY_TAX_PCT and the strict parseFacilityTaxDraft (blank → null)
- [`src/features/custom-structures/structure-draft.ts:22, 82-104, 122-123`](../../src/features/custom-structures/structure-draft.ts#L22) — local MAX_BONUS_PCT = 99; loose Number()-based parsePct (blank → 0); parseBonusDraft; tax goes through parseFacilityTaxDraft
- [`src/data/industry-math/entered-bonuses.ts:9-14`](../../src/data/industry-math/entered-bonuses.ts#L9-L14) — schema bound z.number().min(0).max(99), an unnamed literal
- [`src/components/PercentInput.tsx:6-31`](../../src/components/PercentInput.tsx#L6-L31) — the one decimal input; feeds both grammars
- [`src/features/custom-structures/components/StructureComposer.tsx:58-62, 166, 396`](../../src/features/custom-structures/components/StructureComposer.tsx#L58-L62) — same form uses PercentInput for bonus cells (166) and tax (396); messages hard-code 10 and 99
- [`src/features/owned-structures/components/CorpRigEditor.tsx:40-41, 67`](../../src/features/owned-structures/components/CorpRigEditor.tsx#L40-L41) — tax parse plus hard-coded 'Tax must be 0–10%.'
- [`src/features/custom-structures/api-contract.ts:20`](../../src/features/custom-structures/api-contract.ts#L20) — server bound already uses MAX_FACILITY_TAX_PCT; the pattern the bonus bound should follow
- [`src/data/industry-math/fees.test.ts:57-81`](../../src/data/industry-math/fees.test.ts#L57-L81) — pins strict grammar (rejects '1e1', '0xa', '1.', '.5', '+1')
- [`src/features/custom-structures/structure-draft.test.ts:38-61`](../../src/features/custom-structures/structure-draft.test.ts#L38-L61) — pins blank cells → 0 in a partly filled grid, '100' and 'abc' → field 'bonus'

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/market-prices/source-fallback.ts:45`](../../src/data/market-prices/source-fallback.ts#L45) — Number(raw) on ESI/market feed strings, not a user-typed percent draft
- [`src/scripts/refresh-prices-args.ts:11`](../../src/scripts/refresh-prices-args.ts#L11) — CLI argument parsing, different domain

</details>

**Home.** `src/data/industry-math/percent-draft.ts (new; parsePercentDraft) plus MAX_ENTERED_BONUS_PCT exported from src/data/industry-math/entered-bonuses.ts`

**Boundary check.** The home is in the data zone (autoDiscover src/data → data/industry-math), and percent-draft.ts imports nothing. fees.ts is in the same data/industry-math zone and imports it relatively. structure-draft.ts and StructureComposer.tsx (features/custom-structures) and CorpRigEditor.tsx (features/owned-structures) are in features zones. The features rule allows 'data', so importing the constants and parsers from data/industry-math is legal. The data rule does not allow 'components', which is why the parser does not live beside PercentInput.

**API sketch.**

```ts
// percent-draft.ts
export type PercentDraftResult = { ok: true; value: number | null } | { ok: false };
/** Blank → null; otherwise a plain non-negative decimal (\d+(\.\d+)?) no greater than max. */
export function parsePercentDraft(draft: string, max: number): PercentDraftResult;
// entered-bonuses.ts
export const MAX_ENTERED_BONUS_PCT = 99;
// fees.ts
export function parseFacilityTaxDraft(draft: string) { return parsePercentDraft(draft, MAX_FACILITY_TAX_PCT); }
```

**Migration steps.**

1. Create src/data/industry-math/percent-draft.ts with parsePercentDraft by moving the body of parseFacilityTaxDraft (trim, blank → {ok:true,value:null}, regex, Number, finite and 0..max check) and taking max as a parameter.
2. Reduce parseFacilityTaxDraft in fees.ts to `return parsePercentDraft(draft, MAX_FACILITY_TAX_PCT)`, keeping its export and return type so CorpRigEditor and structure-draft stay unchanged.
3. In entered-bonuses.ts, add `export const MAX_ENTERED_BONUS_PCT = 99` and use it in `bonusPct = z.number().min(0).max(MAX_ENTERED_BONUS_PCT)`.
4. In structure-draft.ts, delete MAX_BONUS_PCT (line 22) and parsePct (82-87). In parseBonusDraft, map each cell with parsePercentDraft(c, MAX_ENTERED_BONUS_PCT), fail if any result is !ok, and read the value as `value ?? 0`. Keep the all-blank → bonuses: null check at line 94 before the map.
5. Derive the messages from the constants: StructureComposer.tsx FIELD_ERROR.tax and .bonus (lines 61-62) and CorpRigEditor.tsx:41, e.g. `Tax must be 0–${MAX_FACILITY_TAX_PCT}%.`.
6. Move the grammar cases from fees.test.ts 57-81 into percent-draft.test.ts with an arbitrary max, and keep one parseFacilityTaxDraft smoke case in fees.test.ts.

**Tests.** Add src/data/industry-math/percent-draft.test.ts covering blank or whitespace → null, '0', '0.25', the max accepted, max+0.01 rejected, and '1e1', '0xa', '.5', '1.', '+1', 'NaN', 'Infinity', ' 1 2 ' rejected. It is needed anyway because Fallow coverage requires every file. In structure-draft.test.ts, add '1e1' and '0x0A' in a bonus cell → {ok:false, field:'bonus'}, '99' accepted and '99.01' rejected, and keep the existing ' 2.4 ' and blank-is-0 cases at lines 38-45. fees.test.ts 45 keeps pinning MAX_FACILITY_TAX_PCT = 10.

**Notes.** The strict grammar is the right one: it is the tested contract (fees.test.ts 66-81), and the loose parser's acceptance of exponent and hex forms is accidental. Adopting it is a user-visible change for bonus cells: '1e1', '0x0A', '+1', '.5' and '1.' become 'Bonuses must be 0–99%.' errors. The in-game window shows values like '3.38', so the realistic loss is '.5'. If '.5' should be accepted, relax the shared regex once for both fields and update fees.test.ts, which currently pins '.5' and '1.' as invalid. Do not keep two grammars. Blank semantics stay per caller and must be preserved. Tax blank → null means 'never entered', so the default rate applies (effectiveFacilityTaxRate). A bonus cell blank → 0 only when the grid has some entry. An all-blank grid → null, so hull bonuses apply (structure-draft.ts 91-94). draftPct (0 → '') and taxDraftFromStored (0 → '0') intentionally differ in the reverse direction; leave them.

<sub>Reported by: area:data-eve.</sub>

<a id="p262"></a>

## P262: Use ConnectionDoorSide and a CONNECTION_DOOR_SIDES tuple instead of 36 inline 'from' | 'to' unions and the ConnectionDoor alias

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** bypasses-existing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About ±40 type edits; net about +3 lines (tuple and imports) and -1 line (alias).
- **Depends on:** —
- **Existing primitive:** `src/data/maps/connection-hallway.ts:ConnectionDoorSide`

**Problem.** The connection door-side vocabulary has a canonical type (ConnectionDoorSide) that almost nothing outside data/maps uses:
- 36 parameter and field types across convex/lib, convex/mapAuthoringFields and the mapper restate 'from' | 'to'.
- connection-door-types re-exports the type under a second name.
- The Convex validator and the jump-door zod enum hand-list the literals instead of deriving them from one tuple.

**Sites (16).**

- [`src/data/maps/connection-hallway.ts:10`](../../src/data/maps/connection-hallway.ts#L10) — canonical ConnectionDoorSide
- [`src/data/maps/connection-door-types.ts:6-13`](../../src/data/maps/connection-door-types.ts#L6-L13) — export type { ConnectionDoorSide as ConnectionDoor }, a second name
- [`src/data/maps/connection-door-destinations.ts:9, 29, 47, 128`](../../src/data/maps/connection-door-destinations.ts#L9) — uses the ConnectionDoor alias
- [`convex/mapJumpReads.ts:6, 26, 110`](../../convex/mapJumpReads.ts#L6) — uses the ConnectionDoor alias
- [`convex/lib/mapEntityContracts.ts:71`](../../convex/lib/mapEntityContracts.ts#L71) — connectionDoorSideValidator hand-lists v.literal('from') and v.literal('to'); used at mapAuthoringFields.ts:339, 351, 361
- [`src/composition/jump-resolver/convex-door.ts:9-17`](../../src/composition/jump-resolver/convex-door.ts#L9-L17) — typedSide: z.enum(['from','to']).nullable() in a schema that otherwise uses data tuples
- [`convex/lib/mapScanElimination.ts:63, 70, 201, 207, 215, 232, 303, 314, 337, 358`](../../convex/lib/mapScanElimination.ts#L63) — 10 inline unions (side and attachedSide)
- [`convex/lib/mapStaticClaim.ts:59, 171, 205, 213`](../../convex/lib/mapStaticClaim.ts#L59) — 4 inline unions
- [`convex/lib/mapScanState.ts:132-143`](../../convex/lib/mapScanState.ts#L132-L143) — endpointSide returns 'from' \| 'to' \| null; attachedSide
- [`convex/mapAuthoringFields.ts:66, 139, 203, 225`](../../convex/mapAuthoringFields.ts#L66) — 4 inline unions
- [`src/mapper/chain/optimistic-authoring.ts:309, 527, 560, 577, 674`](../../src/mapper/chain/optimistic-authoring.ts#L309) — 5 inline unions
- [`src/mapper/authoring/connection-field-setters.ts:17, 32, 38, 60`](../../src/mapper/authoring/connection-field-setters.ts#L17) — 4 inline unions
- [`src/mapper/signatures/signature-model.ts:31, 68, 75`](../../src/mapper/signatures/signature-model.ts#L31) — endpoint and side inline unions
- [`src/mapper/signatures/connection-authoring-api.ts:89, 121`](../../src/mapper/signatures/connection-authoring-api.ts#L89) — inline unions
- [`src/mapper/signatures/SignatureWindow.tsx:56`](../../src/mapper/signatures/SignatureWindow.tsx#L56) — bindConnectionSetters side?: 'from' \| 'to' (missed by the finders)
- [`src/mapper/signatures/scanner-wormhole-cells.tsx:61`](../../src/mapper/signatures/scanner-wormhole-cells.tsx#L61) — bindConnectionSetters side?: 'from' \| 'to' (missed by the finders)

**Home.** `src/data/maps/connection-hallway.ts: add CONNECTION_DOOR_SIDES beside ConnectionDoorSide.`

**Boundary check.** connection-hallway.ts is in the data/maps zone. Consumers:
- convex: allows data. 24 convex, mapper and composition files already import connection-hallway, including mapAuthoringFields.ts:20, mapStaticClaim.ts:10 and mapScanState.ts:7.
- mapper: allows data.
- composition (jump-resolver/convex-door.ts): allows data.
- data/maps itself: same zone.

**API sketch.**

```ts
// src/data/maps/connection-hallway.ts
export const CONNECTION_DOOR_SIDES = ['from', 'to'] as const;
export type ConnectionDoorSide = (typeof CONNECTION_DOOR_SIDES)[number];
// convex/lib/mapEntityContracts.ts
export const connectionDoorSideValidator = v.union(...CONNECTION_DOOR_SIDES.map((side) => v.literal(side)));
// src/composition/jump-resolver/convex-door.ts
typedSide: z.enum(CONNECTION_DOOR_SIDES).nullable(),
```

**Migration steps.**

1. In connection-hallway.ts, add CONNECTION_DOOR_SIDES and derive ConnectionDoorSide from it.
2. Rebuild connectionDoorSideValidator (mapEntityContracts.ts:71) from the tuple. The order stays 'from', 'to', so the validator JSON and schema are identical.
3. Change jump-resolver/convex-door.ts:14 to z.enum(CONNECTION_DOOR_SIDES).nullable().
4. Replace each inline 'from' | 'to' with `import type { ConnectionDoorSide } from '@/data/maps/connection-hallway'`. Work file by file in this order: convex/lib/mapScanElimination.ts, mapStaticClaim.ts, mapScanState.ts (ConnectionDoorSide | null), convex/mapAuthoringFields.ts, then mapper/chain/optimistic-authoring.ts, mapper/authoring/connection-field-setters.ts, and in mapper/signatures: signature-model.ts, connection-authoring-api.ts, SignatureWindow.tsx and scanner-wormhole-cells.tsx.
5. Delete the ConnectionDoor alias (connection-door-types.ts:13) and switch connection-door-destinations.ts and convex/mapJumpReads.ts to ConnectionDoorSide.
6. Run pnpm check through test-runner. The change is type-only apart from the two derived enums.

**Tests.** Type-only change, guarded by the existing tests:
- src/data/maps/connection-hallway.test.ts and connection-door-types.test.ts
- src/data/maps/connection-door-destinations.test.ts
- convex/mapAuthoringFields.test.ts and convex/lib/mapStaticClaim.test.ts
- src/mapper/chain/optimistic-authoring.test.ts
- the jump-resolver convex-door tests

Add an expectTypeOf, in the P261 mapEntityContracts test, that Infer<typeof connectionDoorSideValidator> equals ConnectionDoorSide.

**Notes.** There are no behaviour differences: every site is a connection door side, and the derived enums keep the literal order. This edits the same lines in convex/lib/mapScanElimination.ts as P261's elimination-type move, so sequence them or put them in one PR. The two test-file inline unions can stay.

<sub>Reported by: concern:contracts-types.</sub>

<a id="p261"></a>

## P261: Derive Convex TS types from their validators and build every enum validator from its data-zone tuple

- **Status:** [ ] not started
- **Category:** contracts-validation · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -75 / +30. The literal maps lose about 31 lines, the CharacterResult and lease types about 18, JumpDecision 13, and the elimination types about 30 (moved, net smaller).
- **Depends on:** [P262](#p262)
- **Existing primitive:** `convex/values:Infer; tuples CONNECTION_MASS_STATES, WORMHOLE_LIFE_STAGES, WORMHOLE_SIZE_CLASSES (@/data/eve-data/wormhole-contract), MAP_ROLES (@/data/maps/access-contract)`

**Problem.** Several Convex modules keep a hand-written TS type beside the validator that already defines the same shape. These are the location-sync CharacterResult, LeaseWrite and AccessLease; the jump JumpDecision; the elimination deduction, outcome and evidence types; and BackfillPhase. Separately, convex/lib/mapEntityContracts.ts hand-enumerates mass states, life stages (twice), ship sizes, map roles and note-target kinds, even though data-zone tuples exist for all of them and the same file already builds other validators from tuples.

The `satisfies Record<X, unknown>` guards only force the *_LITERALS map to have every key. They do not force the v.union(...) call to list each literal, so a member added to a tuple can be left out of the validator and then rejected at runtime. Likewise, a field added only to a hand type compiles but is rejected by Convex argument and return validation at runtime.

**Verifier revision.** The core is real. characterLocationSync hand-writes CharacterResult (13 fields, 41-55) that mirrors characterResultValidator (Apply 25-37, plus characterSyncResultFields), and its LeaseWrite (33) shadows the exported Infer type in characterLocationAccess.ts:10. JumpDecision (mapJumpAuthoring 42-54) restates jumpDecisionValidator (27-40). mapScanElimination's three exported types restate the mapScan.ts validators (68-110). BackfillPhase restates its validator. mapEntityContracts hand-lists five vocabularies through *_LITERALS maps, and the life-stage union is written twice (96-102 and 133-138), while the same file already uses the tuple-map idiom (73-87, 214-216), as does schema.ts:23.

The stated failure mode needs correcting. If a field is added only to the validator, TS already catches it at runLocationSync's `return` (typed SyncOutcome). The runtime-only failure is the reverse case: a field added only to the hand type passes TS, but Convex's v.object rejects the extra field when finishSync runs.

Scope changes:
- (a) The mapScanElimination validators must move into convex/lib/mapScanElimination.ts. mapScan.ts imports that module, so deriving the types the other way would create a cycle, which fallow's circular-dependencies rule fails.
- (b) A literalUnion helper is unnecessary. The `v.union(...TUPLE.map((x) => v.literal(x)))` idiom is already the house style. A helper that returns a VUnion would also nest unions inside the nullable wrappers and change the schema's validator JSON.
- (c) Dropped: heartbeat reasons. Client calls into api.engine.heartbeat are already type-checked against the validator through convex/_generated. Also dropped: schema.ts:29 status, a single site with no shared tuple. The cross-runtime HTTP door vocabularies (elimination outcomes, projection outcomes, httpJump's zod jump decision) belong to the door-contract opportunity, not here.

**Sites (13).**

- [`convex/characterLocationSync.ts:16, 28-57, 64-70, 125, 170`](../../convex/characterLocationSync.ts#L16) — Hand AccessLease, LeaseWrite (shadows the exported name), HeldState, CharacterResult, LocationReadResult; SyncOutcome is already inferred from Apply's validator
- [`convex/characterLocationApply.ts:25-39, 41-53`](../../convex/characterLocationApply.ts#L25-L39) — characterResultValidator and its unexported Infer type CharacterResult; syncOutcomeValidator
- [`convex/lib/characterSync.ts:9-13`](../../convex/lib/characterSync.ts#L9-L13) — characterSyncResultFields: characterId, expiresAt and error, spread into the validator
- [`convex/characterLocationAccess.ts:4-10`](../../convex/characterLocationAccess.ts#L4-L10) — leaseWriteValidator and the exported LeaseWrite = Infer<...>
- [`convex/mapJumpAuthoring.ts:27-54, 65, 267, 435`](../../convex/mapJumpAuthoring.ts#L27-L54) — jumpDecisionValidator plus a hand readonly JumpDecision; the only producer is args.decision from the validator
- [`convex/mapScan.ts:68-110, 133, 148-150`](../../convex/mapScan.ts#L68-L110) — Elimination deduction, outcome and evidence validators; mapScan imports lib/mapScanElimination
- [`convex/lib/mapScanElimination.ts:40-59, 97-101, 379-397`](../../convex/lib/mapScanElimination.ts#L40-L59) — Hand EliminationOutcome, EliminationEvidence (canEdit: true) and EliminationDeduction, all restating mapScan.ts
- [`convex/mapChainCleanup.ts:282-294, 346-349`](../../convex/mapChainCleanup.ts#L282-L294) — backfillPhaseValidator plus a separate BackfillPhase union; NEXT_PHASE is keyed by it
- [`convex/lib/mapEntityContracts.ts:31-61, 89-102, 129-138, 182-201, 224-228`](../../convex/lib/mapEntityContracts.ts#L31-L61) — Hand *_LITERALS maps with satisfies guards and the hand-listed unions; life stage is listed twice
- [`convex/lib/mapEntityContracts.ts:73-87, 214-216`](../../convex/lib/mapEntityContracts.ts#L73-L87) — The tuple-map idiom already used in the same file
- [`convex/schema.ts:23`](../../convex/schema.ts#L23) — syncDataset uses the same tuple-map idiom
- [`src/data/eve-data/wormhole-contract.ts:3-5, 114, 213-220`](../../src/data/eve-data/wormhole-contract.ts#L3-L5) — WORMHOLE_SIZE_CLASSES, CONNECTION_MASS_STATES and WORMHOLE_LIFE_STAGES, in the same order as the hand literals
- [`src/data/maps/access-contract.ts:1-3`](../../src/data/maps/access-contract.ts#L1-L3) — MAP_ROLES ['viewer','editor','admin'], same order as MAP_ROLE_LITERALS

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/engine.ts:35`](../../convex/engine.ts#L35) — Heartbeat reasons. The client's HeartbeatReason (src/data/convex/heartbeat-loop.ts:1) reaches this mutation through convex/_generated api types, so drift is already a compile error.
- [`convex/schema.ts:29`](../../convex/schema.ts#L29) — status 'idle' \| 'running': a single site with no shared tuple
- [`convex/mapScan.ts:82-91`](../../convex/mapScan.ts#L82-L91) — The elimination outcomes mirrored by src/composition/signature-elimination/convex-door.ts:28 cross the HTTP door; that belongs to the door-contract opportunity
- [`convex/mapAccessProjection.ts:224-231`](../../convex/mapAccessProjection.ts#L224-L231) — Projection outcomes mirrored by src/composition/map-access-projection.ts:51-56; door-contract opportunity
- [`convex/httpJump.ts:22`](../../convex/httpJump.ts#L22) — The zod jumpDecisionSchema mirrors jumpDecisionValidator inside the convex zone; door-contract opportunity
- [`convex/characterLocationSync.ts:35-39`](../../convex/characterLocationSync.ts#L35-L39) — HeldState is the shape of the syncInputs query's rows, not of a validator in this file; leave it

</details>

**Home.** `Types stay beside their validators. Export CharacterResult from convex/characterLocationApply.ts. Move the three elimination validators from convex/mapScan.ts into convex/lib/mapScanElimination.ts. Change the enum validators in place in convex/lib/mapEntityContracts.ts using the existing tuple-map idiom; no new helper module.`

**Boundary check.** Every change is inside the convex zone, except the imports of data-zone tuples: WORMHOLE_SIZE_CLASSES from @/data/eve-data/wormhole-contract and MAP_ROLES from @/data/maps/access-contract. The convex rule allows [platform/esi, platform/auth, data, lib], and mapEntityContracts.ts already imports both modules (lines 2-14). Moving the elimination validators into convex/lib keeps the dependency direction mapScan.ts → lib/mapScanElimination.ts and avoids a cycle, which the circular-dependencies rule would fail.

**API sketch.**

```ts
// convex/characterLocationApply.ts
export type CharacterResult = Infer<typeof characterResultValidator>;
// convex/characterLocationSync.ts
import type { CharacterResult, syncOutcomeValidator } from './characterLocationApply';
import type { LeaseWrite } from './characterLocationAccess';
type AccessLease = Pick<LeaseWrite, 'accessToken' | 'expiresAt'>;
// convex/mapJumpAuthoring.ts
type JumpDecision = Infer<typeof jumpDecisionValidator>;
// convex/lib/mapScanElimination.ts
export const eliminationDeductionValidator = v.union(...);
export type EliminationDeduction = Infer<typeof eliminationDeductionValidator>;
export const eliminationOutcomeValidator = v.object({...});
export type EliminationOutcome = Infer<typeof eliminationOutcomeValidator>;
export const eliminationEvidenceValidator = v.object({...});
export type EliminationEvidence = Infer<typeof eliminationEvidenceValidator>;
// convex/mapChainCleanup.ts
const BACKFILL_PHASES = ['kept-connections', 'mapSignatures', 'mapSignatureActivity'] as const;
type BackfillPhase = (typeof BACKFILL_PHASES)[number];
const backfillPhaseValidator = v.union(...BACKFILL_PHASES.map((p) => v.literal(p)));
// convex/lib/mapEntityContracts.ts (flat unions, same member order as today)
export const massStateValidator = v.union(...CONNECTION_MASS_STATES.map((s) => v.literal(s)), v.null());
export const lifeStageValidator = v.union(...WORMHOLE_LIFE_STAGES.map((s) => v.literal(s)), v.null());
// connectionLifetimeValidator stage arm: lifeStage: v.union(...WORMHOLE_LIFE_STAGES.map((s) => v.literal(s)))
export const shipSizeValidator = v.union(...WORMHOLE_SIZE_CLASSES.map((s) => v.literal(s)), v.null());
export const currentMapRoleValidator = v.union(...MAP_ROLES.map((r) => v.literal(r)));
export const mapRoleValidator = v.union(...MAP_ROLES.map((r) => v.literal(r)), legacyMapOwnerRoleValidator);
export const noteTargetKindValidator = v.union(...NOTE_TARGET_KINDS.map((k) => v.literal(k)));
```

**Migration steps.**

1. Add convex/lib/mapEntityContracts.test.ts first. It should assert, with toEqual, that each enum validator equals the hand-written union of today: the same literal order, with null last. Also add expectTypeOf checks that Infer<typeof massStateValidator> is ConnectionMassState | null, and likewise for life stage, ship size, current/stored role and note target. Together these prove the schema is unchanged.
2. In mapEntityContracts.ts, rewrite massStateValidator, lifeStageValidator, the lifetime stage arm (133-138), shipSizeValidator, currentMapRoleValidator, mapRoleValidator and noteTargetKindValidator with the tuple-map idiom. Import WORMHOLE_SIZE_CLASSES and MAP_ROLES. Delete MASS_STATE_LITERALS, LIFE_STAGE_LITERALS, NOTE_TARGET_KIND_LITERALS, SHIP_SIZE_LITERALS and MAP_ROLE_LITERALS (31-61). Do not wrap a tuple union in a second v.union: keep the unions flat so the schema JSON is identical.
3. In characterLocationApply.ts, export `type CharacterResult` (line 39).
4. In characterLocationSync.ts, delete AccessLease, LeaseWrite and CharacterResult (28-34, 41-55). Import CharacterResult from Apply and LeaseWrite from Access, set AccessLease = Pick<LeaseWrite, 'accessToken' | 'expiresAt'>, and keep LocationReadResult as an Omit of CharacterResult.
5. In mapJumpAuthoring.ts, replace the hand JumpDecision (42-54) with Infer<typeof jumpDecisionValidator>. readonly parameter uses accept the mutable Infer arrays.
6. Move eliminationDeductionValidator, eliminationOutcomeValidator and eliminationEvidenceValidator from mapScan.ts (68-110) into lib/mapScanElimination.ts, export them, and replace the hand types at 40-59 and 379-390 with Infer. mapScan.ts imports the validators.
7. collectEliminationEvidence returns canEdit: true while the validator says v.boolean(). Either accept boolean or type its return as Omit<EliminationEvidence, 'canEdit'> & { readonly canEdit: true }. No caller depends on the literal today.
8. In mapChainCleanup.ts, add BACKFILL_PHASES and derive both backfillPhaseValidator and BackfillPhase from it.
9. Run the convex suite through test-runner, plus pnpm check for fallow cycles and unused exports.

**Tests.** New: convex/lib/mapEntityContracts.test.ts, with a validator equality test (shape and order) and expectTypeOf against the data-zone types.

Existing guards:
- convex/characterLocationSync.test.ts and characterLocationSync.prep.test.ts
- convex/characterLocationApply.test.ts and characterLocationAccess.test.ts
- convex/mapScan.test.ts, mapScanIdentify.test.ts and mapJump*.test.ts
- convex/lib/mapChainCleanup.test.ts
- convex/__tests__/export-coverage.test.ts and modules.test.ts

**Notes.** - Infer<> yields mutable arrays and non-readonly properties; the current hand types are readonly. Every consumer takes readonly parameters, which accept mutable arrays, so no call site should break.
- The tuple orders were checked against the hand literal order: mass stable, reduced, critical; life stages under_1_day, under_4_hours, under_1_hour, expired; sizes S, M, L, XL; roles viewer, editor, admin; note targets map, system, signature. The validator JSON, and therefore the deployed schema, stays byte-identical.
- The `satisfies Record<X, unknown>` guards become unnecessary once the validators are derived from the tuples.
- Coordinate with P262: both edit convex/lib/mapScanElimination.ts and mapEntityContracts.ts:71, so land them in one PR or land P261 first.
- The proposal's literalUnion helper is rejected. It saves almost nothing over the existing idiom, and a VUnion-returning version would nest unions under v.null() and change the schema JSON.

<sub>Reported by: area:convex, concern:contracts-types, concern:esi-sync.</sub>

<a id="p124"></a>

## P124: Give the wormhole codex one code index (lowest typeId wins, conflicts exposed) shared by client, hole-matching, emission and the eliminator

- **Status:** [ ] not started
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About 25 lines removed and 35 added (new module about 30 lines plus test)
- **Depends on:** —
- **Existing primitive:** `src/data/eve-data/universe-assets-client.ts:loadUniverseAssets/loadWormholeCodex (index logic, not exported)`

**Problem.** Four places turn WormholeCodexEntry[] into a code-to-entry lookup, and each resolves SDE clone clusters (several typeIds for one code) differently: lowest typeId, last in array, first in array, and first-or-fail-on-conflict. Because buildWormholeCodex orders clones by unordered DB row order, the server picks are arbitrary. For attribute-conflicting clones, hole-matching and emission can disagree about the same code within one request. buildWormholeEffects already settles the same question for effect beacons with 'lower type id wins'.

**Verifier revision.** The code-to-entry drift is real. It has four consumers and three winner policies:
- The client keeps the lowest typeId.
- hole-matching builds `new Map(codex.map(...))`, so the last entry wins.
- emission uses codex.find, so the first wins.
- The eliminator keeps the first and fails closed on attribute-conflicting clones.

Clones are real (C729 in universe-assets-client.test.ts:247). buildWormholeCodex sorts only by code (universe-assets.ts:211) over a query with no ORDER BY, so first and last within a clone cluster are arbitrary DB order. For conflicting clones, hole-matching and emission can therefore read different entries in the same doorbell request. The rest of the proposal does not hold up:

(a) Efficiency. resolveDoorbell does at most about 7 finds over about 8.4k systems and one over the adjacency list. That is well under a millisecond next to the Convex and Postgres round trips. 'Index once per request' would build an 8k-entry Map per request, which costs more than the scans it replaces. Rejected.

(b) effectKey. The client's `${effect}:${class}` key and buildWormholeEffects' dedupe key are private Map keys that never cross a boundary, so nothing couples them. Rejected.

(c) indexSystemDirectory and indexAdjacency are one-line `new Map(...)` calls with a single real consumer. Rejected.

What survives is one codex-by-code index with one winner policy and conflict detection.

**Sites (10).**

- [`src/data/eve-data/universe-assets-client.ts:100-107, 112-118`](../../src/data/eve-data/universe-assets-client.ts#L100-L107) — client code index; lowest typeId wins; sorted unique codes()
- [`src/data/maps/hole-matching.ts:50-57, 123-124`](../../src/data/maps/hole-matching.ts#L50-L57) — Map constructor, so the last entry per code wins; typedEntry reads targetClass and maxJumpMass
- [`src/data/maps/signature-eliminator.ts:59-90, 232`](../../src/data/maps/signature-eliminator.ts#L59-L90) — sameCodeMeaning plus codebook: first wins, any conflicting clone makes the result QUIET; used only as a validity gate
- [`src/data/wh-observations/emission.ts:16-29`](../../src/data/wh-observations/emission.ts#L16-L29) — codex.find (first wins) per call, reading targetClass
- [`src/composition/signature-elimination/resolver.ts:52-60, 110-137`](../../src/composition/signature-elimination/resolver.ts#L52-L60) — calls observationFor once per settled signature with the same codex array
- [`src/composition/jump-resolver/resolver.ts:197-221, 380-401`](../../src/composition/jump-resolver/resolver.ts#L197-L221) — the same request passes codex.types to matchJump (last wins) and to observationFor (first wins)
- [`src/data/eve-data/universe-assets.ts:155-211, 293-340`](../../src/data/eve-data/universe-assets.ts#L155-L211) — buildWormholeCodex keeps clones and sorts by code only (211); the wormhole type query has no ORDER BY
- [`src/data/eve-data/wormhole-effects.ts:211-239`](../../src/data/eve-data/wormhole-effects.ts#L211-L239) — precedent: effect beacons deduped with lower type id wins
- [`src/data/eve-data/universe-assets-client.test.ts:247-290`](../../src/data/eve-data/universe-assets-client.test.ts#L247-L290) — pins lowest typeId (C729 56026 over 56546)
- [`src/data/maps/signature-eliminator.test.ts:357-387`](../../src/data/maps/signature-eliminator.test.ts#L357-L387) — pins identical clones staying live and conflicting clones failing closed

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/jump-resolver/resolver.ts:145-173`](../../src/composition/jump-resolver/resolver.ts#L145-L173) — Linear system and adjacency scans are fine at about 8.4k entries and a handful of calls per request; a per-request index would cost more
- [`src/data/eve-data/universe-assets-client.ts:71-75, 108-110, 119-121`](../../src/data/eve-data/universe-assets-client.ts#L71-L75) — systemById, neighboursById and effectByKey are one-line Maps with one consumer; the effect key is private to this closure
- [`src/data/eve-data/wormhole-effects.ts:227`](../../src/data/eve-data/wormhole-effects.ts#L227) — Private dedupe key; nothing else reads it, so it needs no shared format
- [`src/data/wh-statics/cross-check.ts:46-49`](../../src/data/wh-statics/cross-check.ts#L46-L49) — Needs every clone (typeId→code and the code vocabulary); must keep using raw codex.types

</details>

**Home.** `src/data/eve-data/wormhole-codex-index.ts (new, pure: only a type import from './universe-assets', so it is client-safe like universe-assets-client's existing type imports)`

**Boundary check.** Home zone data/eve-data.

Consumers:
- universe-assets-client.ts is in the same zone.
- src/data/maps/hole-matching.ts and signature-eliminator.ts are zone data/maps.
- src/data/wh-observations/emission.ts is zone data/wh-observations.

The 'data' rule explicitly allows 'data/eve-data', so all are legal. The composition callers (jump-resolver, signature-elimination) only pass arrays through, or optionally an index; the composition rule allows 'data'. Client consumers in mapper already reach it through universe-assets-client, and the mapper rule allows 'data'.

**API sketch.**

```ts
export interface WormholeCodexIndex {
  byCode(code: string): WormholeCodexEntry | null; // lowest typeId in the clone cluster
  readonly codes: readonly string[];               // unique, sorted
  readonly conflictingCodes: ReadonlySet<string>;  // clones whose farSide/mass/lifetime/size/targetClass differ
}
export function indexWormholeCodex(entries: readonly WormholeCodexEntry[]): WormholeCodexIndex;
```

**Migration steps.**

1. Create wormhole-codex-index.ts:
- Move sameCodeMeaning from signature-eliminator.ts:59-72 here (private).
- Fold the entries, keeping the lowest typeId per code and adding the code to conflictingCodes when !sameCodeMeaning(existing, entry).
- Compute codes as the sorted keys.
Add wormhole-codex-index.test.ts covering:
- order independence (reversed input gives the same winner)
- identical clones are not conflicts
- an attribute or farSide mismatch is a conflict
- codes are sorted and unique
2. universe-assets-client.ts: replace 100-107 with `const index = indexWormholeCodex(result.data.types)`. byCode and codes() delegate to it, and codes() returns index.codes. Leave effectByKey alone.
3. signature-eliminator.ts codebook: build the index, return null if conflictingCodes.size > 0, then run the existing statics and facts validity checks through index.byCode. Delete the local Map loop and sameCodeMeaning.
4. hole-matching.ts: replace line 124 with `const codex = indexWormholeCodex(evidence.codex)` and change typedEntry to take `codex.byCode`. Add a hole-matching test where two clones with different targetClass arrive in both orders, and assert that the lowest typeId's targetClass decides.
5. emission.ts: change observationFor's second parameter to `Pick<WormholeCodexIndex, 'byCode'>` and replace the find on line 28 with byCode. In signature-elimination/resolver.ts, build the index once before the loop at 119. In jump-resolver/resolver.ts emitObservation, build it from codex.types. Update emission.test.ts fixtures to pass indexWormholeCodex(CODEX).
6. Optional hardening: sort buildWormholeCodex by `left.code.localeCompare(right.code) || left.typeId - right.typeId` (universe-assets.ts:211), so the published asset is deterministic too. Consumers no longer depend on that order.

**Tests.** New tests:
- wormhole-codex-index.test.ts
- An order-independence case in src/data/maps/hole-matching.test.ts

Existing guards:
- universe-assets-client.test.ts:247 (lowest typeId, one code per cluster)
- signature-eliminator.test.ts:357-387 (identical clones live, conflicting clones fail closed)
- emission.test.ts
- composition/jump-resolver/resolver.test.ts
- composition/signature-elimination tests
- wh-statics cross-check.test.ts:88 (clones count as agreement), which must stay untouched

**Notes.** Correct policy: lowest typeId, the same as the client and buildWormholeEffects.

Behaviour to preserve:
- The eliminator still returns QUIET when any code in the codex has conflicting clones, not only codes in the input.
- For attribute-identical clones (the only kind seen in the SDE so far), no server outcome changes, because hole-matching and emission read only farSide, targetClass and maxJumpMass.
- The only behaviour change is for conflicting clones: hole-matching and emission become deterministic (lowest typeId) instead of DB-order dependent.

Whether hole-matching and emission should instead fail closed on conflictingCodes, as the eliminator does, is a product decision. The index exposes the set so either is a one-line change.

Keep cross-check on the raw types list. Do not build a per-request system or adjacency index in jump-resolver.

<sub>Reported by: area:data-eve.</sub>

<a id="p125"></a>

## P125: Share the system-code-set comparison between wh-statics diff and cross-check

- **Status:** [ ] not started
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About 40 lines removed and 40 added (new module about 35 lines); net about 0 plus one test file; the value is one definition, not line count
- **Depends on:** —

**Problem.** diff.ts and cross-check.ts each implement grouping of (systemId, code) pairs into code sets, set equality, sorted code output, and the sorted-union walk that classifies each system as only-left, only-right, equal or different. Both results are persisted as jsonb in wh_statics_snapshots, so their ordering rules must stay identical, and today they are kept in sync only by copy.

**Sites (4).**

- [`src/data/wh-statics/diff.ts:8-26, 32-60`](../../src/data/wh-statics/diff.ts#L8-L26) — codesBySystem, sortedCodes, sameCodes, and the union walk feeding systemsAdded, systemsRemoved and systemsChanged
- [`src/data/wh-statics/cross-check.ts:23-39, 41-88`](../../src/data/wh-statics/cross-check.ts#L23-L39) — addToSystemSet, sortedValues, equalSets, and the union walk feeding feedOnly, lineageOnly, agreed and disagreements; validation throws at 52-54 and 59-60
- [`src/composition/wh-statics-refresh.ts:58-65`](../../src/composition/wh-statics-refresh.ts#L58-L65) — both run on the same feed in one refresh
- [`src/data/wh-statics/schema.ts:30-34, 47-67, 79-81`](../../src/data/wh-statics/schema.ts#L30-L34) — WhStaticEntry {systemId, systemName, code}; WhStaticsDiff and WhStaticsCrossCheck persisted as jsonb

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/wh-statics/queries.ts:89-98`](../../src/data/wh-statics/queries.ts#L89-L98) — canonicalEntries sorts raw entries with localeCompare for the snapshot digest, a different concept; leave its order alone because it feeds a hash
- [`src/data/wh-statics/diff.ts:28-30, 62-69`](../../src/data/wh-statics/diff.ts#L28-L30) — Code-vocabulary deltas are diff-only

</details>

**Home.** `src/data/wh-statics/code-sets.ts (new)`

**Boundary check.** Home and both consumers (diff.ts, cross-check.ts) are in zone data/wh-statics (data autoDiscover), so these are intra-zone imports with no rule needed. The module imports nothing.

**API sketch.**

```ts
export interface SystemCode { readonly systemId: number; readonly code: string }
export function codesBySystem(pairs: Iterable<SystemCode>): Map<number, Set<string>>;
export function sortedCodes(codes: ReadonlySet<string>): string[]; // [...codes].sort()
export type SystemCodeComparison =
  | { kind: 'left-only'; systemId: number; left: string[] }
  | { kind: 'right-only'; systemId: number; right: string[] }
  | { kind: 'equal'; systemId: number }
  | { kind: 'different'; systemId: number; left: string[]; right: string[] };
export function compareSystemCodes(left: ReadonlyMap<number, ReadonlySet<string>>, right: ReadonlyMap<number, ReadonlySet<string>>): SystemCodeComparison[]; // ascending systemId
```

**Migration steps.**

1. Create code-sets.ts with codesBySystem, sortedCodes, a private sameCodes, and compareSystemCodes, which walks the ascending numeric union of keys.
Add code-sets.test.ts covering:
- duplicate pairs collapse
- numeric (not lexicographic) system order, e.g. 30000142 vs 31000005
- codes sorted with default sort
- all four kinds
2. diff.ts: delete codesBySystem, sortedCodes and sameCodes (8-26). Build both maps with codesBySystem and map compareSystemCodes(promoted, incoming):
- left-only → systemsRemoved {codes: left}
- right-only → systemsAdded {codes: right}
- different → systemsChanged {before: left, after: right}
- equal → skip
Keep vocabulary and the code deltas. Move the WhStaticAssignment shape to SystemCode, or alias it, so no export is left unused.
3. cross-check.ts: keep the validation loops and their order (feed first, throwing UnknownCodexStaticError, then lineage, throwing UnknownLineageTypeError). Collect validated pairs and call codesBySystem. Delete addToSystemSet, sortedValues and equalSets (23-39). Map compareSystemCodes(feed, lineage):
- left-only → feedOnlySystems
- right-only → lineageOnlySystems
- equal → agreedSystems++
- different → disagreements {feedCodes: left, lineageCodes: right}

**Tests.** New tests:
- src/data/wh-statics/code-sets.test.ts

Existing guards:
- src/data/wh-statics/diff.test.ts: added, removed and changed; codes carried; dedupe and zero diff.
- src/data/wh-statics/cross-check.test.ts: agreement and one-sided systems; both throw paths; duplicate codex type ids as agreement.
- src/data/wh-statics/cross-check.db.test.ts
- wh-statics queries.db.test.ts, which persists the jsonb.

**Notes.** Behaviour to preserve exactly:
- System ids sort numerically ascending, and code arrays use the default [...set].sort(), not localeCompare. Both outputs are persisted jsonb, and changing the order would make new snapshots look different from old ones.
- cross-check must throw before any comparison, and in the same order: feed codes are validated first.
- In diff, 'before' is promoted and 'after' is incoming. In cross-check, left is feed and right is lineage, so keep those argument orders.
- Persisted field names are unchanged.

No drift was found between the two copies; they are behaviourally identical today.

<sub>Reported by: area:data-eve.</sub>

<a id="p082"></a>

## P082: Anchor the typed lifetime ceiling on firstSeenAt through one connection-lifetime helper, make isCodexSizeLocked a type guard, and reuse staticClassForCode

- **Status:** [ ] not started
- **Category:** client-data · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -30 / +20 across 10 files; one intentional display change (an earlier ceiling for migrated connections)
- **Depends on:** [P124](#p124), [P266](#p266)
- **Existing primitive:** `src/mapper/signatures/use-system-statics.ts:staticClassForCode,destinationClassIdForCode`

**Problem.** Typed-lifetime math is split across three modules that have drifted. The editor/scanner ceiling (lifetimeSource) anchors on connection._creationTime. The window the client writes (wormholeTypeWindowProposal) anchors on firstSeenAt ?? _creationTime. For connections migrated from a signature (firstSeenAt < _creationTime, no stored window), the panel shows a later 'Typed ceiling' / '≤ Nh' than the truth. The 'finite and >= 0 lifetimeMinutes' guard is written three times. isCodexSizeLocked is the codex near-side predicate but not a type guard, so callers narrow again right after calling it. The scanner computes 'class label for a wormhole code' inline twice, although staticClassForCode already exists in the same directory.

**Verifier revision.** The core holds, and part of it is a real bug. (1) The lifetime anchor drift is reachable. convex/lib/mapScanApply.ts:241-267 migrates a signature into a connection with firstSeenAt = signature._creationTime, which is earlier than the new row's _creationTime, and blankHallway gives it lifetime {kind:'unknown'}. lifetimeSource therefore takes the ceiling branch and anchors on connection._creationTime (connection-intelligence.ts:154-155), while wormholeTypeWindowProposal anchors on firstSeenAt ?? _creationTime (optimistic-authoring.ts:453). The hole spawned no later than firstSeenAt, so the firstSeenAt bound is the correct one. The _creationTime bound overstates the remaining life. (2) The 'usable lifetimeMinutes' guard exists three times, not two: connection-intelligence 148-153, optimistic-authoring 446-450, and connection-lifetime 51-56. (3) isCodexSizeLocked returns a plain boolean, so signature-model:278 and connection-fields:295 narrow again. (4) The two inline class-label copies have exactly the semantics of staticClassForCode(...)?.className. What changed: the proposed home src/data/eve-data/universe-assets.ts is wrong. It is a server module that imports @/db, drizzle-orm and next/cache at lines 1-3, and every mapper and data/maps importer takes only types from it. A runtime guard there would pull the DB client into client bundles. The guard belongs in wormhole-contract.ts, the pure module that mapper and data/maps already import at runtime. It must be written structurally, because universe-assets imports wormhole-contract and a reverse type import would form a cycle. Moving staticClassForCode/destinationClassIdForCode to data/eve-data is unnecessary: every consumer (use-system-statics, use-map-chain-pages:101, use-signature-page, scanner-wormhole-cells) is in mapper, and no data/* code needs a WormholeCodex-based class label. hole-matching's typedEntry cannot be 'replaced' by the guard, since it also resolves the candidate's code; only its inner check delegates.

**Sites (17).**

- [`src/mapper/authoring/connection-intelligence.ts:129-161`](../../src/mapper/authoring/connection-intelligence.ts#L129-L161) — LifetimeConnection picks only _creationTime; lifetimeSource ceiling = _creationTime + lifetimeMinutes (154-155); inline lifetime guard 148-153
- [`src/mapper/chain/optimistic-authoring.ts:442-458`](../../src/mapper/chain/optimistic-authoring.ts#L442-L458) — same lifetime guard (446-450); anchor firstSeenAt ?? _creationTime (453), which is correct
- [`src/data/maps/connection-lifetime.ts:45-64`](../../src/data/maps/connection-lifetime.ts#L45-L64) — third copy of the lifetime guard in deathWindowForReport (51-56)
- [`convex/lib/mapScanApply.ts:205-229, 241-267, 289-291`](../../convex/lib/mapScanApply.ts#L205-L229) — migrated connections are inserted with firstSeenAt = signature._creationTime and a blank (unknown) lifetime, which makes the drift reachable
- [`src/data/maps/connection-hallway.ts:170-176`](../../src/data/maps/connection-hallway.ts#L170-L176) — lifetimeDeathWindow returns null for non-window lifetimes, so the ceiling branch runs
- [`src/mapper/authoring/connection-intelligence.ts:50-65, 92-101`](../../src/mapper/authoring/connection-intelligence.ts#L50-L65) — isCodexSizeLocked returns boolean; codexPanelFacts and massRowDisplay repeat the null/farSide check
- [`src/mapper/signatures/signature-model.ts:274-282`](../../src/mapper/signatures/signature-model.ts#L274-L282) — isCodexSizeLocked(entry) && entry !== null && entry.farSide === false
- [`src/mapper/authoring/connection-fields.tsx:149, 289-310`](../../src/mapper/authoring/connection-fields.tsx#L149) — lockedSize boolean is passed down, then SizeField narrows again at 294-297
- [`src/mapper/chain/optimistic-authoring.ts:489-502`](../../src/mapper/chain/optimistic-authoring.ts#L489-L502) — lifetimeMinutesFromEntry does the null/farSide check again
- [`src/mapper/signatures/use-system-statics.ts:11-28`](../../src/mapper/signatures/use-system-statics.ts#L11-L28) — canonical destinationClassIdForCode/staticClassForCode
- [`src/mapper/chain/use-map-chain-pages.ts:101`](../../src/mapper/chain/use-map-chain-pages.ts#L101) — existing shared consumer of staticClassForCode
- [`src/mapper/signatures/use-signature-page.ts:42-52`](../../src/mapper/signatures/use-signature-page.ts#L42-L52) — inline copy of staticClassForCode(...)?.className
- [`src/mapper/signatures/scanner-wormhole-cells.tsx:93-97`](../../src/mapper/signatures/scanner-wormhole-cells.tsx#L93-L97) — classLabelOf, an inline copy of the same
- [`src/data/maps/hole-matching.ts:50-57`](../../src/data/maps/hole-matching.ts#L50-L57) — typedEntry looks up the code, then checks near-side inline; the inner check can delegate
- [`src/data/wh-observations/emission.ts:28-29`](../../src/data/wh-observations/emission.ts#L28-L29) — entry === undefined \|\| entry.farSide
- [`src/data/maps/signature-eliminator.ts:82-85`](../../src/data/maps/signature-eliminator.ts#L82-L85) — entry !== undefined && !entry.farSide
- [`src/app/(site)/preview/widgets/universe-assets-proof.tsx:30-35`](../../src/app/%28site%29/preview/widgets/universe-assets-proof.tsx#L30-L35) — entry === null \|\| entry.farSide

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/eve-data/universe-assets.ts:1-31`](../../src/data/eve-data/universe-assets.ts#L1-L31) — rejected as the guard's home: a server module (imports @/db, drizzle-orm, next/cache); mapper and data/maps import only its types
- [`src/scripts/check-universe-assets.ts:51-59, 103-127`](../../src/scripts/check-universe-assets.ts#L51-L59) — throwing assertions with tailored error messages (typedEntry, isRegenerationBearing, requireFarSide); different contract, so leave as is
- [`src/data/maps/signature-eliminator.ts:59-72`](../../src/data/maps/signature-eliminator.ts#L59-L72) — sameCodeMeaning compares discriminants of two entries; this is not narrowing
- [`src/data/eve-data/system-identity.ts:30`](../../src/data/eve-data/system-identity.ts#L30) — systemClassText is already the shared label primitive; there is no need for a new codexClassLabel in data/eve-data

</details>

**Home.** `src/data/maps/connection-lifetime.ts (typedLifetimeWindow plus a private usable-lifetime guard); src/data/eve-data/wormhole-contract.ts (generic isTypedCodexEntry); keep src/mapper/signatures/use-system-statics.ts:staticClassForCode where it is`

**Boundary check.** connection-lifetime.ts is in zone data/maps. Its consumers mapper/authoring/connection-intelligence.ts and mapper/chain/optimistic-authoring.ts are zone mapper; rule {from: mapper, allow: [..., data, ...]} permits it, and both already import this file. wormhole-contract.ts is in zone data/eve-data. mapper consumers are allowed by the mapper rule's 'data' (connection-intelligence.ts:1-5 already imports it at runtime). data/maps (hole-matching, signature-eliminator) and data/wh-observations (emission) consumers are allowed by {from: data, allow: [data/eve-data, ...]}, and hole-matching.ts:1-10 already imports it at runtime. The app preview widget is allowed by {from: app, allow: [data]}. staticClassForCode stays in zone mapper and every consumer is mapper. Cycle check: universe-assets.ts imports wormhole-contract.ts at runtime, so the guard must be generic over {farSide: boolean} and must not import the universe-assets types.

**API sketch.**

```ts
// src/data/eve-data/wormhole-contract.ts
export function isTypedCodexEntry<Entry extends { readonly farSide: boolean }>(
  entry: Entry | null | undefined,
): entry is Extract<Entry, { farSide: false }>;

// src/data/maps/connection-lifetime.ts
export interface LifetimeAnchor { readonly firstSeenAt: number | null; readonly _creationTime: number }
/** [anchor, anchor + lifetime] with anchor = firstSeenAt ?? _creationTime; null unless lifetimeMinutes is finite and >= 0. */
export function typedLifetimeWindow(connection: LifetimeAnchor, lifetimeMinutes: number | null): ConnectionDeathWindow | null;
// private: function usableLifetimeMs(minutes: number | null): number | null  (also used by deathWindowForReport)

// src/mapper/authoring/connection-intelligence.ts
export function isCodexSizeLocked(entry: WormholeCodexEntry | null): entry is TypedWormholeCodexEntry; // delegates to isTypedCodexEntry
export type LifetimeConnection = Pick<ConnectionDetail, '_creationTime' | 'firstSeenAt'> & { readonly lifetime: ConnectionLifetime };
```

**Migration steps.**

1. In src/data/maps/connection-lifetime.ts add a private usableLifetimeMs(minutes) (null for null, non-finite or negative) and use it for deathWindowForReport's lifetimeCap (POSITIVE_INFINITY when null). Export typedLifetimeWindow(connection, lifetimeMinutes) returning {earliestAt: anchor, latestAt: anchor + ms} with anchor = connection.firstSeenAt ?? connection._creationTime. Add cases to connection-lifetime.test.ts.
2. Rewrite optimistic-authoring.wormholeTypeWindowProposal (442-458) as: const typed = typedLifetimeWindow(connection, lifetimeMinutes); return typed === null ? storedWindow(connection) : intersectOrReset(storedWindow(connection), typed). The existing 'server parity' tests in optimistic-authoring.test.ts (~384-420) must pass unchanged.
3. Add the generic isTypedCodexEntry to src/data/eve-data/wormhole-contract.ts, with tests in wormhole-contract.test.ts covering null, undefined, K162 and a typed entry.
4. In connection-intelligence.ts make isCodexSizeLocked a type guard that delegates to isTypedCodexEntry. Use the guard in codexPanelFacts (57) and massRowDisplay (98-99), and in lifetimeSource (148-158) call typedLifetimeWindow(connection, isTypedCodexEntry(entry) ? entry.lifetimeMinutes : null), setting ceilingAt = window.latestAt. Widen LifetimeConnection to Pick<ConnectionDetail, '_creationTime' | 'firstSeenAt'>.
5. Widen the Pick in signature-model scannerWormholeLifetime and scannerLifeUpperBound (285, 295) to include 'firstSeenAt'. All runtime callers already pass ConnectionEditorDetail, which has firstSeenAt: number | null.
6. Remove the re-narrowing: signature-model.ts:278 becomes `if (isCodexSizeLocked(entry)) return entry.sizeClass;`. In connection-fields SizeField (294-297), derive the locked readout from isCodexSizeLocked(entry) so TypeScript narrows entry. Keep or drop the lockedSize prop, but keep using it for readOnly so unused-component-props stays clean.
7. Replace the remaining inline near-side checks with isTypedCodexEntry: optimistic-authoring lifetimeMinutesFromEntry (489-495), use-system-statics destinationClassIdForCode (15-16), hole-matching typedEntry's inner check (56; the helper itself stays), emission.ts:29, signature-eliminator.ts:84, and universe-assets-proof.tsx:33.
8. In use-signature-page.ts (45-50) pass `(code) => staticClassForCode(code, codex)?.className ?? null`. In scanner-wormhole-cells.tsx (93-97) do the same inside useCallback. Import from './use-system-statics' and drop the now-unused systemClassText imports.
9. Update test fixtures: connection-intelligence.test.ts CONNECTION and withWindow (38-55) gain firstSeenAt: null, and the signature-model.test.ts lifetime fixtures likewise. Add a case with firstSeenAt < _creationTime asserting that the ceiling title and label use the earlier anchor.

**Tests.** Existing guards: optimistic-authoring.test.ts ('proposes a typed ceiling that never widens a stored window (server parity)'); connection-intelligence.test.ts (ceiling/range/expired, '16h' upper bound); signature-model.test.ts (~378-385, '≤ 14h'); use-system-statics.test.ts; use-signature-page.test.ts; scanner-wormhole-cells.test.ts; hole-matching.test.ts; emission.test.ts; connection-lifetime.test.ts. New tests: a connection-intelligence case where firstSeenAt = _creationTime - 2h, asserting ceilingAt = firstSeenAt + lifetime (the intended display change); typedLifetimeWindow cases for null, NaN, negative and 0 minutes and for both anchor fallbacks; isTypedCodexEntry cases in src/data/eve-data/wormhole-contract.test.ts.

**Notes.** Correct copy: the anchor firstSeenAt ?? _creationTime (optimistic-authoring.ts:453). The hole existed no later than firstSeenAt, so firstSeenAt + max lifetime is a valid and tighter upper bound, while the _creationTime ceiling can promise extra hours of life. The three lifetime guards agree semantically (finite && >= 0); deathWindowForReport maps 'invalid' to POSITIVE_INFINITY and the others map it to 'no typed window', and that behavior must be kept. Drop the finder's universe-assets.ts home (server-only module) and the move of staticClassForCode to data/eve-data (no non-mapper consumer). Do not try to delete hole-matching.typedEntry: it also does the candidate.wormholeTypeCode lookup.

<sub>Reported by: area:mapper-chain, area:mapper-signatures.</sub>

<a id="p329"></a>

## P329: Make deathWindowFrom the single death-window constructor (mapper optimistic args, convex validation) and delete test-only data wrappers

- **Status:** [ ] not started
- **Category:** simplification · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -35 / +6
- **Depends on:** [P082](#p082)
- **Existing primitive:** `src/data/maps/connection-lifetime.ts:deathWindowFrom`

**Problem.** The rule for a valid connection death window (both timestamps present, finite, earliest <= latest) has a canonical owner, deathWindowFrom, that production never calls. The mapper's optimistic updates build windows with a local deathWindowFromArgs that skips the finite and ordered checks, so an inverted or NaN window can appear in the optimistic store until the server rejects the mutation. Convex validation and resolveDeathWindow repeat the rule inline. Separately, getAdjustedPrice and isKnownSpaceSystemId are production exports kept alive only by their own tests.

**Verifier revision.** The core is real, and stronger than the finder reported. deathWindowFrom (data/maps/connection-lifetime.ts:32-43) has no production consumer; its only non-test caller is the test helper data/maps/__tests__/connection-fold.ts:131. Production meanwhile builds and checks death windows by hand in three places. (1) mapper/chain/optimistic-authoring.ts:425-433 deathWindowFromArgs, which the finder missed, is a production near-copy of deathWindowFrom without the finite and ordered checks; it is used at lines 297 and 328. (2) convex/lib/mapEntityContracts.ts:268-278 validateDeathWindowInput repeats the 'finite and ordered' predicate inline. (3) convex/mapAuthoringFields.ts:86-119 resolveDeathWindow rebuilds the window by hand after validation and includes an unreachable undefined branch (lines 110-115). Adopting deathWindowFrom at these sites gives it a real owner. getAdjustedPrice (only queries.test.ts) and isKnownSpaceSystemId (only wormhole-contract tests) are confirmed test-only wrappers. pendingResolution is excluded. It is a fixture factory used by four test files across data and mapper, and it sits beside its production sibling destinationResolution. The 'pending' variant is still part of the stored validator and is still read by the mapper, so moving 10 lines into a test helper is churn without payoff.

**Sites (8).**

- [`src/data/maps/connection-lifetime.ts:32-43`](../../src/data/maps/connection-lifetime.ts#L32-L43) — deathWindowFrom: the canonical rule (typeof number, Number.isFinite on both, earliestAt <= latestAt)
- [`src/data/maps/__tests__/connection-fold.ts:131`](../../src/data/maps/__tests__/connection-fold.ts#L131) — The only non-test-file caller of deathWindowFrom, and it is a test helper
- [`src/mapper/chain/optimistic-authoring.ts:425-433`](../../src/mapper/chain/optimistic-authoring.ts#L425-L433) — deathWindowFromArgs: a production copy of deathWindowFrom minus the finite and ordered checks (missed by the finder)
- [`src/mapper/chain/optimistic-authoring.ts:279-301, 304-330`](../../src/mapper/chain/optimistic-authoring.ts#L279-L301) — Its two callers: optimisticSetConnectionLifeStage and optimisticSetConnectionWormholeType
- [`convex/lib/mapEntityContracts.ts:263-278`](../../convex/lib/mapEntityContracts.ts#L263-L278) — validateDeathWindowInput re-implements the predicate at 275-277 after its own both-or-neither check
- [`convex/mapAuthoringFields.ts:86-119`](../../convex/mapAuthoringFields.ts#L86-L119) — resolveDeathWindow builds the window by hand after validation; the undefined branch at 110-115 is unreachable because hasEarliest === hasLatest === true there
- [`src/data/industry-indices/queries.ts:66-69`](../../src/data/industry-indices/queries.ts#L66-L69) — getAdjustedPrice wraps getAdjustedPrices; only queries.test.ts:83-90 uses it
- [`src/data/eve-data/wormhole-contract.ts:209-211`](../../src/data/eve-data/wormhole-contract.ts#L209-L211) — isKnownSpaceSystemId: only wormhole-contract.test.ts:83-84 and wormhole-contract.db.test.ts:42-48 use it

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/maps/connection-hallway.ts:189-199`](../../src/data/maps/connection-hallway.ts#L189-L199) — pendingResolution is test-only, but it is a fixture factory for a variant still in the stored validator (convex/lib/mapEntityContracts.ts:165-170) and still read by the mapper (jump-resolution.ts:64-67, 93). It sits beside the production-used destinationResolution and four test files import it. Moving it is churn.
- [`src/data/maps/signature-lifecycle.ts:28-30`](../../src/data/maps/signature-lifecycle.ts#L28-L30) — Expiry check on deathLatestAt <= now; a different concept from building a window
- [`src/composition/jump-resolver/resolver.ts:164-173`](../../src/composition/jump-resolver/resolver.ts#L164-L173) — isWormholeSpace classifies by securityStatus and wormholeClassId, not by the id range; not a consumer for isKnownSpaceSystemId

</details>

**Home.** `src/data/maps/connection-lifetime.ts:deathWindowFrom (existing primitive; no new code)`

**Boundary check.** src/data/maps sits in the data zone. mapper may import data ({from: mapper, allow: [features, data, ...]}), and optimistic-authoring.ts already imports intersectOrReset from @/data/maps/connection-lifetime. convex may import data ({from: convex, allow: [platform/esi, platform/auth, data, lib]}). convex/mapAuthoringFields.ts already imports @/data/maps/connection-lifetime, and convex/lib/mapEntityContracts.ts already imports @/data/maps/* and @/data/eve-data/*. connection-lifetime.ts itself imports only a type from data/eve-data, so it is safe in the Convex bundle.

**API sketch.**

```ts
// unchanged
export function deathWindowFrom(earliestAt: number | null | undefined, latestAt: number | null | undefined): ConnectionDeathWindow | null

// mapper
death: deathWindowFrom(args.deathEarliestAt, args.deathLatestAt)

// convex/lib/mapEntityContracts.ts
if (earliest === null || latest === null) return;
if (deathWindowFrom(earliest, latest) === null) reject('INVALID_DEATH_WINDOW', 'Death-window timestamps must be finite and ordered.');

// convex/mapAuthoringFields.ts resolveDeathWindow tail
validateDeathWindowInput(proposal);
const proposed = deathWindowFrom(proposal.deathEarliestAt, proposal.deathLatestAt);
return proposed === null ? null : intersectOrReset(storedDeathWindow(connection), proposed);
```

**Migration steps.**

1. mapper/chain/optimistic-authoring.ts: delete deathWindowFromArgs (lines 425-433), import deathWindowFrom next to intersectOrReset, and call deathWindowFrom(args.deathEarliestAt, args.deathLatestAt) at lines 297 and 328.
2. convex/lib/mapEntityContracts.ts validateDeathWindowInput: keep the both-or-neither check and its message. Replace the inline `!Number.isFinite(earliest) || !Number.isFinite(latest) || earliest > latest` with `deathWindowFrom(earliest, latest) === null`, keeping the same code and message.
3. convex/mapAuthoringFields.ts resolveDeathWindow: after validateDeathWindowInput(proposal), replace lines 105-118 with `const proposed = deathWindowFrom(proposal.deathEarliestAt, proposal.deathLatestAt); return proposed === null ? null : intersectOrReset(storedDeathWindow(connection), proposed);`. Validation has already rejected half-set and invalid pairs, so null here means both were null, which means clear. This removes the unreachable undefined ConvexError branch.
4. Delete getAdjustedPrice (data/industry-indices/queries.ts:66-69) and its describe block (queries.test.ts:83-90); getAdjustedPrices stays covered.
5. Delete isKnownSpaceSystemId (data/eve-data/wormhole-contract.ts:209-211) and its unit assertions (wormhole-contract.test.ts:83-84). In wormhole-contract.db.test.ts, inline the threshold (row.id >= 31_000_000) in the j-space-class assertion, or drop the first tautological assertion, so the SDE layout check survives.

**Tests.** Existing guards: connection-lifetime.test.ts:62-75 (deathWindowFrom cases, including NaN, inverted and partial pairs). convex/mapAuthoringFields.test.ts:578-612 'refuses partial, inverted, and non-finite death-window pairs' must keep passing with the same INVALID_DEATH_WINDOW code. optimistic-authoring.test.ts:454-464 uses valid windows and keeps passing. Add an optimistic-authoring case: optimisticSetConnectionLifeStage with deathEarliestAt > deathLatestAt yields a lifetime with no window (the server rejects that pair, so the optimistic view should not render it).

**Notes.** Drift: deathWindowFromArgs is the incorrect copy. It accepts NaN, Infinity and inverted pairs that the server rejects (validateDeathWindowInput), so the optimistic store can briefly hold a window the server will never accept. deathWindowFrom's rule is correct and matches the convex validation exactly. The convex messages must stay distinct: 'must both be null or both be set' for a half-set pair and 'must be finite and ordered' for an invalid pair. deathWindowFrom cannot tell these apart, so keep the both-or-neither check first. In resolveDeathWindow, keep the early return to the stored window when neither field is supplied, and keep the partial-supply ConvexError path. Lead, out of scope: production never constructs a resolution of kind 'pending' (the only constructor is the test-only pendingResolution); whether that stored variant is legacy is a separate question.

<sub>Reported by: area:data-eve.</sub>

← [Wave 5: Persistence primitives and data-layer SQL](wave-05-persistence-primitives-and-data-layer-sql.md) · [Index](README.md#roadmap) · [Wave 7: UI kit primitives (src/components/ui)](wave-07-ui-kit-primitives-src-components-ui.md) →
