# UX-check procedure

Verify changed user-facing surfaces against the local development server. The
agent owns route selection, automated diagnostics, capture inspection, and the
evidence report. The operator owns the final browser judgment. A clean sweep
does not replace that review.

This procedure is a local development aid, not a `pnpm verify` or CI gate. The
route sweep exits successfully after writing its report even when the report
contains findings; the agent must read and disposition them. Use
`docs/workflows/pre-pr-design-review.md` when a UX finding exposes ownership or
interface decay rather than a local presentation defect.

## Execution contract

Required inputs:

1. The complete change diff and the user-facing routes it can affect.
2. A running local stack capable of rendering those routes truthfully.
3. Any durable open-state probe definitions required by changed interactions.

Required output: `UX_EVIDENCE` naming the captured routes and viewports, route
and probe diagnostics, inspected capture paths, authenticated-state limitations,
and the operator-review status.

Stop with `BLOCKED` when the local stack cannot represent required behavior or a
diagnostic remains unexplained. A completed clean sweep returns
`READY_FOR_REVIEW` with the operator review marked `Pending`, then pauses for
that review. Do not open a PR from this workflow.

## 1. Resolve the capture surface

Capture only routes affected by the change. Start from both committed and
uncommitted changes:

```bash
git diff --name-only $(git merge-base HEAD origin/main)..HEAD
git diff --name-only
```

Map route files directly. For shared feature or UI code, use `codegraph explore`
or `codegraph impact` to find every rendered consumer. Replace each dynamic
segment with a real locally available identifier obtained from the owning list
page or database; never treat an example identifier as a fixture.

The sweep is logged out. Capture authenticated routes to verify their signed-out
gate, then record that populated account state requires the operator's logged-in
review.

## 2. Establish the local server

Probe before starting another process:

```bash
curl -sf -o /dev/null http://localhost:3000 && echo UP || echo DOWN
```

- Reuse an answering server when it represents the current worktree.
- Otherwise start the stack required by the selected routes. `pnpm dev` starts
  Next.js and expects configured local Docker Postgres; use `pnpm dev:all` when
  the route also needs the repository-managed Postgres and Convex services.
- Launching Next on `127.0.0.1` is allowed, but browse
  `http://localhost:3000`. Do not pass a `127.0.0.1` base URL: Next development
  origin checks can prevent client hydration while leaving a misleading server
  shell.

Ensure Chromium is available before the first run:

```bash
pnpm exec playwright install chromium
```

## 3. Run closed-state route captures

Pass concrete paths only:

```bash
pnpm ux-check /sites /sites/100 /industry
```

The default run covers desktop 1440×900 and mobile 390×844; mobile also opens
the navigation menu. Use `--viewport=desktop`, `--base-url=...`, or
`--settle=2000` only when the evidence requires them. The run refreshes the
gitignored `docs/ux-check/captures/` directory.

## 4. Run required open-state probes

The route sweep captures the closed shell. Use the shared probe runner for
dialogs, popovers, menus, toasts, mock-backed states, or other durable
interactions:

```bash
node docs/ux-check/run-probes.mjs --list
node docs/ux-check/run-probes.mjs nav-menu overlay-open
node docs/ux-check/run-probes.mjs
```

The runner uses isolated desktop and mobile contexts and writes screenshots plus
`docs/ux-check/captures/probes/report.json`. It fails for a failed assertion,
probe crash, `style-src` violation, unfiltered console error, or uncaught page
error; reported network failures still require agent disposition.

Add recurring interactions as definitions under `docs/ux-check/probes/` using
`docs/ux-check/README.md`. Do not add another standalone Playwright launcher.
Delete any temporary `*-probe.mjs` diagnosis script before close-out. The route
sweep refreshes all captures; the probe runner refreshes only `captures/probes/`.

## 5. Inspect and report

1. Read `docs/ux-check/captures/report.json` and, when probes ran,
   `docs/ux-check/captures/probes/report.json`.
2. Report every console or page error, failed request, and 4xx/5xx response by
   route or probe and viewport. Include the first diagnostic message and its
   disposition.
3. Inspect representative desktop, mobile, and open-state screenshots for
   overlap, empty regions, broken layout, and missing content. Do not present
   agent inspection as the final visual judgment.
4. Return `UX_EVIDENCE`, point to the capture directory, and pause for the
   operator's browser review before PR creation.

The required sequence is `ux-check` evidence → operator review → `close-out`.

## Return the result

Use `docs/workflows/schema/chat-result.md` for this field set:

```markdown
## UX check: `READY_FOR_REVIEW` | `BLOCKED`

- **Routes:** <concrete captured routes>
- **Viewports:** <desktop, mobile, or both>
- **Captures:** `<capture directory>`

### Automated evidence

- **Route diagnostics:** <errors and dispositions or None>
- **Interaction probes:** <definitions and results or Not applicable>
- **Capture inspection:** <agent visual findings or None>
- **Authenticated-state limits:** <limitations or None>

### Next state

- **Operator review:** Pending | Approved | Changes requested
- **Handoff:** <Pause for review, return to implementation, or continue to close-out>
- **Blocker:** <exact blocker or None>
```
