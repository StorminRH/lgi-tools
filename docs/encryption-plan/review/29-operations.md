# Part 29: Operations: monitoring, support, admin tools and incidents

**Status:** Draft for owner review

## In one paragraph

This part sets how one owner runs LGI.tools once content is sealed. The admin console stays metadata only. Admin reassign goes (recommended), and readable `account` rows never extend key release. Session revoke also cuts off the browser session key. Pause switches stop worker ESI work without an enclave release, never the checks behind key release. An hourly Convex cron re-posts a nightly revaluation that an enclave outage made the daily batch miss. Telemetry, logs and alerts carry normalised paths, codes, counts and opaque IDs. A Convex check and an admin panel watch the sealed service; AWS alarms cover KMS. Each likely incident has a playbook that needs no user data. Users see nothing new, except the passkey or recovery-key option during a sealed-service outage.

## How it works today

- **Admin console.** The pages (overview, users, ESI, queue, health, search, statics, traffic) read `usage_logs`, `domain_events`, `esi_refresh_jobs`, the ESI scoreboard, `gsc_*`, statics snapshots and account metadata. No admin page reads content.
- **Admin actions.** Role change, session revoke, unlink, reassign, dead-letter requeue and statics review, each logged to `usage_logs`. Reassign moves the character's `account` row, tokens included, to the acting admin, then runs `runAfterCharacterLinkChanged` for the receiver, which reprojects map access: the admin gains every map the character's name or corp grants.
- **ESI controls.** No kill switch or polling config. ESI is protected by the error-budget floor (20), the Upstash scoreboard, the trickle cap and 420 handling. Stopping ESI or polling needs a deploy.
- **Telemetry and feedback.** `page_view` stores the full path and query string (including `?map=`), a localStorage visitor ID, referrer host and UTM tags, with the character ID, for 180 days. Traffic cards group by `path`. Feedback accepts only `title`, `message`, `path` and `category`, and sends those plus the character name and app version to Linear. No attachments.
- **Domain events** hold IDs, counts and outcomes (price runs, snapshot pulls, token state, job status, budget exhaustion), kept 400 days.
- **Alerts.** One Discord webhook (`DISCORD_ALERT_WEBHOOK_URL`) gets price degradation, dead-lettered jobs and public-budget exhaustion. Nothing watches Convex or uptime.
- **Housekeeping** prunes by age: `usage_logs` 180 days, `domain_events`, `gsc_*` and `corp_access_audit` 400, refresh jobs 7 (dead letters 30).
- **Errors.** Location sync logs up to 500 characters of free error text. Sign-in errors use the `auth_error` keys in `AUTH_ERROR_MESSAGES`.
- **Secrets.** Refresh tokens are encrypted with `EVE_TOKEN_ENCRYPTION_KEY` (Vercel env). Session tokens sit in Neon's `session` table.

Files: `src/app/(site)/admin/*`, `src/app/api/admin/*/route.ts`, `src/platform/auth/admin-users.ts`, `src/composition/map-access-identity.ts`, `src/composition/account-lifecycle/character-transfer.ts`, `src/platform/esi/dispatch.ts`, `src/components/composition/TelemetryReporter.tsx`, `src/components/telemetry/page-view-metadata.ts`, `src/data/telemetry/*`, `src/features/feedback/api-contract.ts`, `src/app/api/feedback/route.ts`, `src/app/(site)/page.tsx`, `src/platform/auth/token-crypto.ts`, `src/lib/alerts.ts`, `src/composition/pipelines/housekeeping.ts`, `convex/characterLocationApply.ts`.

## What changes

Nothing visible changes for users, except that during a sealed-service outage sign-in offers the passkey or recovery-key option to users who set one up (default 11). The owner gets a panel, alerts, pause switches and a revaluation catch-up cron; reassign goes; session revoke does more behind the same button. Telemetry and error-field fixes are Part 04's Phase 0 items.

Dropped from 01 ("Observability without content", "Support tooling") and 04 §22: Analytics Engine, the diagnostics bundle, the replay CLI, freeze and suspend, tier counts, append and fork metrics, escrow support, per-vendor billing alarms.

## Design

### Admin actions

| Action | After sealing |
| --- | --- |
| Set role | Unchanged. The admin role opens the console only, never keys. |
| Revoke sessions | Also revokes the account's browser session key records in the sealed service (accepted unsigned: it only removes access). The browser wipes keys at its next session check. |
| Reassign character | Removed (Q3). Logging in with the character on another account already moves it (`finishCharacterTransfer` cleans up the old link), and proves control. If kept (Part 11): no token, no data and no map access until the admin logs in as it. |
| Unlink, requeue, statics review | Unchanged. Jobs run in the workers; a statics promote reloads the enclave's table (Part 24). |

There is no "view as user" and no action that reads content. Key release follows the sealed service's own character-link record (default 2), never readable `account` rows (rule 5).

### Pause switches

Enclave code changes need a fingerprint release, so incidents need a switch. One readable `opsControls` row in Convex, edited from the Convex dashboard, holds `esiPaused`, `syncPaused`, `locationPollingPaused` and `minPollSeconds` (5 or more). Workers read it each scheduling pass and clamp it, so it can only stop or slow work.

They cover workers only: sync, location polling, valuation, public pulls. Custody checks at login and before key release (owner hash, affiliation; decisions 1 and 6) ignore `esiPaused`. If they cannot reach ESI, custody releases no new key. LGI's removals and blocks still apply.

### Revaluation catch-up

This part owns the catch-up cron that Part 22 relies on. When the enclave is unavailable, the daily batch's revaluation step records `sealed_unavailable` on its `cron_net_worth` run record in `usage_logs` (Part 22).

- **Cron.** A new hourly entry in `convex/crons.ts` calls a new cron-gated Vercel route under `src/app/api/cron/`. The route goes through today's cron gate (`requireCronAuth`, `Bearer` `CRON_SECRET`), so `CRON_SECRET` becomes a Convex environment variable per environment.
- **Rule.** The route reads only readable run records. If today's (UTC) price step succeeded and today has no successful `cron_net_worth` run, it posts one `revalue` job (Part 07), as the daily batch does, and records its own run. Otherwise it does nothing. It never re-runs prices or the drain, and it stops at the end of the UTC day; a day missed entirely is skipped, as today's failures are.
- **Repeats.** A repeat post is harmless: each account's day is one upsert keyed by (user, day), as today.
- **Pause.** The route posts nothing while `esiPaused` is set; valuation is a worker job (Pause switches).

### Monitoring

| Signal | Source | Check | Alert |
| --- | --- | --- | --- |
| Heartbeat | Leader lease, renewed every 10 s (Part 05) | Convex cron every 5 min | Lease older than 3 min |
| Unseal status | Heartbeat code (Part 06) | Same cron | Any code other than `ok` |
| Attestation freshness | Running fingerprint and last attestation time in the heartbeat | Same cron, plus Part 06's daily drift job | Fingerprint not on the deployed app's list, or no attestation in 15 min |
| Request queue | `sealedRequests` (Part 07) | Same cron | Oldest pending over 2 min, or over 10 expired in an hour |
| Location lag | Last poll per heartbeating user | Same cron | Any user over 2 min past their expected poll |
| Token health | `eve_token_state_changed` events | Same cron | 5 or more characters to `reauth_required` in an hour |
| Revaluation catch-up | `cron_net_worth` run records and the catch-up route's own runs | Same cron | Prices succeeded but no successful revaluation by 18:00 UTC, or the catch-up route failing for 3 hours in a row |
| Instance and enclave process | EC2 status checks; parent reports `nitro-cli describe-enclaves` | CloudWatch alarm | Failing for 5 min |
| KMS and policy | CloudTrail, EventBridge (Part 06) | AWS | Deletion scheduled, key disabled, policy changed |
| Cost | AWS Budgets, one budget per environment, filtered by environment tag | AWS | Production over $50 a month (Part 25 expects about $38). Staging over $50 a month (Part 25 expects $5 to $40, depending on its question 1) |

`/admin/health` gains a "Sealed service" section showing these signals. Limits:

- AWS signs the attestation, and the AWS account owner can change the key-release rule and switch off the alarms first. Published fingerprints make a change detectable by anyone who compares them, not prevented.
- Whoever serves lgi.tools could ship code that leaks keys after login. Neither the attestation check nor operations stops that; only the strict CSP (Part 26) and public repository history limit it.
- Anyone holding a user's EVE login reaches that user's data (decision 5).

### Telemetry, logs and error fields

- **Telemetry and feedback** normalise only what carries content (amends Part 04, fix 0-8). Content segments such as `/industry/[id]` (a blueprint type) become the route pattern. Query strings keep only the rule 9 allowlist. Map IDs stay: they are metadata and the most useful support detail. Workers record capability outcomes in today's shape (`outcome`, `code`, `durationMs`, `errorClass`) under a new `sealed` feature.
- **Logs.** Enclave log lines pass through the parent to CloudWatch (30 days, Part 25), so the parent sees them. The enclave logs only through a typed logger taking a closed-union code, numbers and opaque IDs; lint forbids `console` in `sealed-service/`. Other error fields follow Part 04, fix 0-9.
- **Domain events.** Unchanged, except `esi_snapshot_pulled` goes with `esi_snapshots` (Part 23), since its item count sizes corp holdings. A count-free `corp_assets_synced` event replaces it (Part 23). The workers emit it once per successful corp asset sync, with `dataset` (`owned_assets`), `ownerType` (`corporation`), `ownerId` (the corp ID) and the sealed document's readable `version`. It carries no item count and no snapshot ID. `DOMAIN_EVENT_TYPES` and the admin ops view's summary ("Corporation assets synced") change to match. Retention stays 400 days.

### New failures, existing copy

| New failure | Shown as |
| --- | --- |
| Browser attestation check fails | Sign-in error `state_mismatch` |
| Sealed service unreachable, or Convex down, at sign-in | Sign-in error `token_exchange_failed`, plus the passkey or recovery-key option for users who set one up |
| Key release refused at login (owner-hash or affiliation check failed or unreachable) | Sign-in error `token_exchange_failed` |
| Key record write fails | Sign-in error `db_write_failed` |
| Map key refused (no grant, blocked) | Today's lost-access state for the map (`forbidden`) |
| Broken access-list chain | Today's map `unavailable` state; no key released |

### Incident playbooks

| Incident | What users see | Owner action |
| --- | --- | --- |
| Enclave down, restarting or failing to unseal | Today's sign-in error, plus the passkey or recovery-key option for users who set one up; edits wait then show today's errors; tracking and syncs pause; maps stay readable | systemd and the Auto Scaling group usually recover it. Otherwise read the codes, restart, re-run the release job, or roll back (Part 27). |
| KMS deletion scheduled | Nothing while the enclave stays up (KMS is called only at boot, Part 06). A restart, release or replacement fails to unseal while deletion is pending, as "enclave down". | Cancel and re-enable the key the same day; do not restart first. Treat as root-credential compromise. |
| Key policy changed outside the release job | Nothing | (1) Revert via the release job. (2) In CloudTrail, list every `kms:Decrypt` and `GenerateDataKey` call during the change, with principal and attestation measurement. (3) If any came from an unpublished fingerprint or an unattested principal, treat the service root key as exposed: rotate it, re-wrap all key records and sealed EVE tokens in a new release, and re-issue token and corp keys. (4) Note it in the public repo. Speed limits what follows, not whether the key leaked. |
| Convex or Neon outage | Today's behaviour; sign-in also fails (relay or key records unavailable) | Wait; the enclave reconnects with backoff. Then confirm queues drained. |
| Revaluation missed (catch-up alert) | Nothing new: the net-worth chart lacks today's point until a revaluation runs, as after today's failed runs | Usually nothing: once the enclave is back, the next hourly run catches up. If the route itself fails, read its run records and fix forward; the next day's batch revalues as normal. |
| ESI outage or error limit | Stale data, as today | Usually nothing. Set `esiPaused` if CCP asks. |
| Mass token invalidation | Today's reconnect badges | Check whether CCP or LGI caused it. Unseal failures carry their own code and never count as `invalid_grant` strikes, so an LGI bug cannot null tokens. |
| Database or backup theft | Everyone logs in again | Rotate service credentials. Revoke all sessions (session tokens are in Neon; one could act for metadata and trigger unsigned removals and blocks). Until a feature migrates (decision 2): rotate its env key (such as `EVE_TOKEN_ENCRYPTION_KEY`), treat its plaintext tables and tokens as exposed, force re-authentication. These steps end when plaintext tables and env keys retire (Part 31). Exposed metadata is accepted (Part 03). |

### Supporting users

Support uses metadata (job codes, document versions and timestamps, scope health, sessions, the panel) and actions that read nothing (requeue, revoke, unlink, log in again). Map mistakes use today's 24-hour undo. Users describe problems in the feedback text; no upload feature is added.

### Testing

Unit tests cover switch clamping, each threshold, and that: an unseal failure never adds an `invalid_grant` strike; a paused state never allows key release on stale affiliation; a readable-only character link never releases a key; the catch-up route posts a `revalue` job only when today's prices succeeded and no revaluation has, posts nothing while `esiPaused` is set, and rejects calls without `CRON_SECRET`; `corp_assets_synced` carries no item count or snapshot ID. Part 32's log-capture tests check that no suite emits fixture tokens or system or type IDs. Before Phase 1 promotes, trigger each alert and walk each playbook once on staging.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
| --- | --- | --- | --- |
| `usage_logs` (normalised path), capability outcomes, cost metrics | Yes | No | LGI server and sealed service |
| `domain_events` (including `corp_assets_synced`), `esi_refresh_jobs`, `gsc_*` | Yes | No | LGI server; sealed service runs jobs and writes token and corp sync events |
| Feedback (to Linear, with author name) | Yes | No | LGI server |
| Heartbeat, fingerprint, unseal code, queue stats, `opsControls` | Yes (Convex) | No | Sealed service writes heartbeat and reads controls |
| `cron_net_worth` and catch-up run records | Yes (`usage_logs`) | No | LGI server (Convex cron, Vercel route) |
| Enclave logs, alerts | Yes (codes, counts, opaque IDs) | No | Sealed service, LGI server, AWS |
| Admin user view | Yes | No | LGI server |
| Map contents, locations, assets, industry, corp data, documents | No | Yes | Browser displays; sealed service computes; never in the console |

## Hard rules

1. [Agreed] Operations adds no user-facing UI. Incidents show today's error states, per the failure table. One allowed difference: the passkey or recovery-key option when the sealed service is unreachable. (Principle 1, decision 2, default 11.)
2. [Proposed] The admin console and support work only on metadata. (Derived from principle 2.)
3. [Agreed] The KMS key has a deletion waiting period, and an alert fires when deletion is scheduled. (Decision 9.)
4. [Proposed] No "view as user". No admin action moves, re-seals or reveals sealed data or tokens, and the admin role never grants keys.
5. [Proposed] A character grant counts toward key release only after the sealed service has verified an EVE login for that character on that account, in its own character-link record. Readable `account` changes, reassign included, never extend key release.
6. [Proposed] LGI's revocations are accepted unsigned. Session revoke also revokes the browser session key records.
7. [Proposed] Pause switches have a closed schema, are clamped in the enclave, and cover workers only. Custody checks ignore them and fail closed when ESI is unreachable.
8. [Proposed] The workers keep today's ESI protections: budget floor 20, scoreboard, trickle cap, 420 handling, `Expires` cache and the 5-second floor.
9. [Proposed] Telemetry and feedback paths replace content segments with the route pattern and keep only these params: `map`, `character`, `utm_*`, `sort`, `dir`, `range`.
10. [Proposed] Logs and error fields carry closed-union codes, numbers and opaque IDs only. The enclave logs only through the typed logger.
11. [Proposed] Third-party payloads carry no system, type, location, asset or structure IDs or names. Character names and IDs are metadata and allowed.
12. [Proposed] An unseal or decrypt failure never counts as an `invalid_grant` strike.
13. [Proposed] Existing retention stays the same. New CloudWatch logs are kept 30 days. `esi_snapshots` is dropped (Part 23).
14. [Proposed] Every playbook step can be done without reading user content.
15. [Proposed] Revaluation catch-up is scheduled outside the enclave by an hourly Convex cron and a cron-gated Vercel route that read only readable run records, and it posts at most the missed same-day `revalue` job. (Part 22, rule 17.)

## Assumptions

- The dead-letter alert's `resource` is an endpoint template, not a path with IDs. Check callers in `src/data/esi-refresh-jobs/queries.ts`.
- A 5-minute Convex cron calling Discord fits the plan. Check limits; add the webhook as a Convex variable.
- A Convex cron can call the cron-gated Vercel route with `CRON_SECRET` held as a Convex variable, in every environment. Check that Vercel accepts the call and that each environment's Convex deployment calls its own Vercel deployment.
- AWS Budgets can split one account's spend by environment tag (Part 25 recommends one account). Check that cost allocation tags are active before the budgets go live.
- The running enclave keeps working while KMS deletion is pending, because it calls KMS only at boot (Part 06). Test on the staging key.
- The parent can report enclave process state without seeing content. Check `nitro-cli` output.
- A stolen session token may work without `BETTER_AUTH_SECRET` somewhere (Convex auth, a bearer path). Check; revoking after theft stays the default either way.
- The owner reads Discord and email daily. Confirm.
- No admin page reads content today (checked by import list). Re-check when pages are added.

## What users see

Nothing new. Incidents show today's error, sign-in and reconnect states. Exception: when the sealed service is unreachable, users with a passkey or recovery key see that option plainly at sign-in. After a database theft everyone logs in again. Only the owner sees the health section, alerts and switches.

## Questions for the owner

1. **Alert channels?** *Recommended:* operational alerts go to the existing Discord webhook. KMS, policy and cost alerts go by SNS email, with a Discord copy later if wanted.
2. **Response targets?** *Recommended:* within 24 hours for KMS deletion, a policy change or fingerprint drift (this limits what follows, not a release already made). Enclave down: same day, best effort. Else: the next daily look. No pager.
3. **Admin reassign: remove it, or keep it metadata only?** *Recommended:* remove it; logging in with the character moves it and proves control. A kept reassign brings no token, data or map access until that login. Its use shows in the `admin_character_reassign` `usage_logs` action (180 days of history).
4. **Pause switches: Convex dashboard, or an admin page?** *Recommended:* the Convex dashboard. That means no new UI.
5. **Add the sealed-service section to `/admin/health`?** *Recommended:* yes, read from the same rows the Convex check uses.
