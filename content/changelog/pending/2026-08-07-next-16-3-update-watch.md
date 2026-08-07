---
date: 2026-08-07
source: update-watch/2026-08-07-next-16-3
---

#### Changed
- Upgraded the site framework to Next.js 16.3.
- Raised patched floors for development-tooling libraries flagged by security advisories (brace-expansion, fast-uri, js-yaml), clearing every open advisory.
- Consolidated recently added map and settings test suites into fewer, longer workflow tests.

#### Removed
- Retired wormhole vocabulary constant self-checks; mass-threshold and destination-hint behavior remains covered by behavioral tests.
