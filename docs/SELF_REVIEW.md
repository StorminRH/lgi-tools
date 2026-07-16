# Self-Review — the judgment gate

> Read at close-out, after `SESSION_END.md`'s "fix before you close" and before
> the commit + `pnpm verify`. Walk the session's diff against the checks below;
> fix what's off in-branch. If a check here and `CLAUDE.md` ever disagree,
> `CLAUDE.md` wins.

**Scope:** `pnpm verify` already hard-fails the mechanical layer (boundaries, dead
code, duplication, complexity, inline styles, raw hex, raw `fetch('/api/…')`, ESI
host literals, direct `process.env`) — don't re-check any of that. This doc covers
only the *judgment* calls no gate can see. Skip any section the session didn't touch.

---

## 1 — Data placement (added/moved any ESI-fed dataset?)

Declare, in the diff, in order:
1. **The dataset's ESI cache time** — look it up at `esi.evetech.net/ui/`, don't guess.
2. **Where you put it** — Convex or Neon.
3. **Does that match the rule?** Convex ONLY for ≤2-min-cache live data or
   collaborative peer-fan-out data; everything slower → Neon. "Per-character" is
   not a reason (skills are per-character, in Neon). Cache > 2 min in Convex =
   **placement bug — fix now, don't ship.** A Convex tracker used as scaffold
   doesn't make the data Convex-shaped.

Then confirm:
- **Refresh shape** — global/shared → cron-kept single copy; personal → stale-gated
  on-view write-behind, one table per dataset indexed `by_user`; timer-like state →
  absolute end timestamp, `now ≥ endDate` client-side (no elapsed counter, no scheduler).
- **No Convex → Neon write, ever.** Convex state must survive teardown + resync.
- **If you swapped stores:** value layer separated cleanly — rework-in-place, not a
  rebuild, unless salvage was genuinely harder.

## 2 — Rendering model (added/changed a route?)

The gap: `assert:routes` (render *mode*) runs **only in Vercel's post-merge
production build** — not in `pnpm verify`, not in CI (CI checks presence only).
A mode regression can pass every pre-merge gate and fail there. Production-mode
builds are deliberately forbidden locally and before merge, so this check is
reasoning plus `dev:all`/`ux-check`, never `next build`.

- **Reason about the mode.** Static `○` default; request-time data streamed from a
  `<Suspense>` hole → partial `◐`; only genuinely per-request surfaces → `ƒ`.
- **Client `useQuery` keeps a page static; server `preloadQuery`/`fetchQuery` makes
  it `ƒ`** and needs justification. Request data (searchParams/cookies/session/
  per-request DB) read outside a `<Suspense>` child makes the whole shell dynamic.
- **Update `scripts/route-classification.json` in the same change** — BOTH `routes`
  (mode) and `_reasons` (why). Sandbox/demo pages are routes too.

## 3 — Reuse & minimalism

- New primitive → does a **real second consumer** exist? No → it stays in the feature.
- Anything the task didn't need (config knob, abstraction, defensive branch for an
  impossible case, comments on untouched code)? Strip it.

## 4 — Interactive UI (built an overlay/toast/graph/drag affordance?)

- On the **adopted library** for the category (Base UI / sonner / React Flow /
  dnd-kit) — no new library without written justification.
- **Wrapped once in `src/components/ui/`** (tone-prop primitive); features import the
  wrapper, never the raw library.
- className-first; runtime-dynamic values via the CSSOM idiom, never JSX `style`.
- **The part fits the affordance** — e.g. an info `(?)` hint is a Popover
  (hover/touch + `aria-describedby`), not a Tooltip (never opens on touch).

## 5 — Public documents (did the change make a committed public doc untrue?)

The truth loop covers the committed public set, not just workspace docs. If the
session changed behavior, scopes, data handling, setup, or workflow, check
whether it invalidated: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, the
PR/issue templates under `.github/`, `.env.example`, or the `/legal` page.
True them in-branch when the fix is small; otherwise raise it — a public
document that describes the app untruthfully ships misinformation.

---

**If something's off:** fix in-branch now (SESSION_END's rule); defer only genuinely
sub-version-out-of-scope work → `docs/backlog.md`. If the session's *goal* required
breaking one of these rules, raise it as a conflict — rules bend by explicit written
decision, never silently in a diff.
