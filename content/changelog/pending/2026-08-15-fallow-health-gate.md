---
date: 2026-08-15
source: fallow-fail-closed-row-3
---

#### Changed
- Fallow now fails the verify gate when a function exceeds the default complexity or CRAP thresholds. The section header primitive and the helpers that CI cannot cover through Postgres tests now have node-env coverage so that check stays green.
