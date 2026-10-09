# Part 06: Attestation, KMS sealing and the key-release rule

**Status:** Agreed 2026-10-08

## Owner review outcome (2026-10-08)

This section overrides the rest of the part where they disagree. The owner approved the simplified design below, the same image for staging and production, and a Phase 0 sign-in error fix.

- **Kept core:** one KMS key per environment; the root key generated only in bootstrap mode, insert-only row, fail closed without it; Use bound to `kms:RecipientAttestation:ImageSha384` (PCR0) only, never PCR8 alone, never zeros; no IAM delegation; deny unattested use (which also always denies `ReEncrypt*` and `GenerateDataKeyWithoutPlaintext`); deny grants. Browsers verify the attestation (COSE signature, chain to the pinned AWS Nitro root certificate, PCR0 on the list and not zeros, `user_data` environment) before sending anything, with a silent `no-store` list refetch on an unknown hash and no sign-out on mid-session re-attestation. The per-login nonce is dropped: browsers read the attestation document from the status row (settled in Part 07).
- **Fixes:** break-glass is limited to the root user (`aws:PrincipalArn` = account root plus `aws:MultiFactorAuthPresent`), includes `kms:GetKeyPolicy`, and `BypassPolicyLockoutSafetyCheck` is never set; release-role deletion is repaired as root. The 30-day deletion window is enforced with `kms:ScheduleKeyDeletionPendingWindowInDays`; recovery is `CancelKeyDeletion` then `EnableKey`. KMS costs about $2/month for two keys. AccessDenied alerts use EventBridge rule state `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS`. `SOURCE_DATE_EPOCH` is pinned to a constant so builds reproduce. The enclave needs a small CMS parser for `CiphertextForRecipient`.
- **Automatic fingerprint flow:** `sealed-service/fingerprints.json` is an append-only list of published PCR0s, newest first (retired hashes in a `retired` array), not an image input, bundled and served at `/sealed/fingerprints.json`; each branch's copy is that environment's list. A PR check builds the image when enclave inputs change and fails until PCR0 is the list head, printing the line to add; the agent preparing the PR adds it (a revert moves the old hash to the top). The release workflow runs on push to `staging` and `main` (plus `workflow_dispatch` on those branches), one concurrency group per branch without cancelling in-progress runs, with an AWS role trusting the default push OIDC subject `repo:StorminRH/lgi-tools:ref:refs/heads/<branch>` (no GitHub environments, no approval, no subject template). Steps: exit if the deployed hash equals the list head; build and refuse unless PCR0 equals the head; wait until the live site serves the new list (production: poll `/sealed/fingerprints.json`; staging: GitHub deployment status for the SHA); `PutKeyPolicy` [old, new]; instance refresh with rollback; `PutKeyPolicy` [new], or [old] on rollback, with a final step setting the policy to the hash actually in service; post one Discord line naming old and new hash and the run URL. With staging at zero instances, update the launch template and set the policy to the new hash only. The policy holds only the running hash at rest. Rollback is a `git revert` through the same flow; after an enclave release, never use Vercel instant rollback for the app.
- **Dropped:** the production approval and GitHub environments, agent-landed `fingerprints:add` after merge, per-environment current/previous/retired states, the retire workflow, the template diff check (replaced by one pure policy-render function with a unit test in `pnpm check`), branch-provenance and multi-build checks, the weekly rebuild, the daily attested drift check and its Vercel role, the public policy-hash workflow (Part 28 question 4 answered no), the policy-read roles, and the `service_unavailable` text and passkey mentions (Part 05: today's error plus the Login server row).
- **Alerts:** SNS email for key deletion and cancel, disable/enable, `PutKeyPolicy`, `CreateGrant`, AccessDenied on either key, root sign-in, and IAM changes to the parent and release roles. Each automated rollout's Discord line explains its two `PutKeyPolicy` emails, so an email without one stands out. Browser verification failures post at most one Discord alert per code per hour through `alerts.ts` (a new client usage action). Part 29's heartbeat-fingerprint-on-list check is the operational signal.
- **Questions:** Q1 PCR0 only; Q2 the committed list plus the release job summary (PCR0, commit, EIF SHA-256, run URL, optional `attest-build-provenance`); Q3 the automated workflow, root with MFA as break-glass; Q4 SNS email for AWS events, Discord for rollouts and attestation failures; Q5 and Q7 settled by Part 05; Q6 one image for both environments; Q8 30 days, enforced.
- **Caveat wording:** a policy change that serves users shows in the published fingerprints; an offline unseal shows only in the account owner's alerts (README decision 1 reworded to match).

**Amended by the Part 07 review (2026-10-09):** boot step 1 no longer makes a fresh channel key: the channel private key is sealed under the service root key in Neon and loaded at boot, so restarts and blue/green releases keep it (Part 07 step 6). The enclave's Convex write credential is a shared secret held sealed under the root key, not an enclave-signed JWT (step 2).

**Verification findings (2026-10-08, to apply as questions are settled):**
- Facts confirmed: KMS `Decrypt`/`GenerateDataKey` with an attestation `Recipient` return `CiphertextForRecipient` (a CMS EnvelopedData blob: RSA-OAEP-SHA256 key wrap plus AES-256-CBC, so the Node enclave needs a small CMS parser); `kms:RecipientAttestation:ImageSha384` equals PCR0; the deny statement with a negated operator also catches unattested calls; omitting IAM delegation works; PCR0 pins kernel, ramdisk and app, PCR4 is the instance ID, PCR8 the signing certificate; debug enclaves report zero image PCRs; the AWS Nitro root (P-384, expires 2049-10-28) can be pinned by its certificate SHA-256 `641a0321...79bb5b`; browsers can verify COSE_Sign1 ES384 with WebCrypto plus a small CBOR/DER parser; `public_key` is at most 1024 bytes and `user_data` 512 (a post-quantum HPKE key would not fit, so Part 09 must hash it).
- Corrections: KMS costs about $2/month for two keys (not cents). The break-glass statement must be limited to the root user (`aws:PrincipalArn` = account root plus `aws:MultiFactorAuthPresent`), or the account principal re-delegates admin actions to IAM; add `kms:GetKeyPolicy`; never set `BypassPolicyLockoutSafetyCheck`. Enforce the 30-day deletion window with `kms:ScheduleKeyDeletionPendingWindowInDays`; recovery is `CancelKeyDeletion` then `EnableKey`. AccessDenied alerts need the EventBridge rule state `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS` (KMS decrypt events are read-only). Scheduled GitHub workflows run on the default branch, which is `development`. Reproducible fingerprints need `SOURCE_DATE_EPOCH` pinned to a constant.
- Today's code: no workflow runs on push or holds repository secrets, so the release Action is the first credentialed workflow. A failed EVE sign-in today ends on `/?error=<code>` with no message (three of the four `?auth_error` messages are dead code; `login_required` is dropped silently). Sessions are a rolling 7-day window.
- Conflicts with agreed decisions: the production approval, agent-landed `fingerprints:add`, per-environment current/previous states, the retire workflow, the `service_unavailable` text and the passkey-during-outage wording all conflict with Parts 01 and 05. The template diff check, branch-provenance checks, daily attested drift check and public policy-hash workflow guard only against the owner (principle 6).

## In one paragraph

This part ties sealed data to published code. One AWS KMS key per environment seals the service root key, and its policy releases it only to an enclave whose image hash is on that environment's published list (current and previous). At boot the enclave proves its image to KMS and unseals the root key into memory. At each login the browser checks a fresh attestation document before sending anything, then seals requests to the channel key it vouches for (Part 07). KMS deletion takes 30 days and can be cancelled; deletion requests and policy changes alert the owner. The limits stay plain: AWS signs the attestation, the AWS account owner can change the rule, and anyone holding a user's EVE login reaches their data.

## How it works today

There is no attestation, no KMS and no AWS dependency. Server-side secrets are environment keys that operators can read:

- EVE tokens and ESI snapshots are sealed with AES-256-GCM under `EVE_TOKEN_ENCRYPTION_KEY` and `ESI_SNAPSHOT_ENCRYPTION_KEY`, required variables cached in process memory.
- CI runs tests only. No workflow deploys, uses a GitHub environment or needs an approval. Vercel deploys `staging` and `main`, not `development`.
- Operations alerts exist: `src/lib/alerts.ts` posts Discord embeds through `DISCORD_ALERT_WEBHOOK_URL` for price degradation, ESI dead letters and public ESI budget exhaustion.
- Sign-in failures show one of several messages keyed by `?auth_error` (`state_mismatch`, `token_exchange_failed`, `db_write_failed`, ...).
- Sessions last 7 days. The app has no reload-on-deploy or version-skew handling, so open tabs keep their old bundle.
- The browser already reports events through a telemetry beacon.

Files: `src/platform/auth/token-crypto.ts`, `src/data/esi-snapshots/crypto.ts`, `src/lib/aes-gcm.ts`, `src/lib/env.ts`, `src/lib/alerts.ts`, `src/lib/discord.ts`, `src/app/(site)/page.tsx`, `src/platform/auth/auth.ts`, `src/components/composition/telemetry/client.ts`, `vercel.json`, `.github/workflows/test.yml`, `.github/workflows/coverage-health.yml`, `.github/workflows/cleanup-build-artifact.yml`.

## What changes

Nothing visible changes for users, except one accurate message when the sealed service is down (see What users see). Behind the scenes: two KMS keys, CloudTrail alerts, a protected release job, per-environment fingerprint lists, and attestation checks inside today's login. The environment keys retire in Phase 5 (Part 31).

## Design

### Key chain (Part 09 covers the rest)

| Layer | What it is | Where it lives |
| --- | --- | --- |
| KMS key | Symmetric, one per environment: `alias/lgi-sealed-production`, `alias/lgi-sealed-staging` | Inside KMS; never exported |
| Service root key | 256-bit key from `GenerateDataKey` with an attestation, made only in bootstrap mode | Ciphertext in Neon `sealed_root_key` (environment, KMS key ARN, ciphertext, created at); plaintext only in enclave memory |
| Everything below | User, map, corp, token and service signing keys | Key records under the service root key (Part 09) |

The enclave calls KMS once per boot, so KMS costs stay at cents per month.

**Bootstrap.** Only a one-shot bootstrap mode, requested explicitly by the parent, generates the root key and the identity-assertion key record. `sealed_root_key` is insert-only, unique per environment, never upserted. A normal boot that cannot read the row fails closed with `unseal_no_root`. Neon point-in-time restore covers accidental deletion.

### Key policy

| Statement | Principal | Actions | Condition |
| --- | --- | --- | --- |
| Use | Parent instance role | `Decrypt`, `GenerateDataKey` | `StringEqualsIgnoreCase` on `kms:RecipientAttestation:ImageSha384` against the allowed hashes |
| Deny unattested use | `*` | `Decrypt`, `GenerateDataKey*`, `ReEncrypt*`, `DeriveSharedSecret` | `StringNotEqualsIgnoreCase` on the same key and list; also catches requests with no attestation |
| Deny grants | `*` | `CreateGrant` | None |
| Policy edits | Release role (GitHub OIDC) | `GetKeyPolicy`, `PutKeyPolicy` | None |
| Policy read | Drift-check role (Vercel OIDC) | `GetKeyPolicy`, `DescribeKey` | None |
| Public policy read (only if Part 28 question 4 is accepted) | Public drift-check role (GitHub OIDC, scheduled workflow on `main`) | `GetKeyPolicy`, `DescribeKey` | None |
| Break-glass admin | Account root, with MFA | `Describe*`, `Enable`/`Disable`, `ScheduleKeyDeletion`, `CancelKeyDeletion`, `PutKeyPolicy` | No use actions |

The policy omits AWS's default IAM delegation, so IAM alone never grants use. KMS answers with `CiphertextForRecipient`, so the parent never sees the root key. Because the release role can call `PutKeyPolicy`, the job refuses any rendered policy that differs from `sealed-service/kms/key-policy.template.json` outside the hash lists. That check catches mistakes, not repo writers; the production approval is the boundary.

**Measurement.** The policy names PCR0, which pins kernel, ramdisk and application. PCR4 breaks on instance replacement. A PCR8-only rule is rejected: the signing-key holder could unseal any image unseen. Debug enclaves report all-zero PCRs; no list contains zeros and browsers reject them.

**Image inputs.** Part 27 owns them: `sealed-service/` sources, the shared `src/` modules the bundle reaches (Part 05; listed in `sealed-service/bundle-inputs.txt`) and the pinned toolchain. Fingerprint lists, the policy template and release workflows are never inputs, so a fingerprints-only commit leaves PCR0 unchanged. Baked profiles hold only non-secret constants (KMS key ARN, Convex URL, Neon host); the parent picks the profile name.

### Boot and unseal

1. The enclave generates a fresh RSA pair for KMS and a fresh channel key (Part 07).
2. It gets an attestation document carrying the RSA public key from the Nitro Security Module.
3. It calls `Decrypt` on the root-key blob with that document as recipient. KMS checks PCR0 and returns the key encrypted to the RSA key.
4. It decrypts, discards the RSA pair, loads its identity-assertion key record, and only then takes the leader lease (Part 05).

On any failure it serves nothing, writes a code to its heartbeat row and retries with backoff.

### Attestation document

| Field | Contents |
| --- | --- |
| `pcrs` | Image hash checked by browsers |
| `public_key` | Per-boot channel key; HPKE as in Part 07, suite settled in Part 09 |
| `user_data` | Plain JSON: environment name and identity-assertion public key |
| `nonce` | Browser's 32 random bytes, echoed |

Vercel and Convex pin the identity-assertion public key at bootstrap (Parts 07 and 08).

### Browser verification

The crypto worker (Part 26) sends a nonce in a plain attest request through Convex (Part 07) and checks:

1. COSE_Sign1 ECDSA P-384 signature verifies with WebCrypto.
2. Chain leads to the bundled AWS Nitro root (pinned by SHA-256), valid at the document's timestamp.
3. Nonce matches, so a wrong clock never locks anyone out.
4. PCR0 is on this environment's list and not zeros. If unknown, the worker silently fetches `lgi.tools/sealed/fingerprints.json` (same trust root as the bundle) and re-checks.
5. `user_data` names this build's environment.
6. Only then is the PKCE verifier sent, sealed to `public_key` (Part 08).

After an enclave restart the channel key changes and the worker repeats steps 1 to 5 silently. A mid-session re-attestation never signs the user out or shows sign-in copy; if it fails, the operation fails as a network failure does today.

| Login failure | Shown |
| --- | --- |
| Sealed service unreachable or timed out | New `service_unavailable` key: "Sign-in is temporarily unavailable. Wait a moment and try again." Plus the passkey or recovery option if the user has one (Part 10) |
| Attestation verification fails | `state_mismatch` ("could not be verified") |
| EVE rejects the code | `token_exchange_failed`, as today |

Verification failures send a code, never content, through the telemetry beacon, and any mismatch triggers `alertSealedAttestationFailure` in `alerts.ts`. Production builds accept only the AWS root; release builds refuse the dev sealed service's stand-in (Part 25).

### Fingerprint lists and policy rollover

Part 27 owns `sealed-service/fingerprints.json` and how hashes reach it: CI builds and attests on `development`, and an agent lands `pnpm fingerprints:add` on `development` for both environments through the normal `pnpm check` flow. Nothing is bot-committed. Each entry carries a state per environment (`current`, `previous` or `retired`), so each environment allows at most two hashes. Listing a hash for production early is harmless: the production policy does not allow it yet.

This part owns only the KMS policy rollover:

1. The app deploy that lists the new hash ships first: staging on the promote, production on the release.
2. Then that environment's release job rebuilds and requires the listed PCR0 (Part 27), renders the policy from the template with that environment's `current` and `previous` hashes, and applies it. The new enclave boots and takes the lease.
3. Staging rolls on the promote; production rolls on the release after owner approval.

The previous hash drops from the policy at the next release. An immediate removal happens only when the old image has a security flaw: an owner-approved retire run removes the hash from the policy at once, and the list follows through Part 27's flow. Rolling back means restarting the previous image.

### Who may change the policy

`.github/workflows/sealed-release.yml` runs in `sealed-staging` (branch `staging`) and `sealed-production` (branch `main`, owner approval), each with deployment-branch rules. The default environment OIDC subject carries no branch, so the subject template is customised to include the ref. Each release role trusts only its branch plus environment. The job refuses hashes without provenance from the deploying branch. Separate instance roles mean a parent booting the wrong profile gets nothing: KMS denies the unseal.

### Drift check and alerts

A step in the daily batch cron sends a real attest request with its own nonce, verifies it with the shared browser verifier, and compares PCR0 and `user_data` with the list. It also diffs the live key policy against the rendered template. Mismatches post through a new `alertSealedDrift` in `alerts.ts`. If the owner accepts Part 28 question 4, a scheduled GitHub Actions workflow in the public repo also reads the live policy through the public drift-check role, with no stored secrets, and logs its hash in the job summary, so a policy change shows publicly.

AWS-side events must not depend on Vercel, so EventBridge rules on the CloudTrail trail send SNS email for: `ScheduleKeyDeletion`, `CancelKeyDeletion`, `DisableKey`, `EnableKey`, `PutKeyPolicy`, `CreateGrant`; `AccessDenied` on either key; IAM changes to the parent, release and drift-check roles (including the public one, if added); root sign-in. All fit the free tiers.

Deletion waits 30 days, the maximum. The rendered policy grants `ScheduleKeyDeletion` only to root. While deletion is pending the running enclave keeps working but the next boot fails (Part 29).

### The honest caveat

- AWS signs the attestation, so trusting the enclave means trusting AWS.
- Against the AWS account owner, and anyone controlling the owner's GitHub account (which carries the production approval), protection is procedural, not technical. A policy admitting an unpublished image could unseal every key without any browser seeing it. Alerts report to that same owner; the public cannot see the policy or CloudTrail. Published fingerprints prove only what browsers talk to.
- Whoever serves lgi.tools serves the fingerprint list and could ship code that leaks keys after login. That is visible in the public repo, not prevented (Part 27).
- Anyone holding a user's EVE login reaches their data (decision 5).

### Dropped from older docs

Sigsum, WEBCAT and transparency-log publication of fingerprints (01, 04); separate origins (app./api./relay./data./ops.).

### Risks

- Stale tabs reject a new enclave: silent list refetch.
- Root blob lost or a second root minted: insert-only row, bootstrap-only generation, Neon restore.
- Release role or the owner's GitHub compromised: approval, template diff, alerts; residual (Part 28).
- AWS trust: stated, not mitigated.

### Testing

- Staging KMS deny cases: unattested call from the parent, debug enclave, unlisted PCR0, grant creation.
- Wrong-profile boot fails; boot against an empty `sealed_root_key` refuses to serve.
- A fingerprints-only commit leaves PCR0 unchanged.
- The template diff check refuses changes outside the hash lists.
- Stale tab: open on the old bundle, roll the enclave, and the next map edit succeeds without sign-out.
- Recorded-document verifier test in Chrome, Firefox and Safari, including debug-PCR rejection.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
| --- | --- | --- | --- |
| KMS key material | No (never leaves KMS) | n/a | AWS KMS |
| Service root key | No | Blob in Neon; plaintext in enclave memory only | Sealed service |
| Per-boot RSA and channel private keys | No | Memory only | Sealed service |
| Channel public key, attestation documents | Yes | No | Sealed service makes; browser verifies |
| Fingerprint lists | Yes (public repo, app bundle, served file) | No | CI |
| Key policy | Yes (to the AWS account) | No | Release job |
| Heartbeat unseal codes, verification-failure codes | Yes (Convex, telemetry) | No | Sealed service, browser |
| CloudTrail records and alerts | Yes (AWS, owner email, Discord) | No | AWS, LGI server |

## Hard rules

1. [Agreed] Users' keys are sealed through AWS KMS bound to the enclave's fingerprint. Browsers verify attestation before sending anything.
2. [Agreed] Enclave builds are reproducible and fingerprints are published.
3. [Agreed] The KMS key has a deletion waiting period and a deletion alert. No second-region copy, no extra backup.
4. [Agreed] No in-app messaging about encryption or its caveats; the owner may publish it (decision 2).
5. [Proposed] Internal docs state the caveat in full.
6. [Proposed] The policy names only PCR0, never PCR8 alone, never zeros. It omits IAM delegation, denies unattested use and grants, and grants deletion only to root.
7. [Proposed] Policy changes come only from `sealed-release.yml`, pinned per environment to its branch. The job refuses changes outside the hash lists and hashes without branch provenance.
8. [Proposed] Each environment's policy allows at most its `current` and `previous` hashes from Part 27's file. The app deploy that lists a hash ships before the policy allows it.
9. [Proposed] Image inputs follow Part 27 (`sealed-service/` sources, the shared modules in `bundle-inputs.txt`, the pinned toolchain); fingerprint lists, the policy template and release workflows are never inputs; baked profiles hold non-secret constants only.
10. [Proposed] The root key is generated only in bootstrap mode, its row is insert-only, and a boot without it fails closed. It never exists in plaintext outside enclave memory.
11. [Proposed] Browsers verify at every login and channel-key change, with nonce freshness and a silent list refetch on unknown PCR0. Production builds accept only the AWS Nitro root.
12. [Proposed] Mid-session re-attestation never signs out or shows sign-in copy. Login failures map to the keys above; verification failures report codes and alert through `alerts.ts`.
13. [Proposed] 30-day deletion window, the listed SNS alerts, and a daily attested drift check, plus the public policy-hash check if Part 28 question 4 is accepted.

## Assumptions

| Assumption | How to check |
| --- | --- |
| KMS denies unattested and debug-mode `Decrypt` | Staging tests above |
| WebCrypto plus small CBOR and X.509 parsers verify in Chrome, Firefox and Safari within the login budget | Spike with recorded documents (Part 32) |
| The nonce round trip through Convex adds well under a second | Measure on staging |
| One free CloudTrail trail feeds EventBridge | Trigger each event on staging |
| A customised OIDC subject plus branch rules pins repo, branch and environment | Assume each role from a wrong-branch run |
| Neon's restore window covers the root row | Check the plan's retention |
| The Nitro root certificate stays valid (30 years) | Check the pinned fingerprint against AWS's value |

## What users see

Nothing new, with one exception: if the sealed service is unreachable at login, the existing auth callout shows "Sign-in is temporarily unavailable" instead of a false "EVE rejected the sign-in", plus the passkey or recovery option for users who set one up (Part 10). Enclave restarts and releases show nothing.

## Questions for the owner

1. **Which measurement?** *Recommended:* PCR0 only.
2. **Where are fingerprints published?** *Recommended:* `sealed-service/fingerprints.json`, release notes and build provenance.
3. **Who may change the policy?** *Recommended:* the release job, with your approval for production; root with MFA as break-glass.
4. **Alert channel?** *Recommended:* SNS email for AWS events; the existing `alerts.ts` Discord channel for drift and attestation failures.
5. **Overlap?** *Recommended:* keep current and previous; drop previous at the next release, sooner only for a security flaw.
6. **One image for both environments?** *Recommended:* yes, so the bits tested on staging are the bits released.
7. **Outage message?** *Recommended:* add the one `service_unavailable` key rather than reuse a misleading one.
8. **Deletion window?** *Recommended:* 30 days, the maximum.
