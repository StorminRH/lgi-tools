-- 3.9.4.1 / LGI-08 — least-privilege runtime database role.
--
-- Creates a NOLOGIN privilege role `lgi_runtime` and grants it exactly what the
-- deployed request and cron paths need: DML on application tables, sequence
-- usage, and table-scoped TRUNCATE on the regenerable SDE tables the daily
-- refresh cron rebuilds (src/data/eve-data/ingest.ts + universe.ts). It does
-- NOT grant DDL, role management, RLS bypass, or TRUNCATE on any auth/user/
-- market/plan table.
--
-- The LOGIN credential that assumes this role is created out-of-band by the
-- operator, via SQL only (`CREATE ROLE ... LOGIN ... IN ROLE lgi_runtime`) —
-- never `neon roles create`/Console/API, which auto-grant `neon_superuser` and
-- would silently defeat the split. Custody, rotation, and the operator-gated
-- production cutover live in docs/security/db-privilege-runbook.md.
--
-- This migration is additive and INERT until an operator repoints DATABASE_URL
-- at a login member of lgi_runtime; shipping it changes no existing credential,
-- which is why it can ride the normal production build. It runs under the
-- schema-owner (migration) role.
--
-- Idempotent but FAIL-CLOSED: if lgi_runtime already exists with any unsafe
-- attribute or privileged-role membership, it aborts rather than trusting it.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lgi_runtime') THEN
		IF EXISTS (
			SELECT 1 FROM pg_roles
			WHERE rolname = 'lgi_runtime'
				AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication OR rolcanlogin)
		) THEN
			RAISE EXCEPTION 'lgi_runtime already exists with unsafe attributes; refusing to reconcile grants';
		END IF;
		IF EXISTS (
			SELECT 1
			FROM pg_auth_members m
			JOIN pg_roles parent ON parent.oid = m.roleid
			JOIN pg_roles child ON child.oid = m.member
			WHERE child.rolname = 'lgi_runtime'
				AND parent.rolname IN ('neon_superuser', 'cloud_admin', 'rds_superuser', 'neon_service')
		) THEN
			RAISE EXCEPTION 'lgi_runtime is a member of a privileged role; refusing to reconcile grants';
		END IF;
	ELSE
		CREATE ROLE lgi_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
	END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO lgi_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lgi_runtime;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lgi_runtime;
--> statement-breakpoint
-- Table-scoped TRUNCATE: ONLY the regenerable SDE tables. Both TRUNCATE ...
-- CASCADE groups in the refresh cron are FK-closed within this exact list
-- (verified on a production child branch, 3.9.4.1), so no other table is
-- reachable by cascade.
GRANT TRUNCATE ON
	public.blueprint_flat_materials,
	public.blueprint_trees,
	public.industry_blueprints,
	public.type_dogma,
	public.dgm_attribute_types,
	public.eve_types,
	public.eve_groups,
	public.eve_categories,
	public.eve_system_jumps,
	public.eve_npc_stations,
	public.eve_station_operations,
	public.eve_solar_systems,
	public.eve_constellations,
	public.eve_regions
TO lgi_runtime;
--> statement-breakpoint
-- Future tables/sequences created by THIS migration role auto-grant DML/usage to
-- lgi_runtime, so a later migration cannot silently ship a table the runtime
-- cannot read. Default ACLs apply only to objects created by the exact role
-- that runs this statement (the schema owner), which is why migrations must keep
-- running under the owner credential.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lgi_runtime;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO lgi_runtime;
