# UX-check procedure

Exercise changed user-facing surfaces against the local development server with
**log-driven Playwright** (assertions, console, page errors, network). On
failure only, write screenshots/traces under `docs/ux-check/captures/`. The
operator reviews visual feel in their own browser; agents never use always-on
screenshots or browse the site for visual approval.

This procedure is a local development aid, not a `pnpm verify` or CI gate. Route
sweep and probes exit non-zero on hard assertion/console/page failures; network
findings still require disposition. Use Diff-mode
`docs/workflows/adversarial-review.md` when a UX finding exposes ownership or
interface decay rather than a local presentation defect.

## Execution contract

Required inputs:

1. The complete change diff and the user-facing routes it can affect.
2. A running local stack capable of rendering those routes truthfully.
3. Any durable open-state probe definitions required by changed interactions.
4. For authenticated probes or `pnpm test:e2e`: seeded storage state
   (`pnpm e2e:seed` → `docs/ux-check/captures/auth-storage.json`) or an
   operator cookie jar.

Required output: `UX_EVIDENCE` naming the probed routes and viewports, route and
probe diagnostics, any failure artifact paths, an **operator visual checklist**,
and the operator-review status.

Stop with `BLOCKED` when the local stack cannot represent required behavior or a
diagnostic remains unexplained. A completed clean sweep returns
`READY_FOR_REVIEW` with the operator review marked `Pending`, then pauses for
that review. Do not open a PR from this workflow.

## 1. Resolve the capture surface

Probe only routes affected by the change. Start from both committed and
uncommitted changes:

```bash
git diff --name-only $(git merge-base HEAD origin/main)..HEAD
git diff --name-only
```

Map route files directly. For shared feature or UI code, search the repository
for route and component consumers. Use `repo-mapper` (Codegraph CLI: `callers`,
`callees`, `impact`, `query`) only for material relationship, consumer,
dependency, or blast-radius claims. Replace each dynamic segment with a real
locally available identifier obtained from the owning list page or database;
never treat an example identifier as a fixture.

Anonymous sweeps verify signed-out gates. For signed-in shells, seed auth first
(`pnpm e2e:seed`) and pass `--storage-state=docs/ux-check/captures/auth-storage.json`.

## 2. Establish the local server

Probe before starting another process:

```bash
curl -sf -o /dev/null http://localhost:3000 && echo UP || echo DOWN
```

- Reuse an answering server when it represents the current worktree.
- Otherwise start the stack required by the selected routes. `pnpm dev` starts
  Next.js and expects configured local Docker Postgres; use `pnpm dev:all` when
  the route also needs the repository-managed Postgres and Convex services.
- Browse `http://localhost:3000`, never `127.0.0.1`, for Next origin checks.

Ensure Chromium is available before the first run:

```bash
pnpm exec playwright install chromium
```

## 3. Run the log-driven route sweep

Pass concrete paths only:

```bash
pnpm ux-check /sites /industry
pnpm ux-check /industry --storage-state=docs/ux-check/captures/auth-storage.json
```

Defaults: desktop 1440×900 and mobile 390×844. Optional:
`--viewport=desktop`, `--base-url=…`, `--settle=2000`, `--cookie-jar=…`,
`--storage-state=…`. Set `VERCEL_AUTOMATION_BYPASS_SECRET` when targeting a
protected Vercel preview/production URL.

Evidence lands in gitignored `docs/ux-check/captures/report.json`. Failure
PNGs use the `*--failure.png` suffix in the same directory.

## 4. Run required open-state probes

Use the shared probe runner for dialogs, popovers, menus, toasts, mock-backed
states, or other durable interactions:

```bash
node docs/ux-check/run-probes.mjs --list
node docs/ux-check/run-probes.mjs nav-menu overlay-open
pnpm e2e:seed
node docs/ux-check/run-probes.mjs --storage-state=docs/ux-check/captures/auth-storage.json atlas-window-dock
```

The runner uses isolated desktop and mobile contexts and writes
`docs/ux-check/captures/probes/report.json`. It fails for a failed assertion,
probe crash, `style-src` violation, unfiltered console error, or uncaught page
error; reported network failures still require disposition. Proactive `shot()`
calls are no-ops; failure screenshots are written automatically.

Add recurring interactions as definitions under `docs/ux-check/probes/` using
`docs/ux-check/README.md`. Do not add another standalone Playwright launcher.
Delete any temporary `*-probe.mjs` diagnosis script before close-out.

## 5. Optional authenticated smoke

When account-adjacent shells matter and Vitest cannot falsify them:

```bash
pnpm test:e2e
```

See `docs/contributing/end-to-end-testing.md`. Keep the suite tiny.

## 6. Report and pause for operator visual review

1. Read `docs/ux-check/captures/report.json` and, when probes ran,
   `docs/ux-check/captures/probes/report.json` (and e2e report when run).
2. Report every console or page error, failed request, and 4xx/5xx response by
   route or probe and viewport. Include the first diagnostic message and its
   disposition. Link any failure artifact paths for diagnosis only.
3. **Do not** open the site to visually approve layout. Build an operator
   checklist of routes/interactions to open locally (and production when
   relevant).
4. Return `UX_EVIDENCE`, pause for the operator's browser review. Do not open a
   PR from this workflow. `close-out` consumes the recorded disposition and does
   not re-run this sweep or pause.

In planned lifecycle work with `UX gate: Yes`, this procedure is the body of a
dedicated Ordered work step under `start-session`; complete the operator pause
there before `n/n complete — awaiting close-out`. In ordinary work, run this
skill standalone, complete the operator pause, then invoke `close-out`.

The required sequence is `ux-check` evidence → operator review → `close-out`.

## Remote / production log probes

Agents must not visually inspect production. For deployment proof scripts:

| Need | Mechanism |
| --- | --- |
| Vercel Deployment Protection | `VERCEL_AUTOMATION_BYPASS_SECRET` via origin-scoped Playwright route (`installOriginScopedBypass`) — never context-wide `extraHTTPHeaders` (that would send the secret to third-party origins) |
| App session on remote | Operator-exported Netscape `--cookie-jar` or Playwright `--storage-state` |

Example:

```bash
VERCEL_AUTOMATION_BYPASS_SECRET=… pnpm verify:site-routes -- https://….vercel.app --cookie-jar ~/lgi-prod-cookies.txt
```

## Return the result

Use `docs/workflows/schema/chat-result.md` for this field set:

```markdown
## UX check: `READY_FOR_REVIEW` | `BLOCKED`

- **Subject:** <concrete probed routes and viewports>; report `<report path>`
- **Result:** <diagnostics/probe summary, naming any authenticated-state limitation and failure artifacts; ≤2 sentences>
- **Operator checklist:** <routes/interactions for the operator to open visually>
- **Action:** <Pause for operator review (`Pending`), return to implementation, hand off to the next Ordered work step, or continue to close-out>
- **Blocker:** <exact blocker or `None`>
```

The remaining `UX_EVIDENCE` detail stays in the report JSON files.
