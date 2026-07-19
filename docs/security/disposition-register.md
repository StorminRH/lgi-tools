# Security deep-research disposition register

**Report:** LGI.tools Security Deep-Research Report, 2026-07-19, code snapshot
`141e914` (findings LGI-01…LGI-12).
**This register:** session 3.9.4.1. Every finding was verified against live code
(Phase-A `gpt-5.6-sol` verification fan-out, reconciled and spot-re-checked by
the session). **Only LGI-08 was acted on** (database privilege separation — see
[db-privilege-runbook.md](db-privilege-runbook.md)); all other confirmed findings
are verify-and-route only, with no behavior change, and are recorded in
[`docs/backlog.md`](../backlog.md).

Verdict vocabulary: `confirmed | partially-confirmed | refuted | not-applicable`.
This codebase's material context: EVE scopes are **read-only** (no in-game
writes), there are **no payments**, and there is effectively a **single admin**.

| ID | Report severity | Verdict | Acted on? | Routed |
| --- | --- | --- | --- | --- |
| LGI-01 | High (P0) | confirmed | No (verify + backlog) | backlog · L |
| LGI-02 | High (P0) | confirmed | No | backlog · L |
| LGI-03 | Medium (P0/P1) | confirmed | No | backlog · M |
| LGI-04 | Medium (P1) | confirmed | No | backlog · M |
| LGI-05 | Medium (P1) | confirmed | No | backlog · M |
| LGI-06 | Medium (P1) | confirmed | No | backlog · M |
| LGI-07 | Medium (P1) | confirmed | No | backlog · M |
| **LGI-08** | **Medium (P1)** | **confirmed** | **Yes — this session** | runbook + migration `0049` |
| LGI-09 | Medium (P1) | partially-confirmed | No | backlog · M |
| LGI-10 | Medium (P2) | confirmed | No | backlog · L |
| LGI-11 | Low (P2) | confirmed | No | backlog · S |
| LGI-12 | Process (P2) | partially-confirmed | No | backlog · M |

## LGI-01 — Null `ownerHash` bootstrap can miss an EVE character transfer — **confirmed**

The state-machine gap is real. On a first character link, `reconcileCharacterOwner`
runs before Better Auth creates the account row, so the row starts with
`ownerHash = null` (`owner-transfer.ts:106-117`); `classifyOwnerReconcile` maps a
null stored hash to `backfill`, never `purge` (`owner-reconcile.ts:32-34`). If the
EVE character is transferred to a new owner before the account's second
authentication, the new owner's hash meets the same null state and is silently
backfilled onto the existing account. The installed Better Auth generic-oauth
flow (`getUserInfo` before `createAccount`) confirms the ordering that makes this
reachable — a legacy/fresh-null row is indistinguishable from a transfer. Impact
is an LGI account takeover; read-only scopes and no payments bound the downstream
blast radius, but inherited data/sessions/linked characters are exposed.
**Routing:** L — next authentication-lifecycle remediation; start with an
installed-Better-Auth integration test (first link → transfer → next login), then
atomic owner initialization + explicit legacy-null migration state.

## LGI-02 — Destructive/admin actions do not require recent proof — **confirmed**

`freshAge: 0` disables Better Auth's freshness gate, sessions live 7 days, and the
cookie cache serves accepted session state for up to 5 minutes
(`auth.ts:105-116`). Account deletion (`account/delete/route.ts`) and admin
role/reassign/unlink/session-revoke actions all proceed on an ordinary
session/admin check (`route-guards.ts`) with no step-up or recency requirement;
the repo itself documents the cookie-cache revocation lag (`admin-users.ts`).
High impact, moderated likelihood (read-only scopes, single admin).
**Routing:** L — define the sensitive-action inventory; add EVE reauthentication /
short-lived action-bound step-up; bypass cookie cache on sensitive validation;
negative tests. (Group with LGI-03.)

## LGI-03 — Same-origin mutation guard observes but does not enforce — **confirmed**

`requireSameOrigin` logs cross-origin/invalid provenance and accepts missing
provenance; it never returns 403 or throws (`same-origin.ts:34-61`), and tests
pin that observe-only contract. The shared mutation wrapper calls it and continues
into the handler (`mutation-route.ts`); account deletion and all current admin
mutations share this path. SameSite=Lax + HttpOnly/Secure cookies reduce ordinary
CSRF but do not make it enforcement. **Routing:** M — convert explicit mismatches
to 403 in the central wrapper after reviewing telemetry; add Fetch-Metadata /
content-type policy for missing provenance; negative tests. (Group with LGI-02.)

## LGI-04 — Public name resolution can amplify shared ESI consumption — **confirmed**

`/api/eve/names` is `authz: public`, accepts up to 200 IDs
(`api-contract.ts` `ENTITY_NAMES_MAX_IDS = 200`), and resolves each distinct
cache miss through its own upstream ESI POST with 8-way concurrency
(`entity-names.ts`); the handler applies no session or rate-limit guard. The
shared ESI budget floor prevents CCP-limit exhaustion but its closure also
degrades authenticated features — OWASP API4:2023. **Routing:** M — per-IP/per-user
limit + cache-miss-weighted cost budget, lower batch cap, reserved authenticated
capacity. Escalate if ESI-budget refusal telemetry rises.

## LGI-05 — One replayable service secret spans multiple capabilities — **confirmed**

A single static `CONVEX_SERVICE_SECRET` (constant-time compared, no
issuer/audience/method/body/expiry/nonce binding) authenticates four distinct
capabilities across both directions: linked-character enumeration and EVE
access-token vending (`internal/eve-*` routes) and Convex `/sweep` + `/purge-online`
(`convex/http.ts`, `convex/lib/bearerAuth.ts`). The token route's user↔character
ownership recheck blocks arbitrary mismatched pairs but does not contain a
compromised principal. Secret is not in the repo — this is blast-radius/containment.
**Routing:** M — split credentials by direction/capability; short-lived
audience-and-request-bound assertions with expiry + replay protection.

## LGI-06 — Failed OAuth revocation is not durably retried — **confirmed**

`revokeCharacterToken` decrypts the only stored refresh token and calls EVE
best-effort; the provider helper returns `{ ok: false }` on failure and the caller
ignores it, then local purge deletes the account row (and the encrypted token),
destroying any retry material (`eve-token-service.ts`, `account-purge.ts`,
`purge.ts`). No revocation outbox / retry worker / dead-letter exists. A refresh
token copied before deletion could stay valid upstream. Medium-low here (read-only
scopes). **Routing:** M — encrypted revocation outbox with bounded retries +
dead-letter + user-facing manual-revoke guidance; reuse the existing durable-job
pattern. Trigger before any EVE write scope or provider-complete-deletion claim.

## LGI-07 — CSP permits inline script execution — **confirmed**

`src/proxy.ts` sets `script-src 'self' 'unsafe-inline'` in all environments,
retained because Next App Router emits inline RSC flight scripts and the nonce was
deliberately removed to keep static rendering. Other CSP directives remain strong
(objects/frames/base/form-action). Real defense-in-depth gap, gated by an injection
sink. **Routing:** M — prototype nonce/hash or Trusted Types on high-value pages
and measure the Cache Components tradeoff; keep the raw-HTML lint ban. This is a
known, documented tradeoff (see memory [[static-rendering-infeasible]]), not new.

## LGI-08 — Runtime and migration DB privileges are coupled — **confirmed → ACTED ON**

Verified on a production child branch: the single runtime role (`neondb_owner`)
has `BYPASSRLS`, `CREATEROLE`, `CREATEDB`, `REPLICATION`, inherits
`neon_superuser`, owns all 56 public tables; no RLS, no `SECURITY DEFINER`. The
report's "may be coupled" is confirmed as fully coupled and near-superuser. **This
session acted on it:** migration `drizzle/0049_lgi_runtime_role.sql` (fail-closed
`NOLOGIN` `lgi_runtime` role + DML/sequence/SDE-TRUNCATE grants + per-creator
default ACLs), the `resolveMigrationUrl` seam (`DATABASE_MIGRATION_URL` with
empty-as-missing fallback), and the drilled cutover. Full risk model, drill
readouts, custody, and operator cutover/rollback:
[db-privilege-runbook.md](db-privilege-runbook.md). The report's `DATABASE_URL`-is-
`DATABASE_MIGRATION_URL` line was corrected: today both runtime paths and
migrations share `DATABASE_URL`; the split introduces the migration URL.

## LGI-09 — Route classification is inventory, not enforcement — **partially-confirmed**

`authz-markers.test.ts` proves each route has exactly one well-formed marker and
explicitly disclaims enforcement — so the blanket claim holds for direct handlers.
But it is **stale for two families**: mutations run through `runMutationRoute`,
which couples an authorization callback before business logic, and cron routes use
`defineCronRoute` (`cron-gate.ts`), a guard-owning constructor (shipped 3.9.2.2).
A correctly marked direct handler in the public/auth/admin/service families can
still omit its guard. **Routing:** M — extend constructor coverage to the
remaining families + a mechanical marker-to-guard test; do not rewrite
already-negative-tested routes gratuitously.

## LGI-10 — Critical audit events may be lossy / share the app trust domain — **confirmed**

Domain-event and usage-log writes are best-effort and swallow failure
(`domain-events/queries.ts`, `admin/role/route.ts`), and all ledgers live in the
same application Postgres trust domain; a runtime/DB compromise could alter
protected state and its audit trail together. (Corp-access decisions are an
awaited exception.) Forensics/detection risk, not a direct escalation path.
**Routing:** L — define critical-event schema, transactional outbox, independent
append-only sink + alerts. Trigger before expanding admin/token capabilities.

## LGI-11 — Bearer-token cache/log hygiene — **confirmed**

The internal token route returns an access token with no explicit
`Cache-Control: no-store, private` (`internal/eve-token/route.ts`); global headers
set security headers but no cache policy (`next.config.ts`). OAuth **exchange**
failure embeds the full upstream body in an exception (`eve-sso.ts:202-204`),
though **refresh** failure already parses only the classified error. Low —
endpoint is authenticated/dynamic/POST; the real residual is future
proxy/observability behavior. **Routing:** S — add no-store headers + tests,
bounded exchange-error classification, logging-redaction canary.

## LGI-12 — Supply-chain enforcement not evidenced in repo config — **partially-confirmed**

Better than the snapshot implied: the 3.9.3.5 daily update-watch runs
`pnpm audit` and reports dependency-major/advisory deltas (`.agent-local/
update_watch_collect.py`, report-only). But no repo-controlled Dependabot config,
CodeQL workflow, secret-scanner config, or immutable-SHA action pinning exists
under `.github/` (CI uses mutable `actions/checkout@v6`). GitHub-side settings are
not verifiable from source. **Routing:** M — after confirming live GitHub security
settings, add only the missing controls (CodeQL/SAST, Dependabot policy, secret
scanning + custom patterns, action pinning, triage SLAs); keep update-watch as the
broader ecosystem monitor.
