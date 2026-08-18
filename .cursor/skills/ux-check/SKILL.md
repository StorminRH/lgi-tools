---
name: ux-check
description: Exercise changed user-facing routes with log-driven Playwright (assertions, console/network diagnostics, failure-only artifacts) and pause for operator visual review. Use as the Ordered-work / pre-close-out UI gate for UI or interaction changes; close-out consumes the recorded disposition and does not re-run this sweep.
---

# Run the UX check

Exercise changed user-facing routes with **log-driven Playwright** (assertions,
console, page errors, network). Write screenshots/traces under
`docs/ux-check/captures/` on failure only. The operator reviews visual feel in
their browser — never always-on screenshots or agent visual approval.

Local aid only: not a `pnpm verify` or CI gate. Sweeps/probes exit non-zero on
hard assertion/console/page failures; network findings still need disposition.

Inputs: (1) complete change diff and affected user-facing routes; (2) running
local stack that renders them truthfully; (3) durable open-state probe
definitions for changed interactions; (4) for auth probes — seeded storage
state (`pnpm e2e:seed` → `docs/ux-check/captures/auth-storage.json`),
`UX_STORAGE_STATE` / `--storage-state`, or operator cookie jar (`UX_COOKIE_JAR`
/ `--cookie-jar`). `pnpm test:e2e` uses Playwright `storageState` only (local
seed by default, or `E2E_STORAGE_STATE` / `UX_STORAGE_STATE` with
`E2E_SKIP_SEED=1`).

Output: `UX_EVIDENCE` naming probed routes/viewports, diagnostics, failure
artifact paths, an **operator visual checklist**, and review status. `BLOCKED`
when the stack cannot represent required behavior or a diagnostic stays
unexplained. Clean sweep → `READY_FOR_REVIEW` with review `Pending`, then
pause. Do not open a PR from this skill. Close-out consumes the disposition.

Agents must not visually approve the UI (local or production). Use Playwright
logs and any failure screenshots/traces under `docs/ux-check/captures/` only to
diagnose red checks, then give the operator an explicit visual checklist.

## 1. Resolve the capture surface

Probe only routes the change affects:

```bash
git diff --name-only $(git merge-base HEAD origin/main)..HEAD
git diff --name-only
```

Map route files directly. For shared feature/UI code, find consumers. Replace
dynamic segments with real local identifiers from the owning list page or
database — never example ids as fixtures.

Anonymous sweeps verify signed-out gates. Signed-in: `pnpm e2e:seed`, then
`--storage-state=docs/ux-check/captures/auth-storage.json`.

## 2. Establish the local server

```bash
curl -sf -o /dev/null http://localhost:3000 && echo UP || echo DOWN
```

Reuse an answering server when it represents the current worktree. Otherwise
start what the routes need (`pnpm dev` locally; Cloud Agent caveats live in
the repo's agent guide). Browse `http://localhost:3000`, never `127.0.0.1`.

Browser binaries live in the host Playwright cache (macOS:
`$HOME/Library/Caches/ms-playwright`). If `PLAYWRIGHT_BROWSERS_PATH` points
under `cursor-sandbox-cache/`, redirect it to that host cache or unset it
before launch — do not re-download into the sandbox path. Only when the host
cache lacks the required revision: `pnpm exec playwright install chromium`.

## 3. Run the log-driven route sweep

```bash
pnpm ux-check /changed-route /other-changed-route
pnpm ux-check /changed-route --storage-state=docs/ux-check/captures/auth-storage.json
```

Defaults: desktop 1440×900, mobile 390×844. Optional: `--viewport=desktop`,
`--base-url=…`, `--settle=2000`, `--cookie-jar=…`, `--storage-state=…`. Set
`VERCEL_AUTOMATION_BYPASS_SECRET` for protected Vercel preview/production URLs.
Evidence: gitignored `docs/ux-check/captures/report.json`. Failure PNGs:
`*--failure.png` in the same directory.

## 4. Run required open-state probes

```bash
node docs/ux-check/run-probes.mjs --list
node docs/ux-check/run-probes.mjs nav-menu overlay-open
pnpm e2e:seed
node docs/ux-check/run-probes.mjs --storage-state=docs/ux-check/captures/auth-storage.json <auth-probe-id>
```

Isolated desktop/mobile contexts; writes
`docs/ux-check/captures/probes/report.json`. Fails on assertion failure, probe
crash, `style-src` violation, unfiltered console error, or uncaught page error.
Add recurring interactions under `docs/ux-check/probes/` per
`docs/ux-check/README.md`. No standalone Playwright launchers. Delete temporary
`*-probe.mjs` scripts before close-out.

## 5. Optional authenticated smoke

When account-adjacent shells matter and Vitest cannot falsify them:
`pnpm test:e2e`. Keep the suite tiny. See the repo's end-to-end testing notes.

## 6. Report and pause for operator visual review

1. Read `docs/ux-check/captures/report.json` and, when run,
   `docs/ux-check/captures/probes/report.json` (and e2e report).
2. Report every console/page error, failed request, and 4xx/5xx by route or
   probe and viewport.
3. Do not open the site to approve layout. Build an operator checklist of
   routes/interactions to open locally.
4. Return `UX_EVIDENCE`, pause for operator browser review. Do not open a PR.

Planned lifecycle with `UX gate: Yes`: dedicated Ordered work step under
`start-session` — finish the operator pause before awaiting close-out.
Ordinary work: run standalone, finish the pause, then `close-out`.

## Remote / production log probes

Do not visually inspect production. For deployment proof:

| Need | Mechanism |
| --- | --- |
| Vercel Deployment Protection | `VERCEL_AUTOMATION_BYPASS_SECRET` via origin-scoped Playwright route (`installOriginScopedBypass`) — never context-wide `extraHTTPHeaders` |
| App session on remote | Operator Netscape `--cookie-jar` or Playwright `--storage-state` |

```bash
VERCEL_AUTOMATION_BYPASS_SECRET=… pnpm verify:site-routes -- <production-or-preview-url> --cookie-jar <operator-cookie-jar>
```

## Return

Render this form in chat. Do not wrap the result in a code fence or prepend a
second summary. Remaining detail stays in the report JSON files.

## UX check: `READY_FOR_REVIEW` | `BLOCKED`

- **Subject:** <concrete probed routes and viewports>; report `<report path>`
- **Result:** <diagnostics/probe summary, naming any authenticated-state limitation and failure artifacts; ≤2 sentences>
- **Operator checklist:** <routes/interactions for the operator to open visually>
- **Disposition:** `Pending` after a clean sweep; `Approved` or `Changes requested` only after the operator visual pause
- **Action:** <Pause for operator review (`Pending`), return to implementation, hand off to the next Ordered work step, or continue to close-out>
- **Blocker:** <exact blocker or `None`>
