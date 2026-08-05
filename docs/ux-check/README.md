# docs/ux-check — UX verification workspace

The durable probe harness, probe definitions, and this guide are tracked project
tooling. Generated reports and failure artifacts under `captures/` remain
ignored local evidence and can be deleted at any time.

## Layout

| Path | What | Lifecycle |
| --- | --- | --- |
| `run-probes.mjs` | Shared Playwright runner for durable interaction probes | Tracked; browser lifecycle, diagnostics, failure-only screenshots, reports, exit gating |
| `probes/*.mjs` | Small durable probe definitions | Tracked; one module per recurring feature check |
| `captures/probes/` | Probe failure screenshots plus `report.json` | Ignored; wiped when the probe runner starts |
| `captures/` | `pnpm ux-check` report + failure PNGs; `auth-storage.json` from `pnpm e2e:seed` | Ignored |
| `../contributing/end-to-end-testing.md` | Tiny Playwright smoke suite policy (`pnpm test:e2e`) | Tracked |

## Run durable probes

Start the local app first:

```bash
pnpm dev
# or pnpm dev:all when Convex-backed surfaces are required
```

List available definitions, run all of them, or select names:

```bash
node docs/ux-check/run-probes.mjs --list
node docs/ux-check/run-probes.mjs
node docs/ux-check/run-probes.mjs overlay-open dialog-open
```

Authenticated probes:

```bash
pnpm e2e:seed
node docs/ux-check/run-probes.mjs --storage-state=docs/ux-check/captures/auth-storage.json atlas-window-dock
```

Use a different origin when needed:

```bash
node docs/ux-check/run-probes.mjs --base-url=http://localhost:3001 overlay-open
```

With no names, the runner loads every `.mjs` definition in `probes/`. It runs each
definition in an isolated page and browser context for its declared viewports, so one
crash is recorded without aborting the remaining probes. It never waits for
`networkidle`; the Convex websocket keeps live pages busy indefinitely.

Every viewport run automatically records:

- authored checks;
- `style-src` CSP violations;
- unfiltered console errors and uncaught page errors;
- failed requests and HTTP 4xx/5xx responses;
- a failure screenshot under `captures/probes/` only when the run fails.

Proactive `shot()` in probe definitions is a no-op (kept so older probes do not
crash). The command exits non-zero when an authored check, a definition, or a
default gate fails. Network findings are recorded for diagnosis but are not an
automatic failure, because some probes deliberately exercise responses such as
signed-out 401s. Read the combined result at `captures/probes/report.json`.

## Definition format

A definition imports nothing. The runner discovers it and injects the complete probe
context, keeping capture paths, Playwright lifecycle, and diagnostic policy out of
feature checks:

```js
export default {
  name: 'feedback-dialog',
  route: '/',
  viewports: ['desktop', 'mobile'],  // optional; defaults to both
  reducedMotion: true,               // optional; emulates prefers-reduced-motion
  settle: 1200,                      // optional milliseconds; defaults to 1000
  allowConsole: [/expected noise/],  // optional extra RegExp filters
  requiresAuth: false,               // optional; needs --storage-state or cookie jar
  async setup({ page, baseUrl }) {
    // Optional pre-navigation route mocks, permissions, or init scripts.
  },
  async run({ page, viewport, baseUrl, check }) {
    const dialog = page.getByRole('dialog');
    check('dialog opens', await dialog.isVisible());
  },
};
```

Prefer role/label locators and behavioral checks. Do not add probes whose only
job is a screenshot.
