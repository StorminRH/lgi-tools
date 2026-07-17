---
name: ux-check
description: >-
  Run the LGI.tools scripted UX sweep at the end of a session that touched the
  UI. Figure out which routes the session changed, make sure the local dev server
  is up, run `pnpm ux-check` with the affected routes, and report the
  console/network findings + screenshots inline. This replaces the
  Codex Desktop auto-verify preview loop for UI verification — same idea as base
  Codex Preview, just no model-in-the-loop per click, so it's fast. Use it
  whenever you've changed a user-facing surface and want to check it before Ryan's
  review — phrasings like "ux check", "sweep the UI", "capture the pages", "check
  how it looks", "verify the UI". Ryan still reviews visual + feel in his own
  browser; this sweep is complementary, not a replacement for his eyeball.
---

# UX check (LGI.tools)

<!-- shared-policy-revision: 19 -->

A fast, scripted replacement for the Codex Desktop auto-verify preview loop, **for
UI verification only**. Drives a headless Chromium over the running dev server,
screenshots the routes this session touched at desktop + mobile, and surfaces
console errors, uncaught page errors, failed requests, and 4xx/5xx responses. You
read the report; **Ryan reviews visual + feel in his own browser.**

This is a dev-loop capture tool, not a gate: it never runs in `pnpm verify` or CI,
and a clean sweep exits 0 even when it finds errors (the findings are the output).

Create a native Codex todo list from the phases below before starting and keep
one item in progress. Use `docs/DESIGN_PRINCIPLES.md` as the constitution when a
UX failure reveals an ownership or interface problem rather than a visual defect.

## Step 1 — Decide which routes to capture

Capture **only what this session touched**, not a full sweep. Build the list from
your session context plus the diff:

```bash
git diff --name-only $(git merge-base HEAD origin/main)..HEAD
git diff --name-only            # include uncommitted work
```

Map changed files to routes:
- `src/app/<path>/page.tsx` → `/<path>` (drop route-group `(…)` segments).
- A changed feature/UI component → the route(s) that render it. Use Graphify
  (`graphify query` / `graphify affected`) to find every rendered consumer of a
  shared component — e.g. a wormhole-sites component → `/sites` and a `/sites/<id>`.
- For a dynamic route, substitute a **real id** so the page actually renders —
  `/sites/[id]` → `/sites/30002`, `/industry/[id]` → a real blueprint id. Grab one
  from the local DB or the list page if you don't have it handy. The capture script
  takes concrete paths; it never derives ids.

Note the v1 boundary: the sweep runs **logged-out** (EVE SSO can't be scripted
headlessly), so signed-in routes (`/skills`, `/jobs`, `/characters`, the home
roster, `/industry` live jobs) capture their gated shell, not populated
per-character data. Capture them to check the gated state; flag in your report that
the authenticated view needs Ryan's logged-in eyes.

## Step 2 — Make sure the dev server is up (don't collide with Ryan's)

Probe first — if a server already answers, reuse it; only start one if it's down:

```bash
curl -sf -o /dev/null http://localhost:3000 && echo UP || echo DOWN
```

- **UP** → use it as-is.
- **DOWN** → start it in the background on the loopback host (bypasses the macOS
  firewall re-prompt): `next dev -H 127.0.0.1`. The capture script polls for
  readiness, so you can start it and run the sweep right after. (Logged-out capture
  needs only Next; you don't need Convex/Docker for it.)

> **Launch host vs browsed URL.** Launching with `next dev -H 127.0.0.1` is still
> fine (macOS firewall bypass) — but the **browsed** URL must be
> `http://localhost:3000`, which is the capture script's default. Next dev
> (Turbopack) blocks `/_next/*` dev resources cross-origin from a `127.0.0.1`
> Host (`allowedDevOrigins`), so against `127.0.0.1` the HMR handshake fails and
> hydration silently never completes: the sweep captures the SSR shell with NO
> client-fetched content, zero `/api/*` requests, and no errors (confirmed on the
> 3.7.5.4 probes and the 3.7.12.2 sweep). Never pass
> `--base-url=http://127.0.0.1:3000`.

Ensure the browser binary is present once (idempotent — no-op if already installed):

```bash
npx playwright install chromium
```

## Step 3 — Run the sweep

```bash
pnpm ux-check /sites /sites/30002 /industry      # the routes from Step 1
```

Both viewports (desktop 1440×900, mobile 390×844) run by default; the mobile pass
also captures the hamburger opened. Flags if needed: `--viewport=desktop`,
`--base-url=…`, `--settle=2000`. Artifacts land in the gitignored
**`docs/ux-check/captures/`** (auto-wiped at the start of every run).

## Step 3b — Open-state probes (overlays / interactions)

`pnpm ux-check` captures only the **closed** static shell — it never opens a
tooltip/popover/dialog/menu or clicks anything. For overlay or interaction work,
use a Playwright probe from **`docs/ux-check/scripts/`** (indexed in
`docs/ux-check/README.md`): it opens the overlay on a real route and proves the
open state — zero `style-src` CSP violations, keyboard + touch operability — and
screenshots it. `overlay-open-probe.mjs` is the starting template; copy + tweak the
URL/labels per feature. Its shots also land in `docs/ux-check/captures/`.

> All generated UX files (sweep + probes) live under **`docs/ux-check/captures/`**
> — one place to keep tabs, safe to delete (`rm -rf docs/ux-check/captures`).
> Because it auto-wipes each run, the sweep and a probe overwrite each other if run
> back-to-back, so relay each run's shots before starting the next.

## Step 4 — Report findings inline

- Read `docs/ux-check/captures/report.json` and surface, per route × viewport:
  console/page errors, failed requests, and 4xx/5xx responses. Quote the first
  message of each.
- `Read` a few key `docs/ux-check/captures/*.png` to flag obvious visual breakage
  (overlap, empty regions, broken layout) — but don't substitute your read for
  Ryan's review.
- If nothing's wrong, say so plainly and point at the `docs/ux-check/captures/` dir.

## Step 5 — Hand off

For a UX / user-facing session, this is the review point: present the findings +
the screenshot dir, then **pause for Ryan to review visual + feel in his own
browser** before `/close-out` opens the PR. The session sequence is:

> `ux-check` sweep → Ryan review pause → `close-out`
