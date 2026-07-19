---
name: ux-check
description: >-
  Verify LGI.tools UI changes with the repository's scripted Playwright sweep.
  Determine the affected routes, reuse or start the local dev server, run
  `pnpm ux-check` for the affected routes at desktop and mobile sizes, inspect the JSON report
  and screenshots, run durable interaction definitions through the shared probe
  runner when needed, and present the
  evidence before Ryan's browser review. Use when asked to "run the UX check",
  "sweep/capture the UI", "check how it looks", or verify a user-facing change.
  This is complementary to—not a replacement for—Ryan's visual/feel review.
---

# Run the LGI.tools UX check

<!-- shared-policy-revision: 25 -->

Use this scripted workflow instead of Claude Desktop preview/auto-verification.
The command is diagnostic, not a pass/fail gate: inspect artifacts even when it
exits successfully.

Create a native Claude Code task list from the phases below and keep one task
active. Use `docs/DESIGN_PRINCIPLES.md` as the constitution when a UX failure is
really an ownership or interface-design problem.

## 1. Select affected routes

Use session context plus committed and uncommitted diffs. Map direct pages to
routes; for shared feature/UI changes, use Graphify to find every rendered
consumer. Replace dynamic segments with real local IDs. Capture authenticated
routes too, but report that the logged-out sweep proves only their gated shell.

## 2. Reuse or start the local server

Probe `http://localhost:3000` and reuse an answering server. If none answers,
start `pnpm exec next dev -H 127.0.0.1` as a background Bash job. Always browse
`http://localhost:3000`, never the loopback IP, or Turbopack may leave the page
unhydrated. Install Chromium only if Playwright reports it missing.

## 3. Capture

Run `pnpm ux-check <concrete routes...>`. Desktop and mobile run by default and
mobile captures the open hamburger. Review the generated artifacts before
another sweep or probe because `docs/ux-check/captures/` is auto-wiped.

## 4. Exercise open states

For dialogs, popovers, menus, toasts, mock-backed states, or other interactions,
use the shared runner first:

```bash
node docs/ux-check/run-probes.mjs --list
node docs/ux-check/run-probes.mjs nav-menu overlay-open
node docs/ux-check/run-probes.mjs
```

It runs the tracked probe definitions in `docs/ux-check/probes/` at desktop and
mobile sizes with isolated browser contexts and standard CSP, console, page,
request, and HTTP diagnostics. Review
`docs/ux-check/captures/probes/report.json` and its screenshots. A failed check,
probe crash, `style-src` violation, unfiltered console error, or uncaught page
error makes the runner exit nonzero; network findings remain report-only by
default.

For recurring coverage, add or update a **probe definition** in
`docs/ux-check/probes/` instead of another standalone launcher. Follow
`docs/ux-check/README.md` for the module contract and helpers. A temporary
`*-probe.mjs` scratch script is allowed during diagnosis, but the drift gate
warns about it and you must delete it at close-out. Preserve sweep evidence when
needed: the sweep refreshes the capture root, while the runner refreshes only its
`captures/probes/` subtree.

## 5. Inspect and report

Read the sweep and probe-runner reports and report failed checks, load failures,
console/page errors, failed requests, and HTTP 4xx/5xx results per route or
definition and viewport. Inspect representative PNGs to flag obvious overlap,
clipping, empty regions, typography, or missing content. Do not substitute this
for Ryan's judgment.

Present route-by-route evidence, screenshot paths, and the authenticated-state
limitation. For user-facing work, stop for Ryan's browser approval before
`close-out` opens a PR:

`ux-check -> Ryan review -> close-out`
