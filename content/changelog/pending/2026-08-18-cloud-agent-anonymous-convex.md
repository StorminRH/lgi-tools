---
date: 2026-08-18
source: stormin/cloud-skills-agents-2add
---

#### Added
- Cloud Agent VMs now start an anonymous local Convex backend, install Codegraph, and keep project copies of Cursor skills and agent seats.
- Project skills now include the official Thermos review set (thermos, thermo-nuclear-review, thermo-nuclear-code-quality-review) and Team Kit deslop.

#### Changed
- Atlas fixture probes run Convex against the selected local or anonymous deployment and refuse a hosted URL.
- Cloud Agent seat sync removes retired project skills and agents, and Convex auth setup keeps the service secret off the process argument list.

#### Fixed
- Atlas fixture probes now read the Convex deployment from the local env file when the shell did not export it, and Convex auth setup uses the effective service secret.
