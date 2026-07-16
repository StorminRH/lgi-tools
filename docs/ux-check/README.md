# docs/ux-check — UX verification working files

Everything here is **local-only** (the whole `docs/` folder is gitignored — nothing
in here is ever committed). It's the single home for UX-check artifacts so they're
easy to find and easy to delete.

## Layout

| Path | What | Lifecycle |
| --- | --- | --- |
| `scripts/` | Reusable feature-check probe scripts (Playwright `.mjs`) | Kept as templates; edit/copy per feature |
| `captures/` | **All** generated screenshots + `report.json` | **Auto-wiped at the start of every capture run** — holds only the most recent run |

## Where generated files live (for cleanup)

All generated output lives under **`docs/ux-check/captures/`** — both the
`pnpm ux-check` sweep and the probe scripts write there. It's safe to delete the
whole folder at any time; it regenerates on the next run:

```bash
rm -rf docs/ux-check/captures      # frees all UX screenshots/reports
```

Nothing else in the repo writes UX screenshots. (`.ux-captures/` at the repo root
is retired — the sweep now writes to `docs/ux-check/captures/`.)

> **Auto-wipe caveat:** because `captures/` is cleared at the start of each run,
> the sweep and a probe will overwrite each other if run back-to-back. Review or
> relay each run's shots before kicking off the next one.

## Scripts (the index)

Each probe needs the dev server up (`pnpm dev` → `http://localhost:3000`). They're
**templates** — copy one and tweak the URL/selectors for the feature under test.

### `docs/ux-check/scripts/eve-image-network-probe.mjs`
Records successful image requests on home, contact, and an industry detail page.
It writes `captures/eve-image-network-report.json` and fails if a request uses
`/_next/image` or the console reports a loader-width or hydration error.

```bash
node docs/ux-check/scripts/eve-image-network-probe.mjs
```

### `docs/ux-check/scripts/changelog-browser-probe.mjs`
Verifies the changelog browser's canonical routes, soft-navigation state, active
version, 404s, sitemap coverage, shared rail scrolling, and mobile disclosure.

```bash
node docs/ux-check/scripts/changelog-browser-probe.mjs
```

### `docs/ux-check/scripts/content-browser-scroll-probe.mjs`
Verifies the shared content-browser rail at desktop and mobile widths: sticky
follow, independent internal scrolling, page chaining at the rail boundary,
last-item reachability, short-rail pinning, and the mobile disclosure.

```bash
node docs/ux-check/scripts/content-browser-scroll-probe.mjs
```

### `docs/ux-check/scripts/overlay-open-probe.mjs`
Opens an overlay (hover + tap + keyboard) on a real route, screenshots the **open**
state at desktop + mobile, and asserts **zero `style-src` CSP violations** + keyboard
operability (Enter opens, Escape closes) + touch-open. `pnpm ux-check` only captures
the closed shell, so this is how overlay/interaction work gets its open-state proof.

```bash
# defaults to the OOB.2.2 (?) help popovers on /industry/691
node docs/ux-check/scripts/overlay-open-probe.mjs
# adapt per feature:
PROBE_URL=http://localhost:3000/sites/30002 \
  PROBE_LABELS="Why this confidence|Resource detail" \
  node docs/ux-check/scripts/overlay-open-probe.mjs
```

### `docs/ux-check/scripts/dialog-open-probe.mjs`
Opens the **`/sites` card lightbox** (the Base UI Dialog primitive). Forces the
catalogue into lightbox mode (sets the `sites.detailMode` preference in
localStorage — default is `expand`), clicks/taps a card summary, and asserts the
dialog **opens** (`role="dialog"`), **Escape closes** it, and a **touch-tap opens**
it on mobile — with **zero `style-src` CSP violations**. Functional + CSP only (no
axe / formal a11y audit — deferred per the OOB.2.3 standing direction).

```bash
PROBE_URL=http://localhost:3000/sites node docs/ux-check/scripts/dialog-open-probe.mjs
```

### `docs/ux-check/scripts/feedback-dialog-probe.mjs`
Opens the public Feedback dialog with keyboard and touch, confirms the shared Field label moves focus into the textarea, proves Escape closes, checks style CSP/page errors, and captures both open states without wiping the route sweep.

```bash
node docs/ux-check/scripts/feedback-dialog-probe.mjs
```

### `docs/ux-check/scripts/nav-menu-probe.mjs`
Drives the **mobile nav hamburger** (the OOB.2.4 Base UI Menu primitive) through its real flow:
tap-open, **close-on-link-tap + actual route change** (the `pnpm ux-check` sweep opens the
hamburger but never taps a link, so it can't prove the menu closes itself on navigation),
keyboard Enter-open / Escape-close, and **zero `style-src` CSP violations**. Functional + CSP
only (no axe / formal a11y audit — deferred per the OOB.2.3 standing direction).

```bash
PROBE_URL=http://localhost:3000/ node docs/ux-check/scripts/nav-menu-probe.mjs
```

### `docs/ux-check/scripts/templates-menu-probe.mjs`
Drives the **saved-templates popover** (3.7.23, PlannerHead left cluster) and the
**`?plan=` loader** through their logged-out arms: click-open + Escape-close, the
signed-out empty state, the save 401 error toast, and the loader's not-found toast
followed by the `history.replaceState` param strip — with **zero `style-src` CSP
violations**. The signed-in save/load/rename/favorite/delete flows are Ryan's
logged-in review.

```bash
PROBE_URL=http://localhost:3000/industry/692 node docs/ux-check/scripts/templates-menu-probe.mjs
```

### `docs/ux-check/scripts/csp-probe.mjs` — ⚠️ retired (route removed)
> **Retired:** this probe and its `/dev/sandbox/*` siblings (`toast-csp-probe.mjs`,
> `mapper-csp-probe.mjs`, `me-adjuster-probe.mjs`) target the `/dev/sandbox/*` harness routes
> that were deleted with the #210 `/dev` cleanup, so they now 404 and no longer run. Kept as
> templates for the "open a set of overlays and check CSP" pattern — re-point `PROBE_URL` at a
> real route to reuse one.

Opens every overlay on the `/dev/sandbox/overlays` harness and records all
`SecurityPolicyViolation` events — the OOB.2.1 proof that Base UI's internal inline
positioner style is CSP-clean. A good template for "open a set of overlays and check
CSP" without screenshots.

```bash
PROBE_URL=http://localhost:3000/dev/sandbox/overlays node docs/ux-check/scripts/csp-probe.mjs
```

## Adding a probe

Drop a new `.mjs` in `scripts/`, write its screenshots to `docs/ux-check/captures/`
(wipe it at the start so storage doesn't creep — see `overlay-open-probe.mjs`), and
add a one-line entry to the index above. Keep them disposable: a probe that's served
its purpose can just be deleted.
