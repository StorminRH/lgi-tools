# Encryption plan

Working copy of the encryption-first rebuild design for LGI.tools. The owner and Claude are reviewing it section by section; nothing here is final until marked agreed below.

The live, editable version is the shared Claude doc "LGI.tools Encryption-First Rebuild — Design & Spec". These files are snapshots of it, updated as decisions are agreed.

## Files

| File | Contents |
|---|---|
| 01-design-and-spec.md | The design: goals, threat model, reuse map, alignment with the current app, recommended architecture, identity and keys, maps, mapper engine, ESI data, infrastructure, security, UX flows, review findings, rebuild plan, open questions |
| 02-decision-records.md | Decision records (DR-…) |
| 03-reference-tables.md | Features by tier, route map, datasets, metadata the server sees |
| 04-detailed-spec.md | Implementation-level rules (D-… IDs) |
| 05-sources.md | Pages the research used |

## Guiding principles (agreed 2026-10-06)

1. **Users notice nothing.** The app looks and behaves for users exactly as it does today. Anything that shows users something new must be justified.
2. **Encrypt only what needs hiding.** Metadata can stay readable on LGI's servers: who uses the app, which corporations, that maps exist, map names, membership and access lists. What users must not have exposed is content: map contents (systems, connections, signatures), character locations, assets, structures, industry data and corp holdings.
3. **LGI's servers keep doing the bulk of the work.** Prefer keeping computation and storage on LGI's servers (Convex, Neon) over moving it into the browser. Where server-side work needs to read encrypted content, prefer the sealed AWS service over the browser. Use the browser only where neither works.
4. **EVE SSO is the access gate** (decision 5).

## Review status

### Owner decisions

| # | Decision | Status |
|---|---|---|
| 1 | How members get into maps, and how a user gets their keys back on a new device | Agreed 2026-10-06 |
| 2 | How the change ships (was: do corp spaces gate cutover?) | Agreed 2026-10-06 |
| 3 | Who sees old map history after a key rotation | Agreed 2026-10-06 |
| 4 | Standard tier | Agreed 2026-10-06: dropped |
| 5 | Recovery delay | Agreed 2026-10-06: none |
| 6 | Auto re-admit after a short affiliation loss | Agreed 2026-10-06: match today |
| 7 | High-security mode | Agreed 2026-10-06: none |
| 8 | One-owner personal maps | Agreed 2026-10-06: match today |
| 9 | Recovery secret requirement | Agreed 2026-10-06: optional |

### Decision 1, agreed 2026-10-06

- **Joining maps:** anyone on a map's access list is admitted automatically, with or without an invite link. No strict-approval mode and no waiting period.
- **Character sold (owner-hash change):** detected at login before any key is released, as the current app already does. The seller's link and data for that character are removed (unchanged from today). Then, automatically and with no prompts:
  - the character is removed from every map access list it is named on, and map owners get a notice ("Character sale detected: [name] has been removed from your map's access list");
  - if the character is still in a corporation that has access to a map, it is added to that map's block list, so the corp grant cannot let the buyer in. This uses the existing block, created after the seller is unlinked, so it records only the buyer's account and never affects the seller or their other characters. Owners re-admit by removing the block;
  - the corporation (directors, members using LGI, and owners of maps granting that corp) gets a heads-up that a character in the corp changed owners.
- **Other key changes** (new device, passkey, recovery, logging in elsewhere) are automatic and need no one.
- **Getting keys back:** a user gets their keys back by logging in with EVE. A sealed key service running in an AWS Nitro Enclave holds users' keys sealed (via AWS KMS bound to the enclave's code fingerprint), checks the CCP-signed login, and returns the keys to the user's browser wrapped to a fresh key. LGI's operators cannot read the sealed keys. No other members or bots need to be online.
- **Built from day one**, on AWS Nitro with a 1-year commitment (about $32/month). Reproducible enclave builds with published code fingerprints; browsers verify the enclave's attestation before sending anything.
- **Location polling runs inside the sealed service too.** Users' EVE refresh tokens are stored sealed so only the enclave can open them. While a user's tab heartbeats (same 5 min / 90 min cold-off rules as today), the enclave polls ESI with today's policy (online gate, Expires-driven cadence with a 5 s floor, ship read only on system change), seals each update so only the map's members can read it, and posts it through Convex. Tracking behaves exactly as today, including with the tab hidden while in game. LGI's operators never see tokens or locations. The enclave code grows to include the ESI client and scheduler (reusing the current location-sync code); expected to fit the same server and cost at current scale.
- **Backups:** passkeys and a recovery key are optional extras: available as options at login, no prompts or alerts. They cover a key-service outage or loss of the AWS account.
- **Honest caveat for users:** AWS signs the enclave's proof, and the AWS account owner could change the key-release rule; such a change would be visible through the published fingerprints.
- **Doc impact:** the identity, recovery and key-directory parts of the design will be reworked around this during the section-by-section review.

### Decision 2, agreed 2026-10-06

- **Ship in parts.** There is no separate "new app" and no single cutover day. Each feature moves to its encrypted version through normal development → staging → main releases when it is ready (mapper, then personal data, then corp data), and its plaintext tables and server-held tokens are removed once its users are migrated. "Cutover" is just the last such release.
- **No visible change for users.** The app should look and work as it does today; only the backend becomes more secure. No in-app messaging about encryption; the owner may post about it on the forums at some point.
- **Guiding principle for the review:** anything in the design that shows users something new must be justified or removed. To revisit in the section review: the crypto core on its own subdomain, passkey and recovery-key nudges, trust-tier badges and labels, new banners and notices, and the change to location tracking when no tab is open (today the server keeps polling for up to 90 minutes while the tab is hidden).

### Decision 3, agreed 2026-10-06

- **Match today.** Anyone currently on a map can read its recent history after a key change, including people who just joined. When the key rotates, current members' apps pass the old keys along.
- **Retention stays as today:** 7-day event log, 24-hour undo. The earlier 30-day op log and revert-by-character are dropped unless revisited later.
- **History keys are not limited to managers.** This replaces the earlier "Manager+ only" default.

### Decision 4, agreed 2026-10-06

- **No tiers.** The Standard tier is dropped; everything is sealed, with no tier badges, labels or tier wording anywhere in the app.
- What Standard was for is covered by the sealed service: recovery (decision 1), background location tracking (decision 1), and, when corp spaces are built, scheduled corp pulls using a Director's token stored sealed in the enclave. Future features that need to read map contents (for example Discord alerts) must run inside the sealed service or a corp's own bot.
- Consequences for the doc: the escrow principal, the Steward service, tier fields in group genesis, tier badges, the leak accounting between tiers, and Standard-to-Sealed conversion are all removed.

### Decision 5, agreed 2026-10-06

- **No recovery delay.** Every unlock (sealed key service, passkey or recovery key) happens after an EVE login and works immediately.
- **Principle: EVE SSO is the access gate.** Whoever can log in to a user's EVE account can reach their LGI data, as today. Encryption protects users from LGI's operators and from database leaks, not from someone holding their EVE login.
- Consequences for the doc: the recovery delay and veto, account-proof cooldowns, and the separate recovery signing and anchor keys are removed or simplified in the identity section.

### Decision 6, agreed 2026-10-06

- **Match today, no special rule.** Leaving a corporation that grants map access removes access and rotates the map key at once. Rejoining restores access automatically through the corp grant, like any other access-list member (decision 1). Affiliation is checked against ESI's one-hour cache, as today.
- The only exception is decision 1's sale rule: a character detected as sold stays blocked until an owner removes the block.
- Consequences for the doc: the 7-day suspension grace, pinned-key re-admission and suspension states are removed.

### Decision 7, agreed 2026-10-06

- **No high-security mode.** The browser stays signed in and unlocked like today's session; users log in with EVE again only when the session expires or they sign out. No prompts, no extra setting.
- Consequences for the doc: high-security mode, its prompts for owners, managers and directors, and the related device classes are removed.

### Decision 8, agreed 2026-10-06

- **Match today.** The map creator owns the map; one owner is fine for any map. No two-owner requirement, no "only you can recover this" warning, no succession voting. Character-scoped maps work as today.
- Consequences for the doc: the distinct-account two-owner rule, the personal-map genesis policy and its warning, and manager succession voting are removed.

### Decision 9, agreed 2026-10-06

- **Optional for users.** No one is required to set up a passkey or recovery key, and there are no prompts (as in decision 1).
- **Owner-side safeguards, no extra cost:** the AWS KMS key that seals users' keys has a deletion waiting period (it cannot be deleted instantly and deletion can be cancelled during the wait), and an alert fires if deletion is ever scheduled. No second-region key copy and no extra backups.
- **Accepted risk:** if the sealed key records were destroyed anyway, users without a passkey or recovery key would lose personal data only (profiles, custom structures, saved plans, net worth history). Maps survive with other members, and EVE-derived data re-downloads.

### Working notes from decision 2 (to settle in the section review)

- **One domain:** keep everything on lgi.tools, no separate subdomain for the crypto core. Implication: the whole site follows the stricter security rules (tight content security policy, no third-party scripts on pages that hold keys).
- **Passkeys and recovery keys:** shown as options at login; no nudges, alerts or prompts.
- **Sealed and Standard:** resolved by decision 4; there are no tiers.
- **Banners and notices:** nothing beyond what exists today unless required (for example, a user blocked from a map, or a sale-detected notice to map owners).
- **Location tracking:** resolved; see decision 1 (polling runs in the sealed service, behaviour unchanged).

### Section-by-section review

The plan is now split into 32 review parts in [review/](review/00-index.md), rewritten under the decisions and principles above, each adversarially reviewed and checked for consistency. They are walked through in order; each part is marked agreed here as it is settled. The older files (01-06) are kept as background and are superseded by the review parts where they disagree.

| Part | Status |
|---|---|
| [Part 01: Scope, principles and threat model](review/01-scope-and-threat-model.md) | Agreed 2026-10-07 |
| [Part 02: Data classification and storage shapes](review/02-data-classification.md) | Agreed 2026-10-07 |
| [Part 03: What stays readable and what it reveals](review/03-readable-metadata.md) | Agreed 2026-10-07 |
| [Part 04: Leaks to close first](review/04-leaks-to-close-first.md) | Not started |
| [Part 05: The sealed service: shape, runtime and availability](review/05-sealed-service-shape.md) | Not started |
| [Part 06: Attestation, KMS sealing and the key-release rule](review/06-attestation-and-kms.md) | Not started |
| [Part 07: Reaching the sealed service: transport and request authentication](review/07-sealed-channel.md) | Not started |
| [Part 08: EVE login, token custody and token-bearing calls](review/08-eve-login-and-tokens.md) | Not started |
| [Part 09: Keys, sealed formats and getting keys back](review/09-key-hierarchy.md) | Not started |
| [Part 10: Optional passkeys and recovery keys](review/10-passkeys-and-recovery.md) | Not started |
| [Part 11: Account lifecycle: link, unlink, merge, transfer and deletion](review/11-account-lifecycle.md) | Not started |
| [Part 12: Map access lists, auto-admission, blocks and their integrity](review/12-map-access-and-integrity.md) | Not started |
| [Part 13: Map keys, rotation, history and map lifecycle](review/13-map-keys-and-history.md) | Not started |
| [Part 14: Character sales: detection, auto-blocks and notices](review/14-sale-detection-and-notices.md) | Not started |
| [Part 15: Where map logic runs: sealed service or browsers](review/15-mapper-placement.md) | Not started |
| [Part 16: Porting map logic and sealing Convex map rows](review/16-mapper-port-and-sealed-rows.md) | Not started |
| [Part 17: Location tracking in the sealed service](review/17-location-tracking.md) | Not started |
| [Part 18: Personal ESI sync in the sealed service](review/18-personal-esi-sync.md) | Not started |
| [Part 19: Personal reads: board, character sheet, skills and jobs](review/19-personal-reads.md) | Not started |
| [Part 20: User-authored documents: profiles, custom structures and preferences](review/20-personal-documents.md) | Not started |
| [Part 21: Industry planner, jobs and structures](review/21-industry.md) | Not started |
| [Part 22: Assets, valuation and net-worth history](review/22-assets-and-net-worth.md) | Not started |
| [Part 23: Corp data: structures, holdings, jobs and visibility](review/23-corp-data.md) | Not started |
| [Part 24: Public data and private-interest lookups](review/24-public-data.md) | Not started |
| [Part 25: Infrastructure, environments and cost](review/25-infrastructure-and-cost.md) | Not started |
| [Part 26: Browser security on lgi.tools: CSP, scripts and key handling](review/26-browser-security.md) | Not started |
| [Part 27: Code integrity: reproducible enclave builds, fingerprints and releases](review/27-code-integrity-and-releases.md) | Not started |
| [Part 28: Residual risks and adversarial review](review/28-residual-risks.md) | Not started |
| [Part 29: Operations: monitoring, support, admin tools and incidents](review/29-operations.md) | Not started |
| [Part 30: Shipping in parts: phases and exit criteria](review/30-phasing.md) | Not started |
| [Part 31: Migrating existing data and retiring plaintext](review/31-data-migration.md) | Not started |
| [Part 32: Testing strategy](review/32-testing.md) | Not started |

