# docs/ux-check — UX verification workspace

The durable probe harness, probe definitions, and this guide are tracked project
tooling. Generated screenshots and reports under `captures/` remain ignored local
evidence and can be deleted at any time.

## Layout

| Path | What | Lifecycle |
| --- | --- | --- |
| `run-probes.mjs` | Shared Playwright runner for durable interaction probes | Tracked; one owner for browser lifecycle, diagnostics, screenshots, reports, and exit gating |
| `probes/*.mjs` | Small durable probe definitions | Tracked; one module per recurring feature check |
| `captures/probes/` | Probe screenshots plus `report.json` | Ignored; only this subdirectory is wiped when the probe runner starts |
| `captures/` | `pnpm ux-check` sweep screenshots and report | Ignored; the sweep refreshes the capture root as before |

The probe runner never wipes the sweep's screenshots. Running `pnpm ux-check`
afterward still starts a new sweep by clearing the capture root, so review or relay
probe evidence before beginning that later sweep.

## Run durable probes

Start the local app first:

```bash
pnpm dev
```

List available definitions, run all of them, or select names:

```bash
node docs/ux-check/run-probes.mjs --list
node docs/ux-check/run-probes.mjs
node docs/ux-check/run-probes.mjs overlay-open dialog-open
```

Use a different local origin when needed:

```bash
node docs/ux-check/run-probes.mjs --base-url=http://localhost:3001 overlay-open
```

With no names, the runner loads every `.mjs` definition in `probes/`. It runs each
definition in an isolated page and browser context for its declared viewports, so one
crash is recorded without aborting the remaining probes. It never waits for
`networkidle`; the Convex websocket keeps live pages busy indefinitely.

Every viewport run automatically records:

- authored checks and screenshots;
- `style-src` CSP violations;
- unfiltered console errors and uncaught page errors;
- failed requests and HTTP 4xx/5xx responses.

The command exits non-zero when an authored check, a definition, or a default gate
fails. Network findings are recorded for diagnosis but are not an automatic failure,
because some probes deliberately exercise responses such as signed-out 401s. Read the
combined result at `captures/probes/report.json`.

## Definition format

A definition imports nothing. The runner discovers it and injects the complete probe
context, keeping capture paths, Playwright lifecycle, and diagnostic policy out of
feature checks:

```js
export default {
  name: 'feedback-dialog',
  route: '/',
  viewports: ['desktop', 'mobile'], // optional; defaults to both
  settle: 1200,                    // optional milliseconds; defaults to 1000
  allowConsole: [/expected noise/], // optional extra RegExp filters
  async setup({ page, baseUrl }) {
    // Optional pre-navigation route mocks, permissions, or init scripts.
  },
  async run({ page, viewport, baseUrl, check, shot }) {
    const dialog = page.getByRole('dialog');
    check('dialog opens', await dialog.isVisible());
    await shot('open');
  },
};
```

Context members:

| Member | Contract |
| --- | --- |
| `page` | The raw Playwright page for feature-specific navigation and interaction |
| `viewport` | `'desktop'` or `'mobile'` |
| `baseUrl` | The selected local origin |
| `check(label, condition)` | Records a pass/fail result without throwing, so later checks still run |
| `shot(tag)` | Writes a full-page PNG to `captures/probes/<name>--<viewport>--<tag>.png` |

Use `setup` only when behavior must exist before the first navigation, such as a
`page.route` mock or clipboard permission. Use `allowConsole` only for noise the
definition intentionally creates; Convex/HMR/Speed-Insights development noise is
owned centrally by the runner.

## Durable definition index

| Name | Recurring proof |
| --- | --- |
| `asset-ledger` | Logged-out asset ledger open state and totals |
| `asset-ring-mock` | Mocked complete/partial ownership rings and holding details |
| `changelog-browser` | Canonical routes, sitemap entries, soft navigation, sticky rail, mobile disclosure |
| `combobox-global` | Header search focus, options, keyboard navigation, selection, and dismissal |
| `combobox-terminal` | Planner system search focus, suggestions, selection, and dismissal |
| `content-browser-scroll` | Shared sticky rail, internal scroll, boundary chaining, and mobile disclosure |
| `cost-basis` | Raw/Item input-cost toggle and explanatory popover |
| `devlog-excerpt-open` | Open Shiki excerpts, gutters, colored tokens, and permalinks |
| `dialog-open` | Sites lightbox click/tap open and Escape close |
| `eve-image-network` | Direct EVE image requests with no Next optimizer or hydration regression |
| `feedback-dialog` | Keyboard/touch open, Field focus, and Escape close |
| `me-planner` | Mocked owned research, component adjuster popover, and ME recomputation |
| `multibuy-panel` | Tier toggles, nested help, toast, and clipboard payload |
| `nav-menu` | Mobile open, navigation close, Enter open, and Escape close |
| `overlay-open` | Desktop hover/keyboard and mobile tap for planner help overlays |
| `sites-lazy-detail` | Cards/table summary parity and first-open-only lazy detail mounting |
| `templates-menu` | Signed-out saved-template panel, 401 toast, and unknown-plan cleanup |

## Add or explore a probe

When a behavior will recur, add a small definition in `probes/`, run it by name, and
add its purpose to the index above. Keep all generic lifecycle and diagnostic behavior
in `run-probes.mjs`; a definition should contain only the feature interaction and its
checks.

One-off exploration remains allowed. A scratch `*-probe.mjs` may live outside
`probes/` during a session, but the agent drift check warns about it so it cannot be
forgotten. Delete scratch probes at close-out. Do not promote a genuine one-shot into a
durable definition "just in case."
