---
date: 2026-08-08
source: stormin/daily-test-cleanup-e214 with stormin/cloud-dev-environment-8dcf folded in
---

#### Added
- A repo-managed Cursor Cloud agent development environment that provisions a local PostgreSQL 16 cluster, dev-only secrets, migrations, and EVE static data without Docker.

#### Changed
- Consolidated the Atlas fog, halo, pilot presence, and sync micro-test suites into fewer longer behavioral workflow tests.

#### Fixed
- The bundled historical wormhole site seed now applies cleanly on a fresh database instead of failing inside its guard block.
