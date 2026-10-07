# Part 01: Scope, principles and threat model

**Status:** Draft for owner review

## In one paragraph

This part sets the frame every other part is checked against. The plan hardens the current LGI.tools app in place, one feature at a time. It is not a rebuild and not a second app. The older browser-first design (Path A-lean in 01-design-and-spec.md) is replaced by a server-side design built around a sealed service: one AWS Nitro Enclave that holds EVE tokens and keys and does the server work that needs to read content. That is closest to the old Path D, without tiers. This part restates the four principles and nine decisions as constraints. It adds a short list of hard rules, rewrites the threat model, lists what is dropped from the older docs, sets the rule for future features that read content, and says how each release proves that users notice nothing.

## How it works today

Today every operator with access to Vercel, Convex or Neon can read everything.

- **Login.** Better Auth's `genericOAuth` plugin runs the EVE SSO code exchange on Vercel. It asks for all 22 scopes at once. Vercel receives access and refresh tokens in plaintext. Sessions last 7 days. The owner hash is read from the JWT at login and used to detect transfers.
- **Tokens.** Refresh tokens sit in Neon `account`, encrypted under one environment key, `EVE_TOKEN_ENCRYPTION_KEY`, which operators can read.
- **Maps.** Map records, access lists (character and corporation grants with viewer, editor and admin roles; the creator is the owner) and blocks are in Neon and projected to Convex. Map contents are plaintext Convex rows. The event log keeps 7 days and undo lasts 24 hours.
- **Location.** A Convex action polls ESI with access tokens leased into the Convex table `characterLocationAccess` by `/api/internal/eve-token`. Polling stops 5 minutes after the last heartbeat, or 90 minutes after the tab was last visible.
- **Personal and corp data.** Vercel sync jobs pull ESI into plaintext Neon tables. Some private reads are wrapped in `'use cache'`.
- **Browser.** The CSP allows `'unsafe-inline'` scripts and styles and Vercel Insights. Speed Insights loads on hosted builds.
- **Baseline for "nothing changes".** 28 pages under `src/app/(site)`, 77 API handlers, and the Playwright journeys in `e2e/`.
- **Workflow.** `development` → `staging` → `main`; `pnpm check` before every commit, `pnpm verify` before promote or release, zero Fallow findings (AGENTS.md).

Files:

- Login and tokens: `src/platform/auth/auth.ts`, `eve-sso-constants.ts`, `token-crypto.ts`, `owner-hash-claim.ts`; `src/composition/account-lifecycle/owner-transfer.ts`
- Maps: `src/data/maps/access-contract.ts`, `chain-events.ts`, `chain-contract.ts`
- Location: `convex/characterLocationSync.ts`, `convex/characterLocationAccess.ts`, `src/app/api/internal/eve-token/route.ts`, `src/lib/sync-engine.ts`
- Data: `src/composition/sync/`, `src/features/owned-assets/queries.ts`
- Browser and tests: `src/proxy.ts`, `src/app/layout.tsx`, `e2e/smoke.spec.ts`, `e2e/home-board.spec.ts`

## What changes

Nothing visible to users: same pages, flows, timings and copy. Behind the scenes, EVE tokens and keys move into the sealed service, content is sealed at rest, and server work that reads content moves from Vercel and Convex into the sealed service. Metadata stays readable, and LGI's servers keep doing everything that needs only metadata. The only new UI is sale notices (decision 1) and an optional passkey and recovery-key setting (decision 9).

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
| Browser | No | Its user's keys, for the session | What its user may see |
| Vercel / Next.js | No | No | No |
| Convex | No | No | No |
| Neon | Sealed only | Sealed key records only | No |
| Sealed service (enclave) | Yes | All, unsealed only in its memory | Yes, in memory only |
| Parent EC2 instance | No | No | No (relays encrypted bytes) |

**Threat table** (internal document only; nothing in the app)

| Adversary | Outcome | How, and caveats |
|---|---|---|
| Operator reading stored data or env vars | Protected for content | Content sealed under keys that only the enclave and members' browsers hold. Metadata stays readable (Part 03). |
| Database or backup thief | Protected for content once migrated | Plaintext remains in Neon history and Convex backups until they age out (Part 31). |
| Read access to Vercel logs, env or runtime | Protected | No tokens, keys or content plaintext pass through Vercel. |
| Read access to Convex or Neon | Protected for content | Can see metadata. Can delete or replay rows (Parts 16 and 28). |
| Legal demand for content | Protected | LGI holds only ciphertext and metadata. A compelled code change would show in the published fingerprints. |
| Network attacker | Protected | TLS, plus requests encrypted to the attested enclave key. |
| Removed member or one who left a granting corp | Protected for new data | The key rotates at once. They keep what they already saw. |
| Buyer of a sold character | Protected | Detected at login before key release (Part 14). |
| Whoever holds a user's EVE login | Not protected | Decision 5: EVE SSO is the gate. |
| Member leaking what they see | Not protected | Same as any mapper. Removal stops future access. |
| Compromised device, extension or XSS | Not protected | Can use unlocked keys within the session (Part 26). |
| Operator shipping malicious app code | Not prevented | Whoever serves lgi.tools could ship code that leaks keys after login. Detectable by inspecting served code, not preventable. |
| Operator changing the key-release rule or running an unpublished image | Not prevented, detectable | AWS signs the attestation. The AWS account owner can change the KMS rule. Changes show in published fingerprints and CloudTrail (Parts 06 and 27). |
| AWS | Trusted | Nitro isolation and attestation signing are taken on trust. |
| CCP | Out of scope | ESI is the source of the data. |
| Bug in worker code beside the keys | Accepted, reduced | Agent security and code reviews plus adversarial tests (Part 28). |

**Dropped from the older docs**

Tiers and labels (Sealed, Standard, Attested); Steward and escrow; strict approval and safety numbers; high-security mode; the two-owner rule and succession; recovery delay, vetoes and a mandatory recovery secret; paid audits and formal models; the Durable Objects relay; subdomains, WEBCAT and the self-host bundle; a new repo; the key directory, sigchains and Sigsum; browser ESI polling; the 30-day op log. Also every new feature in the old parity matrix (routes, zKill, d-scan, notes, guest links, Discord alerts, importers, API, in-game Access Lists, set-waypoint, alliance grants, grant expiry, larger caps), plus invites and the bot.

**Future features that read content.** A future feature that must read content (for example Discord alerts) runs inside the sealed service or in a corp's own bot. It never runs on Vercel, Convex or Neon (decision 4). Nothing is built for this now.

**Checking that users notice nothing, per release**

| Check | Where |
|---|---|
| PR description states "Visible change: none", or names the allowed exception and its reason | Every PR |
| Playwright journeys in `e2e/` pass unchanged, with no edits to their assertions | CI |
| The page tree under `src/app/(site)` is unchanged | Test |
| No user-facing string adds encryption, sealed, enclave, tier or key wording, except the allowed exceptions | Test or lint |
| Login, map open, map edit and board load stay within timing budgets on staging | Staging, before release |
| The owner walks the main flows on staging | Before `staging` → `main` |

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| Accounts, characters, owner hashes, corps, roles | Yes | No | LGI server; re-verified in sealed service where it gates release |
| Maps, names, access lists, blocks | Yes | No | LGI server; integrity checked by sealed service (Part 12) |
| Presence and tracking selections | Yes | No | LGI server |
| Map contents (systems, connections, signatures, events) | No | Yes | Sealed service (default, Part 15); browser decrypts |
| Character locations and ships | No | Yes | Sealed service |
| Personal ESI data, net worth, corp data | No | Yes | Sealed service; browser decrypts |
| Profiles, custom structures, favourite blueprints | No | Yes | Browser seals and validates |
| EVE tokens | No | Yes | Sealed service only |
| Public data (SDE, prices, statics, cost indices) | Yes | No | LGI server; served as whole assets |

Part 02 holds the table-by-table detail.

## Hard rules

1. [Agreed] Users notice nothing. New UI appears only where required, and its reason is stated in the PR.
2. [Agreed] Metadata stays readable. Content is sealed: map contents, locations, assets, structures, industry, corp holdings, user-authored documents and tokens.
3. [Agreed] Work runs on LGI's servers where it needs only readable data. Work that reads content runs in the sealed service. The browser is used only where neither works.
4. [Agreed] EVE SSO is the access gate. Every unlock follows an EVE login, with no delay.
5. [Agreed] Same repo, same `development` → `staging` → `main` flow, same gates, zero Fallow findings, everything on lgi.tools, and Convex stays the relay and store.
6. [Agreed] No EVE token (access, refresh or ID) exists in plaintext outside the sealed service once Part 08 ships. Interim steps are in Part 04.
7. [Proposed] Content plaintext exists only in permitted members' browsers and in enclave memory. Never in Vercel, Convex, Neon, logs, caches, telemetry, error fields or backups.
8. [Proposed] No private-interest lookups of public data through LGI. Public data that would reveal interest is served as whole versioned assets (Part 24).
9. [Proposed] Readable is not trusted. Any readable field that gates key release or a sealed decision (character links, owner hashes, affiliation, corp roles, access lists, blocks) is verified by the sealed service (Parts 08, 12, 14 and 23).
10. [Agreed] Features that must read content run in the sealed service or a corp's own bot.
11. [Agreed] No tiers, badges, labels or encryption copy in the app.
12. [Agreed] History and retention match today: 7-day event log and 24-hour undo. Current members, new joiners included, read earlier key epochs.
13. [Agreed] Passkeys and recovery keys are optional, with no prompts.
14. [Agreed] The KMS key has a deletion waiting period and an alert on scheduled deletion.
15. [Proposed] The threat table and caveats live in repo docs only. No in-app security page or messaging.
16. [Proposed] The dev sealed service and its attestation stand-in can never run in a release build.
17. [Proposed] Nothing listed under "Dropped" is built without a new owner decision.

## Assumptions

| Assumption | How to check |
|---|---|
| One Nitro Enclave on a 1-year commitment (about $32/month) carries 18 users | Load test on staging (Part 05) |
| KMS can release a key only to named enclave fingerprints | Prototype on staging (Part 06) |
| Better Auth can create sessions from an identity assertion without seeing tokens | Spike (Part 08) |
| The owner hash reliably signals a sale | Already used in `owner-transfer.ts`; confirm with CCP's SSO docs |
| Refresh tokens that crossed Vercel go stale after re-sealing and refresh | Test whether CCP rotates refresh tokens (Part 31) |
| An extra hop does not add visible delay | Timing budgets on staging (Parts 07 and 16) |
| Convex and Neon clients work through the parent's vsock proxy | Spike (Part 05) |

## What users see

Nothing new, except these:

- **Sale notices** to map owners, and a heads-up to the affected corp (decision 1, Part 14).
- **A blocked buyer** sees today's lost-access screen (Part 12).
- **Optional passkey and recovery-key settings** in account settings. These are a quiet option at login, never a prompt (decision 9, Part 10).
- **During a sealed-service outage**, logins, edits, tracking and syncs pause behind today's existing error states (Part 05).

## Questions for the owner

1. **Is the threat table right, and should it stay internal?** Recommended: yes. Keep it in repo docs only, with no in-app link (decision 2).
2. **Is the dropped list complete?** Recommended: approve it as written. Bringing anything back takes a new decision.
3. **Does the rule for content-reading features need anything built now?** Recommended: no. Record the rule only.
4. **What timing budgets apply on staging?** Recommended: login takes at most 1 second longer than today. Map edits show instantly as today. Edits reach other members within today's latency plus 300 ms at p95. Page loads stay unchanged.
5. **Should "readable is not trusted" be a hard rule now?** Recommended: yes. Without it, an operator could edit `map_access` and admit their own character. Part 12 picks the method.
