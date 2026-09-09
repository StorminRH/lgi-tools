# LGI workflow

These adaptations govern this edition's upstream playbooks when they conflict.

- Use GitHub for code, PRs, reviews and checks. The `origin` git remote is still valid; the Origin product and CLI are not used. Linear owns tickets and durable handoffs. Do not create GitHub Issues for planning or handoffs.
- Feature PRs target `development` and open as drafts. Work on one agreed item and one PR at a time. The parent owns branch and PR operations. Use additional branches, stacks, cloud workers or an autonomous program only when the user explicitly chooses that scope. Installing poteto-mode does not authorize them.
- Present the design and implementation scope for approval before code for a new feature or migration. Continue already-approved work without repeated permission requests. A planning request ends with the plan.
- Before marking ready, merging, deploying, sending messages, or scheduling an automation, check authorization in the current conversation. Never infer permission from an upstream playbook's autonomy language. Staging/main merges still use the repository's close-out process and its 80 app-facing-file promote threshold.
- Poteto-mode is an explicit alternative to the lifecycle workflow. Do not start both for the same feature. Existing custom skills and reviewer pins remain available. Comments and thermos are invoked only by the user or an explicitly selected workflow.
- Use the actual diff to select verification from `CONTRIBUTING.md`, `docs/contributing/testing-principles.md`, and (for browser work) `docs/contributing/end-to-end-testing.md`. Documentation/configuration changes do not justify app tests or builds. Validate the changed configuration once. Never weaken tests to obtain a pass. Local production builds remain prohibited.
- Upstream multi-phase templates and check-plan's ten-live-lane rule are for an explicitly selected large program, not every feature or configuration change. Do not apply that template when its live/performance evidence is irrelevant; propose a small sequential plan with applicable evidence instead.
- Keep source changes in the repository plugin edition, not an installed cache. Preserve rubrics and examples when adapting. Propose out-of-scope skill/automation changes in Linear; do not silently expand this PR.
- Preserve dirty and untracked work. Create isolated worktrees when needed; never use the upstream reset/force-delete shortcuts. The bundled worktree audit is informational only: its safe bucket is not deletion authorization. Worktree/simulator cleanup is read-only in this adoption until its platform assumptions and safety logic receive a separate review.

For architecture and environment setup, use the repository's AGENTS.md and its task-scoped references.
