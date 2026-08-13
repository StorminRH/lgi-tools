# Contributing to LGI.tools

Thanks for your interest in contributing! LGI.tools is a multi-tool web platform
for [EVE Online](https://www.eveonline.com) players. This guide covers the
conventions and workflow for working in the repo. For local setup, see the
[Local development](README.md#local-development) section of the README.

## Before you start

- **Open an issue first for anything non-trivial** so we can agree on the shape
  before code is written. Small, obvious fixes (typos, a broken link, a clear
  one-line bug) can go straight to a PR.
- **Be civil.** Reviews are conversations.

## Project layout & slice boundaries

The codebase is organized into self-contained slices. The import direction
between them is **enforced in CI** by `pnpm fallow`: every production source
file must belong to a named zone, and a violating cross-zone import fails that
gate. [`.fallowrc.json`](.fallowrc.json) is the mechanical authority;
[`docs/architecture-map.md`](docs/architecture-map.md) is its generated view,
and [`docs/architecture-boundaries.md`](docs/architecture-boundaries.md) records
the remaining architectural rationale.

- `src/features/<name>/` — self-contained feature slices (their own
  `components/`, `schema.ts`, `queries.ts`, `types.ts` as needed). **Two features
  never import from each other.**
- `src/data/` — shared data layers (EVE SDE, market prices, telemetry). A data
  slice **never imports a feature**. Peer-data imports are forbidden except for
  narrow composition exceptions declared in the authoritative
  [`.fallowrc.json`](.fallowrc.json); ordinary cross-slice composition lives in
  a layer *above* both.
- `src/components/ui/` — domain-agnostic UI primitives. These accept abstract
  `tone` props (`green`, `red`, …); only feature-level style maps know that, say,
  "C5 is red". UI primitives import no other zone: `.fallowrc.json`'s
  `boundaries.rules` gives `ui` an empty allow-list, so a primitive composes with
  its sibling primitives and third-party packages, never with `lib`, `data`, or
  a feature.
- `src/lib/` — cross-cutting helpers importable from any zone whose allow-list
  includes `lib`; empty-allow-list leaves such as `ui` do not import it. `lib`
  imports only `lib` and application configuration, never a feature, data, or ui
  module.
- `src/app/` owns routes and API handlers. `src/composition/` and
  `src/components/composition/` own server and UI composition;
  `src/platform/` owns reusable capabilities; `src/transport/` and `src/db/`
  own foundations; and `src/esi-datasets/` owns test-only registry checks.
  `src/config/` owns application configuration.
- `convex/` owns the live reactive backend (see below);
  `src/proxy*.ts` and `src/instrumentation*.ts` are process-level runtime entry
  points.

Two guiding principles: **reusable primitives over one-off components** (extract a
primitive when a second real consumer exists, not speculatively), and **minimal by
default** — build for the task in front of you, not for hypotheticals.

## This isn't the Next.js you know

The repo runs a **current** version of Next.js (16.x) with **Cache Components**
(Partial Prerendering) enabled. APIs and conventions differ from older versions
and from most online examples. Before writing routing/rendering/caching code,
read the relevant guide under `node_modules/next/dist/docs/` (present after
`pnpm install`).

Two things this means in practice:

- **Use the most static honest render mode.** Fully static routes are preferred.
  Routes that need limited request-time data (search params, cookies/session,
  per-request DB work) can keep a static shell and stream that work from a
  `<Suspense>` boundary; genuinely request-specific surfaces may be fully dynamic.
  Cache global, slow-changing reads with the `'use cache'` directive (plus
  `cacheLife`/`cacheTag`).
- **Neon Postgres is authoritative.** It holds global/shared data and slower
  personal datasets such as skills and industry jobs. Convex is a derived,
  regenerable live projection for data cached for at most two minutes; its
  current application dataset is character online status, which the browser
  subscribes to directly.

## Security & CSP

The production Content-Security-Policy is `script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline'` — no nonce. Two rules follow, both
**lint-enforced**:

- **No inline `style="…"` attributes (house style).** Inline styles are
  CSP-permitted, but Tailwind + CSSOM stay the default — styling lives in the
  stylesheet/token layer, not on the element. Use Tailwind classes for static
  values, or set a CSS custom property via `ref.current.style.setProperty(...)`
  in an effect for runtime-dynamic ones.
- **No raw-HTML sinks.** No `dangerouslySetInnerHTML` and no raw
  `innerHTML`/`outerHTML` writes — under `'unsafe-inline'` scripts, an unescaped
  HTML sink is an XSS vector. Render text through JSX (auto-escaped), or build DOM
  with `textContent`/`createElement`.

## Color tokens

Raw hex colors belong in the token layer, never hardcoded at call sites
(**lint-enforced**). Define a color once as a `--color-*` custom property in the
`@theme` block of `globals.css` (surfaced as `bg-…`/`text-…`/`border-…`/`fill-…`
utilities), or in `tones.ts` for the SVG fills/strokes that read `toneHex`. The
visual identity is the existing terminal/EVE aesthetic — build within it rather
than introducing a new palette or typeface.

## Type scale

Font sizes belong on the named scale, never as raw bracketed pixel values at call
sites (**lint-enforced**). The ladder is defined once as `--text-*` tokens in the
`@theme` block of `globals.css`, surfaced as Tailwind utilities and chosen by
**role, not pixel count**:

- `text-micro` — dot sublabels, unit suffixes, fine-print
- `text-label` — uppercase tracked labels, table/column headers, breadcrumbs
- `text-ui` — nav, table cells, pills, buttons, form controls (the default tier)
- `text-body` — prose, card descriptions, help text
- `text-lead` — section intros / hero pitch line
- `text-h3` / `text-h2` — small headings (card/dialog titles) and section headings
- `text-stat` — KPI numerals (with `tabular-nums`); `text-display` — page titles /
  PageHead; `text-hero` — the landing wordmark

Each token bundles its line-height, so a `text-*` utility sets size **and** leading
— add an explicit `leading-*` only to override it. A genuinely one-off size uses an
inline `// eslint-disable-next-line no-restricted-syntax -- <reason>`; test fixtures
and the `preview` sandbox are exempt.

## Radius scale

Corner radii belong on two named tokens, never as raw bracketed pixel values at
call sites (**lint-enforced**). Defined once in the `@theme` block of `globals.css`
and chosen by **role**:

- `rounded-ctl` (`--radius-ctl`, 4px) — buttons, inputs, selects, square pills,
  controls, dropdown items
- `rounded-card` (`--radius-card`, 6px) — cards, panels, dialogs, dropdown panels

`rounded-full` stays for pill-shaped elements. A genuinely sub-4px inner indicator
(a switch thumb, a checkbox fill) uses an inline
`// eslint-disable-next-line no-restricted-syntax -- <reason>`; test fixtures and
the `preview` sandbox are exempt. The elevation tokens (`--shadow-field-inset`,
`--shadow-btn-bezel`, `--shadow-card-edge`, …) live in the same `@theme` block.

## Component system

Form fields and action buttons are shared primitives, not hand-styled per call
site (**lint-enforced**):

- **Button** (`@/components/ui/button`) — `variant` (primary / secondary / ghost /
  danger / bare) × `size` (md / sm). A link or anchor that must look like a button
  borrows the exported `buttonVariants` as its `className` rather than restyling
  it. Raw buttons and hand-authored button semantics are lint-enforced exceptions,
  not alternate styling APIs.
- **Input / Textarea** (`@/components/ui/input`) and **Select**
  (`@/components/ui/select`) — the engraved inset-well fields. Visible raw
  inputs, textareas, and selects are banned outside their owning primitives;
  hidden server-action fields remain the narrow raw-input carve-out. An ad-hoc
  `inputClass`-style field constant is also banned.
- **Stepper / Segmented / ChipToggle** — use their Base UI interaction and keyboard
  behavior. Product surfaces may vary the surrounding layout, but do not recreate
  their state model with raw controls.
- **StaticTable / Collapsible** — own semantic table and disclosure HTML. The
  adoption census records the two native-details contracts that cannot use the
  shared list-style Collapsible.

The UI adoption rail also protects primitive-owned status, empty, pill/chip,
skeleton, and progress tokens. Its exact surviving exemptions and CSS-family
allowlist live in `src/composition/ui-adoption-registry.ts` and are checked by the
repeatable census in `src/esi-datasets/ui-adoption.test.ts`.

## UI components & overlays

Interactive source work uses the shared `src/components/ui/` primitives instead
of importing their underlying libraries from feature code. Lint and Fallow
enforce the wrapper seams; remaining landmines (route registration, Tooltip vs
Popover, nonce CSP) live in [`src/AGENTS.md`](src/AGENTS.md).

## Architecture invariants

These are load-bearing constraints, several **lint-enforced**:

- **API contracts.** Every input-accepting JSON route validates with a Zod schema
  in the **route handler** (not in queries). The schema and the route's response
  types live in the owning slice's `api-contract.ts`; clients call `apiFetch`
  (`src/transport/api-client.ts`) with that slice's endpoint object — never a
  raw `fetch('/api/…')`. Server-to-server callers use `serviceFetch`
  (`src/platform/auth/service-client.ts`); both decode through the same shared
  core. Routes without a JSON/form body declare exactly one own-line marker:
  `// input: none` when they read no caller input, `// input: query` when they
  read query parameters, or `// input: path` when they read a dynamic path
  segment; body-consuming routes carry no input marker.
- **Server env.** Read server-side env through `readEnv`/`requireEnv`
  (`src/lib/env.ts`), the one validated registry — never `process.env` directly.
  (`NODE_ENV` and `NEXT_PUBLIC_*` stay direct reads.)
- **Bounded vendor calls.** Every external call goes through the wrapper declared
  for its integration in `src/composition/vendor-resilience-registry.ts`, with an
  explicit timeout — never an SDK default. The registry records each
  integration's timeout, retry, idempotency, and degradation behavior; a lint
  rail bans bare `fetch` in production source (only
  `src/lib/fetch-with-timeout.ts` and `src/transport/api-client.ts` may call it)
  and confines each vendor SDK import to its owning module, while
  `src/esi-datasets/vendor-resilience.test.ts` checks the registry against the
  real tree.
- **The ESI gate.** The exemplar of the rule above: every call to EVE's ESI API
  routes through the single `esiFetch` in `src/platform/esi/` and its shared
  rate-limit budget — never a second wrapper. Build URLs with `esiUrl()`.
- **One source of truth for config.** Postgres enums are driven from TypeScript
  `as const` arrays; types/variants are constants defined in one place. Adding one
  is a config change, not a code change.
- **Typed failures at JSON delivery boundaries.** A JSON endpoint-contract route
  that returns an application failure maps an `AppFailure`
  (`src/lib/failure.ts`) through `problemResponse`
  (`src/transport/api-response.ts`) — an RFC 9457-compatible
  `application/problem+json` body built in `src/lib/problem.ts`, carrying the
  request's correlation id — so clients decode one shape. HTML form mutations
  may instead return a 303 redirect carrying a stable error code, and the Better
  Auth catch-all returns the library-owned response shapes. (Lower layers may
  still throw; the rule governs what a JSON handler returns.)
- **Same-origin mutations.** Every mutating route classified as pipeline or
  direct by `src/app/api/same-origin-coverage.test.ts` rejects a cross-origin
  caller with 403 through `requireSameOrigin`
  (`src/platform/auth/same-origin.ts`), applied by the shared `runMutationRoute`
  shell or called directly. The test's `EXEMPT_MUTATIONS` map is the exhaustive
  owner of every deliberate exception and records its authorization class and
  reason; the fail-closed route census ensures a new mutation cannot land
  unclassified.

## Testing

- We use **Vitest**. CI runs the suite on every PR; a red suite blocks merge.
- **Add tests organically.** New testable code (pure functions, query helpers,
  math, data layers with assertable output) gets tests in the same PR, co-located
  as `foo.test.ts` next to `foo.ts`.
- **Test behavior, not layout.** Test logic that branches (state machines, derived
  values, error/empty/loading transitions). When logic is tangled inside a
  component, extract it into a pure function and test that; leave the presentational
  shell to visual review. Assert on visible text/role, never DOM structure.
- **Don't backfill for coverage's sake** — untested code stays untested until
  something touches it.
- **High-signal bar.** Prefer fewer, longer workflow tests over many tiny cases.
  The deletion / consolidation bar lives in
  [`docs/contributing/testing-principles.md`](docs/contributing/testing-principles.md).
  Log-driven Playwright UX uses `pnpm ux-check` / `pnpm test:e2e` as a UI gate
  aid (`docs/workflows/ux-check.md`,
  `docs/contributing/end-to-end-testing.md`), not a permanent suite in
  `pnpm verify`. Agents do not visually approve the UI; operators do after the
  log sweep. Failure-only screenshots/traces land under
  `docs/ux-check/captures/`.

## Commit style

Plain English. Describe what the change does for the project, not how the code is
structured — no file paths, function names, or jargon in the subject or body.

- **Subject:** one sentence, lowercase after the colon, under 72 characters.
- **Body (optional):** 3–5 bullets on what changed and why.

```
feat: add API endpoints for browsing and filtering wormhole sites

- sites can now be listed, filtered by class and type, and fetched by ID
- full site detail includes waves, NPC counts, and resource values
- invalid filters return a clear error instead of an empty result
```

## Opening a pull request

1. Branch off `main` and open your PR back into `main`.
2. Run **`pnpm verify`** locally and confirm it passes — this bundles
   `typecheck`, zero-warning `lint`, one coverage-enabled Vitest suite, and
   `fallow` (dead code, duplication, complexity, and architecture boundaries).
   CI installs with the frozen lockfile, runs those same four gates, and also
   runs the route-classification presence check (`assert:routes-present`).
3. Fill in the PR template's **test plan** — what you verified and how.
4. Reference the issue the PR resolves (e.g. `Fixes #123`).

## Conduct, security & license

- This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).
- To report a security vulnerability, see [SECURITY.md](SECURITY.md) — please
  **don't** open a public issue for it.
- LGI.tools is [MIT](LICENSE) licensed; contributions are made under the same
  license.
