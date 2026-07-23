---
date: 2026-07-23
source: chore/codegraph-orient-once-hook
---

#### Changed
- The internal codegraph orientation reminder now fires once per session instead of repeating on every source-file read.
- The merge gate no longer counts a resolved code-review comment that has gone outdated, so a fixed finding stops blocking an otherwise-clean merge.
- The automated code-review loop now waits for every review bot and check to finish before batching fixes into a single push, so a new fix no longer cancels a review already in progress.
