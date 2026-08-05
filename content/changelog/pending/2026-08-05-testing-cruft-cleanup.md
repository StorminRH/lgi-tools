---
date: 2026-08-05
source: stormin/testing-cruft-cleanup
---

#### Changed
- Adopted a high-signal Vitest bar that prefers fewer, longer workflow tests and recorded it as the shared cleanup standard for authors and automation.

#### Removed
- Trimmed low-signal and duplicate test coverage that did not uniquely falsify user-visible or security-salient behavior, plus orphaned production helpers that only those tests used.
