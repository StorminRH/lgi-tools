---
date: 2026-08-03
source: workflow consolidation — one Diff-mode implementation review gate
---

#### Changed
- Merged the end-of-session design review and the adversarial implementation review into one Diff-mode review gate, retiring the separate pre-PR design-review procedure so close-out launches its reviewers once.
- Retargeted repository mapping to Codegraph CLI relationship commands only (callers, callees, impact, query), demoting Codegraph MCP explore so ordinary discovery stays on Explore, semantic search, and grep.
- Separated UX-check into its own lifecycle Ordered-work step when a session's UX gate is Yes, so close-out consumes the recorded operator review instead of re-running the sweep or pause.
- Absorbed open update-watch service and EVE announcements into the acknowledged baseline and advanced cleared discovery windows, while leaving development-tooling advisories deferred inside the seven-day install quarantine and leaving the google-auth-library major-11 bump for an explicit operator decision.
