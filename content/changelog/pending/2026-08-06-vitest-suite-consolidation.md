---
date: 2026-08-06
source: stormin/daily-test-cleanup-97f7
---

#### Changed
- Consolidated fragmented micro-tests across eleven Vitest suites into fewer, longer workflow tests under the shared high-signal cleanup bar.
- Gave the mapper boundary probe an explicit generous time budget so slower CI runners no longer fail it against the strict repo-wide default.
