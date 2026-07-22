---
date: 2026-07-22
source: out-of-band development-lifecycle decoupling migration
---

#### Changed
- Development work is now two independent tracks: ordinary changes ship directly from a request without consulting the lifecycle resolver, while planned version work runs only through start-session on a deterministic per-sub-version branch.
- Ordinary out-of-band changes now record a hidden pending changelog note that a later planned release folds into its public version entry, so routine fixes stay out of version accounting until they are published.

#### Removed
- The rider one-off branch workflow was retired; no branch name carries any special lifecycle meaning, and the resolver only answers what the next planned action is rather than gating ordinary work.
