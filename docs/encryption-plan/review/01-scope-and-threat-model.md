# Part 01: Scope, principles and threat model

**Status:** Draft for owner review

## In one paragraph

This part sets the frame every other part is checked against. The plan hardens the current LGI.tools app in place, one feature at a time. It is not a rebuild and not a second app. The older browser-first design (Path A-lean in 01-design-and-spec.md) is replaced by a server-side design built around a sealed service: one AWS Nitro Enclave that holds EVE tokens and keys and does the server work that needs to read content. That is closest to the old Path D, without tiers. This part restates the four principles and nine decisions as constraints. It adds a short list of hard rules, rewrites the threat model, lists what is dropped from the older docs, sets the rule for future features that read content, and says how each release proves that users notice nothing.

## How it works today

Anyone with Vercel env access plus Neon can read everything. Convex alone exposes live access tokens and all map and location content. Neon alone exposes everything except tokens and raw corp asset snapshots, which are encrypted under operator-readable env keys.

- **Login.** Better Auth's `genericOAuth` plugin runs the EVE SSO code exchange on Vercel. It asks for all 22 scopes at once. Vercel receives access and refresh tokens in plaintext. Sessions last 7 days (`session.expiresIn`). The owner hash is read from the JWT at login and used to detect transfers.
- **Tokens.** Refresh tokens sit in Neon `account`, encrypted under one environment key, `EVE_TOKEN_ENCRYPTION_KEY`, which operators can read.
- **Maps.** Map records, access lists (character and corporation grants with viewer, editor and admin roles; the creator is the owner) and blocks are in Neon and projected to Convex. Map contents are plaintext Convex rows. The event log keeps 7 days and undo lasts 24 hours.
- **Instant edits.** Map edits feel instant because of Convex optimistic updates. `optimistic-authoring.ts` wraps 11 mutations in `withOptimisticUpdate`, patching plaintext query results in the client's local store (`insertAtTop`, `optimisticallyUpdateValueInPaginatedQuery`, `OptimisticSystemRow` with a plaintext `systemId`). This is part of the "nothing changes" baseline.
- **Location.** A Convex action polls ESI with access tokens leased into the Convex table `characterLocationAccess` by `/api/internal/eve-token`. Polling stops 5 minutes after the last heartbeat, or 90 minutes after the tab was last visible.
- **Personal and corp data.** Vercel sync jobs pull ESI into plaintext Neon tables. Raw `esi_snapshots` bodies are the exception: they are encrypted under `ESI_SNAPSHOT_ENCRYPTION_KEY`, also an operator-readable env key. Some private reads are wrapped in `'use cache'`.
- **Browser.** The CSP allows `'unsafe-inline'` scripts and styles and Vercel Insights. Speed Insights loads on hosted builds.
- **Baseline for "nothing changes".** 28 pages under `src/app/(site)`, 77 API handlers, the optimistic layer above, and the Playwright journeys in `e2e/`. Those journeys are thin: only `smoke.spec.ts` and `home-board.spec.ts`, both on `/`. Nothing covers `/atlas`, login, tracking or industry. CI runs them with `pnpm start` on a production `next build` and seeded sessions (`e2e/auth-seed.ts`).
- **Workflow.** `development` → `staging` → `main`; `pnpm check` before every commit, `pnpm verify` before promote or release, zero Fallow findings (AGENTS.md).

Files:

- Login and tokens: `src/platform/auth/auth.ts`, `eve-sso-constants.ts`, `token-crypto.ts`, `owner-hash-claim.ts`; `src/composition/account-lifecycle/owner-transfer.ts`
- Maps: `src/data/maps/access-contract.ts`, `chain-events.ts`, `chain-contract.ts`; `src/mapper/chain/optimistic-authoring.ts`, `src/mapper/chain/NoMapAccess.tsx`
- Location: `convex/characterLocationSync.ts`, `convex/characterLocationAccess.ts`, `src/app/api/internal/eve-token/route.ts`, `src/lib/sync-engine.ts`
- Data: `src/composition/sync/`, `src/features/owned-assets/queries.ts`, `src/data/esi-snapshots/crypto.ts`
- Browser and tests: `src/proxy.ts`, `src/app/layout.tsx`, `e2e/smoke.spec.ts`, `e2e/home-board.spec.ts`, `e2e/auth-seed.ts`, `playwright.config.ts`, `.github/workflows/test.yml`

## What changes

Nothing visible to users: same pages, flows, timings and copy. Behind the scenes, EVE tokens and keys move into the sealed service, content is sealed at rest, and server work that reads content moves from Vercel and Convex into the sealed service. Metadata stays readable, and LGI's servers keep doing everything that needs only metadata. New UI is limited to the list in "What users see". One behaviour is new: during a real sealed-service outage nobody can log in.

## Design

**What the plan is now**

| Topic | Older design (01–04) | This plan |
|---|---|---|
| Shape | Rebuild as new apps in a workspace | Harden the current app feature by feature |
| Content readers | Browsers only (Path A-lean) | Browsers and the sealed service (close to old Path D, no tiers) |
| ESI calls | From the browser | In the sealed service, as today's server does |
| Relay | Convex, then Durable Objects | Convex stays the relay and store |
| Origins | Subdomains for app, api, relay, data | Everything on lgi.tools |
| Shipping | Milestones to one cutover | Ordinary releases per feature (decision 2) |

**Who holds what**

| Component | Holds EVE tokens | Holds keys | Sees content plaintext |
|---|---|---|---|
| Browser | No | Its user's keys, non-extractable in IndexedDB for the 7-day session | What its user may see |
| Vercel / Next.js | No | No | No |
| Convex | No | No | No |
| Neon | Sealed only | Sealed key records only | No |
| Sealed service (enclave) | Yes | All, unsealed only in its memory | Yes, in memory only |
| Parent EC2 instance | No | No | No (relays encrypted bytes) |

**Allowed new UI** (the single list used by "What changes", "What users see", rule 1 and the string lint)

| UI | Reason |
|---|---|
| Sale notice to map owners | Decision 1 (Part 14) |
| Corp heads-up to directors, members and granting map owners | Decision 1 (Part 14) |
| `NoMapAccess` for a blocked buyer (existing screen) | Decision 1; being blocked from a map |
| Passkey and recovery-key section in `/settings/account` | Decision 9 (Part 10) |
| Passkey or recovery-key unlock shown during an outage | Decision 1 backups; the only way in while the sealed service is down (Part 10) |
| Same unlock panel when a restore is needed (the sealed service has no key record and the account has backups) | Decisions 1 and 9; otherwise a backup could never be used (Part 10) |
| One failure line after a passkey that cannot do PRF | Decision 9; enrolment failed, so the user must know the passkey is not a backup (Part 10) |
| New `service_unavailable` text at sign-in: "Sign-in is temporarily unavailable. Wait a moment and try again." | Required: during an outage nobody can log in, and no existing key fits (Part 06) |
| Blank `/auth/callback` interstitial in place of today's server redirect | Required: the browser holds the verifier, so the code must reach it (Part 08) |
| Normal EVE login when browser key storage is gone but the session cookie survives | Required: the sealed service must not release keys on Vercel's cookie alone; today's login screen, as when a session expires (Part 08 rule 15, Part 09) |
| One sign-in within 7 days for sessions created before the Phase 1 switch, on today's screen | Required: keys come only from a fresh EVE login (Part 30 question 3) |
| One full page load on navigation for a tab older than the minimum build, with no banner | Required: switch and retire releases wait until no pre-switch build is running (Part 30 rule 11) |
| "Blocked after a character sale" reason line on sale-created block rows, only if Part 14 question 3 picks it | Decision 1; tells owners why the block exists (Part 14) |
| Existing `toast.error` pattern when a queued map edit expires during a long outage, with the optimistic change rolled back | Required: edits are never dropped silently; same style as today's "Restore failed" (Part 15) |

Other parts cite this list, not the README: Part 30's "What users see" should read "each on Part 01's list" in place of "each allowed by the README". Part 19's open question about evicted key storage is settled by Part 09's decision: the normal EVE login.

**Threat table** (internal document only; nothing in the app)

| Adversary | Outcome | How, and caveats |
|---|---|---|
| Operator reading stored data or env vars | Protected for content | Content sealed under keys that only the enclave and members' browsers hold. Metadata stays readable (Part 03). LGI still sees when maps are edited, when tracked pilots move (location write timing), map size and connection expiry times. These are accepted metadata (Parts 03, 16). |
| Database or backup thief | Protected for content once migrated | Plaintext remains in Neon history and Convex backups until they age out (rule 7, Part 31). |
| Backup thief holding old token ciphertext | Protected once rule 19 ships | Old backups plus `EVE_TOKEN_ENCRYPTION_KEY` give live refresh tokens unless CCP rotates them. Destroying the env keys makes old copies useless either way. |
| Read access to Vercel logs, env or runtime | Protected | No tokens, keys or content plaintext pass through Vercel. |
| Read access to Convex or Neon | Protected for content | Can see metadata, with the same timing caveat as the operator row. Can delete or replay rows (Parts 16 and 28). |
| Write access to Neon or Convex (leaked DB credential, or operator) | Protected only if rule 9 ships (Part 12) | Can change readable gates: `map_access`, `map_blocks`, account and character links, owner hashes, affiliation in `characters`, `corp_member_roles`. Without rule 9 this admits any character. |
| Legal demand for content | Protected for stored data | LGI holds only ciphertext and metadata. Not protected against a compelled change to the web app or the KMS policy. |
| Network attacker | Protected | TLS, plus requests encrypted to the attested enclave key. |
| Removed member or one who left a granting corp | Protected for new data | The key rotates at once. They keep what they already saw. |
| Buyer of a sold character | Protected | Detected at login before key release (Part 14). |
| Whoever holds a user's EVE login | Not protected | Decision 5: EVE SSO is the gate. |
| Member leaking what they see | Not protected | Same as any mapper. Removal stops future access. |
| Compromised device, extension or XSS | Not protected | Can use unlocked keys within the session (Part 26). |
| Operator shipping malicious app code | Not prevented | Whoever serves lgi.tools could ship code that leaks keys after login, even to one targeted user. Detectable only if that user happens to be served and inspect the bad code. |
| Operator changing the key-release rule or running an unpublished image | Not prevented | AWS signs the attestation. The AWS account owner can change the KMS rule; CloudTrail and the key policy are in that account, not public. The release job publishes each key-policy version beside the fingerprints (Parts 06 and 27), but a malicious account owner could change and revert it unseen. An image KMS trusts can unseal every key and token without any browser attesting to it. |
| AWS | Trusted | Nitro isolation and attestation signing are taken on trust. |
| CCP | Out of scope | ESI is the source of the data. |
| Bug in worker code beside the keys | Accepted, reduced | Agent security and code reviews plus adversarial tests (Part 28). |

**Dropped from the older docs**

Tiers and labels (Sealed, Standard, Attested); Steward and escrow; strict approval and safety numbers; high-security mode; the two-owner rule and succession; recovery delay, vetoes and a mandatory recovery secret; paid audits and formal models; the Durable Objects relay; subdomains, WEBCAT and the self-host bundle; a new repo; the key directory, sigchains and Sigsum; browser ESI polling; the 30-day op log. Also every new feature in the old parity matrix (routes, zKill, d-scan, notes, guest links, Discord alerts, importers, API, in-game Access Lists, set-waypoint, alliance grants, grant expiry, larger caps), plus invites and the bot. None is built as part of this plan.

**Future features that read content.** A future feature that must read content (for example Discord alerts) runs inside the sealed service or in a corp's own bot. It never runs on Vercel, Convex or Neon (decision 4). Nothing is built for this now.

**Checking that users notice nothing.** The checks are rules 20 to 25 below. They apply to PRs that belong to the encryption plan, not to ordinary product work.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| Accounts, characters, owner hashes, corps, roles | Yes | No | LGI server; re-verified in sealed service where it gates release |
| Maps, names, access lists, blocks | Yes | No | LGI server; integrity checked by sealed service (Part 12) |
| Presence and tracking selections | Yes | No | LGI server |
| Map contents (systems, connections, signatures, events) | No | Yes | Sealed service (default, Part 15); browser decrypts and applies optimistic patches |
| Character locations and ships | No | Yes | Sealed service |
| Personal ESI data, net worth, corp data | No | Yes | Sealed service; browser decrypts |
| Profiles, custom structures, favourite blueprints | No | Yes | Browser seals and opens; LGI stores the blobs; fit parsing moves to the browser; the hull, rig and system save checks are dropped (Part 20). Named principle-3 exception: the author is the only reader, so a sealed-service check protects no one and adds a round trip and an outage dependency (question 6) |
| EVE tokens | No | Yes | Sealed service only |
| Interest-revealing public lookups (statics by system, build location, cost indices, names, type names) | Public tables yes; no lookup is sent | No; nothing is sent per ID | Whole versioned assets or fixed sets (Part 24); no per-ID lookups. Pilot names come from the readable `mapAccess.characters` projection (Part 04 PR 0-5) |
| Public data shipped whole today (SDE statics, universe assets), market prices | Yes | No | LGI server |

Part 02 holds the table-by-table detail.

## Hard rules

1. [Agreed] Users notice nothing. New UI appears only from the "Allowed new UI" list, and its reason is stated in the PR.
2. [Agreed] Metadata stays readable. Content is sealed: map contents, locations, assets, structures, industry, corp holdings, user-authored documents and tokens.
3. [Agreed] Prefer LGI's servers for computation and storage. Where server work must read content, prefer the sealed service over the browser. Use the browser only where neither works. Any browser placement where the sealed service could do the work is an owner-approved exception with its reason recorded.
4. [Agreed] EVE SSO is the access gate. Every unlock follows an EVE login, with no delay.
5. [Agreed] Same repo, same `development` → `staging` → `main` flow, same gates, zero Fallow findings, everything on lgi.tools, and Convex stays the relay and store.
6. [Agreed] No EVE token (access, refresh or ID) exists in plaintext outside the sealed service once Part 08 ships. Interim steps are in Part 04.
7. [Proposed] Content plaintext exists only in permitted members' browsers and in enclave memory. It is never in newly written Vercel, Convex or Neon data, logs, caches, telemetry or error fields. Existing plaintext in Neon history and Convex backups expires once the Neon history window recorded in Part 25 (rule 17) has passed since each feature's retire release; Convex backups are kept no longer than that window (Part 25). The window is unknown until read from the Neon console (Parts 11, 25 and 31). Old branches and exports are deleted at retirement.
8. [Proposed] Public data that private content selects is served as whole versioned assets or fixed sets (Part 24); no per-ID lookups. Statics, ship type names, cost indices, adjusted prices, industry stations and production modifiers ship as whole tables, and the browser picks the rows it needs. Pilot names come from the readable `mapAccess.characters` projection (Part 04 PR 0-5), corp installer names from the sealed corp jobs view (Part 23), and mapper live prices refresh a fixed type set. `/api/universe/statics/[systemId]`, `/api/industry/build-location`, `/api/industry/cost-indices` and `/api/eve/type-names` are deleted; `/api/eve/names` stays only for the exceptions listed in Part 04 rule 5 and Part 24. Logged-out industry pages work because no browser session key or sealed request is needed. The sealed service holds the public tables whole in memory for its own work and makes no per-ID public query (Part 24).
9. [Proposed] Readable is not trusted. Any readable field that gates key release or a sealed decision (character links, owner hashes, affiliation, corp roles, access lists, blocks) is verified by the sealed service (Parts 08, 12, 14 and 23). This guards against a leaked database write credential, not against someone who can deploy.
10. [Agreed] Features that must read content run in the sealed service or a corp's own bot.
11. [Agreed] No tiers, badges, labels or encryption copy in the app.
12. [Agreed] History and retention match today: 7-day event log and 24-hour undo. Current members, new joiners included, read earlier key epochs.
13. [Agreed] Passkeys and recovery keys are optional, with no prompts.
14. [Agreed] The KMS key has a deletion waiting period and an alert on scheduled deletion.
15. [Proposed] The threat table and caveats live in repo docs only. No in-app security page or messaging.
16. [Proposed] The dev sealed service and its attestation stand-in never run in a deployed build. "Deployed" means `VERCEL_ENV` is `production`, or `preview` on `staging` or `main`, and the enclave fingerprint allowlist applies. CI e2e may use the dev sealed service behind a CI-only flag that deployed builds refuse.
17. [Proposed] Nothing listed under "Dropped" is built as part of this plan.
18. [Proposed] An enclave release causes no visible gap in login, edits, tracking or syncs. Releases use a blue/green swap: start a new parent instance, attest it, drain sealed requests, switch over, then stop the old one (Part 05, Part 25).
19. [Proposed] Once tokens are re-sealed (Parts 08 and 31), `EVE_TOKEN_ENCRYPTION_KEY` and `ESI_SNAPSHOT_ENCRYPTION_KEY` are destroyed everywhere: Vercel environments, local copies and any other store.
20. [Proposed] Map edits keep today's optimistic behaviour. Patches apply to the decrypted client view and are held until the matching enclave reply arrives, not just until the Convex mutation returns. Edits never flicker (Parts 15 and 16 pick the method).
21. [Proposed] The browser session key and unwrapped user and map keys are non-extractable CryptoKeys in IndexedDB, shared across tabs, kept for the life of the 7-day Better Auth session. Keys come from the sealed service only at login and when key epochs change; reloads and new tabs reuse the stored keys. Other sealed requests (map edits in Parts 15 and 16, `session.touch` in Part 09, searches, rig saves, backups and Part 21's large-index fallback) still use the sealed service, but never fetch keys and never hold up a page load except as rule 25 lists.
22. [Proposed] New Playwright journeys land before the part they protect ships: atlas open, edit, undo, tracking and industry pages, written against today's behaviour. Encryption-plan PRs then leave every e2e assertion unchanged.
23. [Proposed] Every encryption-plan PR description states "Visible change: none", or names the allowed UI item and its reason. It does not change the page tree under `src/app/(site)`.
24. [Proposed] A lint fails encryption-plan PRs that add user-facing encryption vocabulary (encrypt, sealed, enclave, attestation, trust tier), with an allowlist for the allowed UI. Bare "tier" and "key" are not flagged; the app already shows "Tier {depth}" and "Smoke tier".
25. [Proposed] Before each release, on staging: login, map open, map edit and board load stay within the timing budgets (question 4); page loads, reloads and new tabs never wait on the sealed service, with one listed exception: Part 23's recheck of a corp view past `valid_until` (at most 10 s, today's ESI timeout); edits never flicker; and the owner walks the main flows before `staging` → `main`.

## Assumptions

| Assumption | How to check |
|---|---|
| One Nitro Enclave on a 1-year commitment carries 18 users. AWS cost is about $38/month for production, plus $5 to $40 for staging (on-demand to always-on), plus a short blue/green overlap per enclave release: about $45 to $80 in total | Load test and cost check on staging (Parts 05 and 25) |
| An enclave deploy causes no visible downtime | Blue/green swap on staging (Part 05) |
| KMS can release a key only to named enclave fingerprints | Prototype on staging (Part 06) |
| Better Auth can create sessions from an identity assertion without seeing tokens | Spike (Part 08) |
| The owner hash reliably signals a sale | Already used in `owner-transfer.ts`; confirm with CCP's SSO docs |
| Refresh tokens that crossed Vercel go stale after re-sealing and refresh | Test whether CCP rotates refresh tokens (Part 31). If not, rule 19 still makes old copies useless |
| An extra hop does not add visible delay | Timing budgets on staging (Parts 07 and 16) |
| Optimistic patches can be held until the enclave reply without flicker | Prototype on staging (Part 16) |
| Convex and Neon clients work through the parent's vsock proxy | Spike (Part 05) |

## What users see

Nothing new, except the "Allowed new UI" list in Design:

- **Sale notices** to map owners, and a heads-up to the affected corp (decision 1, Part 14). These use existing toast and notice components.
- **A blocked buyer** sees today's `NoMapAccess` screen (Part 12).
- **Optional passkey and recovery-key settings** in `/settings/account`. These are a quiet option at login, never a prompt (decision 9, Part 10).
- **During a real sealed-service outage**, nobody can log in, which is new compared with today: Vercel can only create sessions from the enclave's identity assertion. Users already signed in keep reading with their stored keys; edits, tracking and syncs pause behind today's error states. Users with a passkey or recovery key see that unlock option plainly (Part 10). Planned enclave releases cause no gap (rule 18).
- **Small, rare changes on existing surfaces**, each on the list with its reason: the `service_unavailable` sign-in text (Part 06), the blank `/auth/callback` interstitial (Part 08), the normal EVE login when key storage is gone but the cookie survives (Parts 08 and 09), one sign-in within 7 days for pre-switch sessions and a silent full page load for stale tabs (Part 30), the restore-needed unlock panel and the passkey failure line (Part 10), the optional "Blocked after a character sale" line (Part 14), and the existing error toast when a queued edit expires (Part 15).

## Questions for the owner

1. **Is the threat table right, and should it stay internal?** Recommended: yes. Keep it in repo docs only, with no in-app link (decision 2).
2. **Is the dropped list complete?** Recommended: approve it as written. It limits this plan only, not ordinary product work.
3. **Does the rule for content-reading features need anything built now?** Recommended: no. Record the rule only.
4. **What timing budgets apply on staging?** Recommended: login takes at most 1 second longer than today. Map edits show instantly as today, through rule 20. Edits reach other members within today's latency plus 300 ms at p95. Reloads, new tabs and page loads stay unchanged, through rules 21 and 25.
5. **Should "readable is not trusted" be a hard rule now?** Recommended: yes, but weigh it. It protects against a leaked Neon or Convex write credential with no deploy access: such a credential could edit `map_access` and admit any character. It does not protect against someone who can deploy, who could already ship key-leaking JavaScript. The alternative is to accept that risk at 18 users. Part 12 picks the method.
6. **Where do validation and fit parsing for user-authored documents run?** Today `rejectInvalidCustomStructure`, the profile checks, `readStoredDocument` and `/api/account/custom-structures/parse-fit` (`getStructureFitNameIndex`) run on the server. Recommended: Part 20's design. The browser seals and opens these documents, LGI stores the blobs, fit parsing runs in the browser against the lists it already has, and the hull, rig and system save checks are dropped (`payloadFromDraft` and the rig filter already give today's errors). This is recorded as the named principle-3 exception under rule 3: the author is the only reader, so a sealed-service check protects no one, and it would add a round trip and stop saves during an outage. The alternative is running the checks in the sealed service, as sealed requests.
