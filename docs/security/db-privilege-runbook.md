# Database privilege runbook (LGI-08)

**Status:** privilege policy authored and drilled; production credential cutover
**not yet performed** (operator-gated). Last drilled 2026-07-19 (session 3.9.4.1)
on a disposable production child branch.

This runbook owns the database's runtime-privilege posture: the risk model, the
least-privilege runtime role, how the drill was run, credential custody, and the
exact operator cutover/rollback. It is the durable home the security disposition
register points to for LGI-08.

## 1. What was measured, and where

All diagnosis and the full drill ran on a **disposable Neon child branch**
(`diag-3941`, a copy of the protected production `main` branch), never against
production SQL. A child branch copies the parent's roles, ownerships, grants, and
data, so its privilege posture faithfully mirrors production. The branch was
created with point-of-action operator approval and **explicitly deleted** at the
end (no TTL reliance); all local credential files were shredded.

## 2. Actor / credential / capability matrix

| Actor path | Credential today | Privileges it needs |
| --- | --- | --- |
| Request path (neon-http, pooled) | `DATABASE_URL` | SELECT/INSERT/UPDATE/DELETE on app tables + sequence usage |
| Cron/direct (advisory locks, unpooled) | `DATABASE_URL_UNPOOLED` | DML + session advisory locks + **TRUNCATE on the enumerated regenerable SDE tables only** |
| Migrations (build-time, inside `pnpm vercel-build`) | `DATABASE_URL` today → `DATABASE_MIGRATION_URL` after cutover | DDL (schema owner) |
| Build bootstraps (`ingest-sde-if-empty`, `backfill-users-if-empty`) | `DATABASE_URL_UNPOOLED` | DML + SDE TRUNCATE + session advisory locks |
| Operator maintenance | operator credential | full |

### Measured production posture (before the split)

The single runtime identity is Neon's **`neondb_owner`**. On the faithful child
branch it carries: `rolsuper=f` **but** `rolcreaterole=t`, `rolcreatedb=t`,
**`rolbypassrls=t`**, `rolreplication=t`, and inherited membership in
**`neon_superuser`**. It owns all 56 `public` tables and the drizzle migrations
table. There is **no RLS anywhere** (0 policies) and **no `SECURITY DEFINER`
function** in app schemas. So today, a leak of the request-path DB credential
yields a near-superuser: full cross-tenant read/write, DDL, `TRUNCATE` of any
table, role creation, and RLS bypass.

## 3. Verified-absent client-to-database path (standing invariant)

The Supabase-style "browser queries the database directly" attack path is
**verified absent** and must stay that way:

- No Neon **Data API** / PostgREST endpoint is enabled — the child branch exposed
  only a standard read_write compute endpoint; the repo contains no Data API
  usage; `neon.ts` declares no Data API service.
- All database access is server-side, behind Better Auth + Zod validation +
  Drizzle parameterization. The browser never holds a DB credential.

**Runbook invariant:** never enable the Neon Data API without first making a
row-level-security (RLS) decision. Doing so would expose tables to client-issued
queries with application authorization no longer in the path.

## 4. Honest threat claim — what the split does and does not buy

Migrations run **inside the Vercel production build** (`pnpm vercel-build`), so a
`DATABASE_MIGRATION_URL` project env var remains readable by deployed functions.
The split therefore **does not** protect against full application-runtime
compromise: an attacker who can read `process.env` in the deployed runtime gets
the owner URL too.

What the split **does** buy: the high-exposure runtime DB credential — used
per-request over HTTP on two paths — becomes least-privilege. That contains
credential-leak scenarios, accidental or app-logic DDL, and SQL-injection
escalation through the request path: none of those can any longer drop/alter
schema, truncate auth/user tables, create roles, or bypass RLS.

Stronger future option (recorded, not this session): isolate the owner
credential from the deployed runtime entirely by running migrations in a
separately authenticated job **outside** `vercel-build`. That must be reconciled
against the policy that only Vercel runs the production build.

## 5. Least-privilege role model (shipped as migration `0049`)

**Hybrid: migration-owned privilege role + operator-owned login credential.**

- Migration `drizzle/0049_lgi_runtime_role.sql` creates a **`NOLOGIN` privilege
  role `lgi_runtime`** and owns its grants: `USAGE` on schema `public`;
  `SELECT/INSERT/UPDATE/DELETE` on all `public` tables; `USAGE, SELECT` on all
  sequences; table-scoped **`TRUNCATE` on exactly the 14 regenerable SDE tables**
  the daily refresh rebuilds; and `ALTER DEFAULT PRIVILEGES` (separate future-
  table and future-sequence clauses) so a later migration cannot ship a table
  the runtime cannot read. The `DO` block is idempotent but **fail-closed**: if
  `lgi_runtime` already exists with `LOGIN`, `CREATEROLE`, `CREATEDB`,
  `BYPASSRLS`, `REPLICATION`, superuser, or membership in a privileged role, it
  **aborts** rather than trusting it.
- The **LOGIN credential is created by the operator via SQL only** (see §7), as a
  member of `lgi_runtime` with explicit safe attributes. **Never** via
  `neon roles create` / Console / API: those auto-grant `neon_superuser`
  (broad read/write + `CREATEROLE` + `BYPASSRLS`), which membership in
  `lgi_runtime` would not remove — silently defeating the split. The drill
  confirmed a SQL-created `CREATE ROLE` receives **no** `neon_superuser`
  membership.

The 14 SDE `TRUNCATE` tables (both `TRUNCATE … CASCADE` groups are FK-closed
within this list, so no other table is reachable by cascade):
`blueprint_flat_materials, blueprint_trees, industry_blueprints, type_dogma,
dgm_attribute_types, eve_types, eve_groups, eve_categories, eve_system_jumps,
eve_npc_stations, eve_station_operations, eve_solar_systems, eve_constellations,
eve_regions`.

## 6. Drill readouts (owner control vs runtime subject, 2026-07-19)

Migration `0049` was applied through the **real drizzle migrator** exercising the
new `resolveMigrationUrl` seam (`DATABASE_MIGRATION_URL` set to the child branch).
Resulting `lgi_runtime`: `NOLOGIN`, all-safe attributes, **zero** privileged
memberships, 56 SELECT grants, 14 TRUNCATE grants. The operator LOGIN role
(`lgi_runtime_login`) authenticated on both pooled and unpooled endpoints and
inherited only `lgi_runtime`.

**Positive (as the runtime role — all passed):** request-path reads (sites=69,
industry_blueprints=5082), auth reads, auth INSERT/UPDATE/DELETE, sequence
`nextval`, `pg_advisory_lock`/`pg_advisory_unlock` on the unpooled endpoint, both
SDE `TRUNCATE … CASCADE` groups, the `characters` bootstrap insert, and — proving
the default ACLs fire — INSERT+SELECT on a table the owner created **after** the
migration with no explicit grant.

**Negative (as the runtime role — all correctly denied):** `CREATE TABLE`
(permission denied for schema), `DROP`/`ALTER TABLE` (must be owner), `TRUNCATE`
on `account` and `user` (permission denied), `CREATE ROLE`, `SET ROLE
neondb_owner`, `ENABLE ROW LEVEL SECURITY` (must be owner), `CREATE SCHEMA`.
`GRANT`/`REVOKE` issued by the runtime role were **no-ops** (PostgreSQL
`WARNING: no privileges …`); `lgi_runtime` retained its DML on `sites` and the
runtime could still read — so no self-escalation is possible.

**Timing:** representative reads — owner 45.9 ms, runtime 24.8 ms — equivalent;
the least-privilege role imposes no measurable penalty.

**TEMP tables — tested, decided:** `CREATE TEMP TABLE` **succeeds** as the runtime
role, because PostgreSQL grants database `TEMPORARY` to `PUBLIC` by default.
**Decision: accepted and recorded.** Temp tables are session-local, dropped at
disconnect, carry no cross-tenant surface, and the application creates none.
Optional hardening if ever wanted:
`REVOKE TEMPORARY ON DATABASE neondb FROM PUBLIC;`

## 7. Credential custody, cutover, and rollback (operator, point-of-action)

Production credential cutover is **not** a session done-condition. It is a
deliberate operator action taken at a chosen moment. The grants migration ships
inert at merge (a `NOLOGIN` role + grants; no existing credential changes).

**Cutover sequence (operator):**

1. Confirm migration `0049` has run on production (it runs inside the normal
   production build at merge).
2. As the schema owner, create the runtime login role via **SQL only** (never
   `neon roles create`), sourcing the password so it never enters git, the
   transcript, or shell history:
   ```sql
   CREATE ROLE lgi_runtime_login LOGIN PASSWORD :'pw'
     NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION
     IN ROLE lgi_runtime;
   ```
   (Optional hardening: `REVOKE TEMPORARY ON DATABASE neondb FROM PUBLIC;`)
3. In Vercel, repoint **`DATABASE_URL`** and **`DATABASE_URL_UNPOOLED`** to the
   `lgi_runtime_login` connection strings (pooled and unpooled respectively), and
   set **`DATABASE_MIGRATION_URL`** to the existing owner connection string.
4. Redeploy. The post-cutover close-out browser smoke doubles as verification.

**Rollback:** repoint `DATABASE_URL` / `DATABASE_URL_UNPOOLED` back to the owner
connection strings and remove `DATABASE_MIGRATION_URL`; `resolveMigrationUrl`
then falls back to `DATABASE_URL` exactly as before the split. Optionally drop
`lgi_runtime_login`.

**Custody & rotation:** the login password lives only in Vercel env; rotate by
`ALTER ROLE lgi_runtime_login PASSWORD :'newpw'` and repointing the two env vars.
The `lgi_runtime` privilege role has no password and never logs in.

## 8. RLS: deferred, with an honest rationale

RLS is **not** deployed this session — not because the neon-http driver is
incapable (its `batch()` runs real non-interactive transactions that could carry
`set_config`-style per-request identity), but because identity propagation —
wrapping every protected query with verified per-request identity — is an
app-wide design campaign touching every query call site. That campaign (with the
report's §G/H as seed and batch-transactions recorded as a viable mechanism) is
routed to the backlog, alongside the explicit decision of whether RLS is
defense-in-depth or a formal tenant boundary. Until then, **application
authorization (Better Auth + Drizzle predicates) remains the sole tenant
boundary**, and the Data API stays disabled (§3).
