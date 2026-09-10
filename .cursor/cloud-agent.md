# Cloud Agent

VM-specific notes for Cursor Cloud. The service definitions and startup
commands live in [environment.json](environment.json).

- Use the existing `postgres`, `next-dev`, and `convex-dev` terminals.
  This VM has no Docker or systemd. Services stay in foreground terminals;
  background processes started during boot may not survive.
- Browse the app at `http://localhost:3000`. PostgreSQL is on
  `localhost:5433`; anonymous Convex is on `http://127.0.0.1:3210`.
  These addresses help distinguish a missing service from an app failure.
- The snapshot includes the migrated database and EVE SDE data. Check
  service readiness and whether the branch adds migrations before repeating
  setup. Installation details are in [install.sh](install.sh).
- Authenticated Atlas work also needs the `configure-convex-auth` terminal
  to finish. Its readiness file is `/tmp/lgi-convex-auth.status`: `0` means
  setup succeeded. If it is missing or reports failure, inspect that
  terminal's output. A running Next or Convex server alone does not prove
  authentication is ready.

For startup or local-service selection failures, inspect
[dev.sh](dev.sh), [convex.sh](convex.sh), and their shared checks in
[lib.sh](lib.sh). These wrappers select the VM's local services; preserve
that setup when investigating failures.
