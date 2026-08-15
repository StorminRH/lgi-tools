---
date: 2026-08-14
source: retire-convex-workpool
---

#### Changed
- Location sync is scheduled directly by the engine. A thrown failure re-arms with a five-second hop instead of waiting for the thirty-second scan.

#### Removed
- The Convex Workpool component is no longer part of the live engine.
