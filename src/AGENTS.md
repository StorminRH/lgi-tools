# Source-level engineering guidance

The architecture and data/API sections apply to their named source surfaces.
Apply the UI sections only when changing TSX, CSS, `*-styles.ts`, UI primitives,
routes, or interactive behavior.

## Source ownership

- `src/features/<name>/` owns product slices and never imports peer features.
- `src/data/<name>/` owns reusable schemas, ingest, queries, and types and never
  imports features or a peer data slice other than the shared
  `src/data/eve-data/` reference core.
- `src/components/ui/` owns domain-neutral primitives; the root of
  `src/components/` owns reusable leaf presentation; and
  `src/components/composition/` owns app-shell and account UI composition.
- `src/composition/` owns server-side cross-slice orchestration.
  `src/platform/` owns reusable authentication, ESI, owner-sync, search, purge,
  and page-settings capabilities. `src/transport/` owns transport helpers.
- `src/app/` owns routes and page composition. `src/db/` owns database
  foundations; `src/esi-datasets/` owns test-only cross-slice registry checks;
  `src/lib/` and `src/config/` own cross-cutting leaves and configuration.
- `src/proxy*.ts` and `src/instrumentation*.ts` are process-level runtime entry
  points.

Reusable presentation stays in the leaf owners under `src/components/`;
app-shell, dashboard, PageMenu, and account composition belong under
`src/components/composition/`. Server-side cross-slice wiring belongs under
`src/composition/`; follow `src/composition/search/register-all.ts` and
`src/composition/purge/orchestrator.ts`. Feature UI may import reusable
components and primitives, but never the composition homes or a peer feature.

Protect the EVE tree resolver, shared ESI/API/environment gates, and industry
planner pure-logic pairs as deep modules. Split them only when callers or change
axes differ.

Use a non-null assertion only for a locally provable by-construction invariant
and explain it with a one-line comment. Every exported production surface needs
a concise `/** */` contract comment; use TSDoc tags only when they add
information.

## Data, API, and identity

- TypeScript `as const` arrays are authoritative for Postgres enums. The lazy DB
  proxy in `src/db/index.ts` remains import-side-effect-free.
- Keep types, variants, classes, and enums in one authoritative configuration.
  Batch database work and do not introduce N+1 queries.
- Session advisory locks use a reserved direct, unpooled connection and release
  in `finally`; never hold a transaction or pooled connection across network
  calls.
- Every user- or character-keyed Neon table needs a purge contributor or an
  explicit retained exemption. Follow the declaration, key-shape, purge,
  growth, and ESI checks in
  `src/esi-datasets/dataset-declarations.test.ts`.
- Real-Postgres suites use `*.db.test.ts` and `createDbTestHarness`; direct
  `postgres()` construction or embedded connection strings are forbidden.
- Validate JSON bodies in route handlers with the owning slice's Zod
  `api-contract.ts`. Keep response types and endpoint definitions there, and
  use `apiFetch` from clients. Raw `fetch('/api/...')` is forbidden.
- Routes without a JSON or form body declare exactly one own-line marker:
  `// input: none`, `// input: query`, or `// input: path`. Body-consuming
  routes carry none of them.
- Read server environment through `readEnv` or `requireEnv`; direct access is
  limited to `NODE_ENV` and `NEXT_PUBLIC_*`.
- Every external vendor call routes through the wrapper declared in
  `src/composition/vendor-resilience-registry.ts` and carries an explicit
  timeout. That registry owns retryable errors, backoff, rate limits,
  idempotency, degradation, and telemetry. Bare production `fetch` is limited
  to `src/lib/fetch-with-timeout.ts` and `src/transport/api-client.ts`; each
  vendor SDK is importable only from its declared home. Adding a vendor requires
  its registry entry and rail exemption; an integration with no programmatic
  call surface records that absence.
- Every EVE ESI request uses `esiFetch` and `esiUrl` through the shared Redis
  budget. The EVE SSO host is owned by
  `src/platform/auth/eve-sso-constants.ts`; do not duplicate either integration
  seam. New ESI scopes require an explicit batched decision.
- One Better Auth user represents one human. Linked EVE characters are account
  rows; admin authority belongs to the user, and EVE SSO is the only login
  path. Application AES-256-GCM encryption protects EVE tokens; Better Auth
  `encryptOAuthTokens` remains disabled.
- Before placing data in Convex or changing a source-to-Convex projection, read
  `docs/CONVEX.md`.

## Interactive UI

Use the already-adopted library for each interaction category. Do not hand-roll
behavior that the library provides, and do not add a competing library without
explicit written justification.

For every interactive primitive:

1. Before writing or editing the primitive or its consumers, confirm the
   adopted library's current API and examples with a `docs-researcher`
   subagent (Documentation brief required).
2. Compose the library's documented parts and preserve its native dismiss,
   focus, keyboard, touch, stacking, pan, or drag behavior.
3. Wrap the library once in `src/components/ui/` as a domain-neutral primitive
   with abstract props such as `tone="green"`.
4. Import the wrapper through `@/components/ui/*`; feature code never imports
   the raw library.

Adopted categories:

- Overlays, dialogs, popovers, menus, and navigation: Base UI from
  `@base-ui/react`, never the deprecated `@base-ui-components/react`. The
  existing wrapper files are the only Base UI import seam. Require `label` on
  popover/menu/navigation triggers; dialogs use `labelledBy`.
- Toasts and transient status: sonner through
  `src/components/ui/toast.tsx`, the only sonner importer and owner of the root
  `<Toaster>` configuration.
- Charts: visx plus the house CSSOM pattern. Charts are not part of the
  overlay-wrapper category.
- Fixed-layout trees: keep using `trees/flow/FlowExplorer.tsx`.
- Free-form mapper: React Flow v12 (`@xyflow/react`) is owned only by
  `src/mapper/`; application routes consume its public surface through
  `@/mapper`.
- Future drag/reorder: classic dnd-kit packages. Give every `<DndContext>` a
  stable explicit `id` to prevent SSR `aria-describedby` hydration drift, and
  apply transforms through CSSOM rather than JSX `style`.

The Base UI wrapper allowlist and sole sonner owner are lint-enforced through
scoped `no-restricted-imports` rules; do not widen those exemptions inline.

Keep `Collapsible` as a pure `<details>/<summary>` primitive with native open
state.

## Styling and security

Prefer `className` with Tailwind and established tokens. JSX `style` is
lint-banned as house style, not by CSP. Runtime-dynamic values use a CSS custom
property set after mount with `ref.current.style.setProperty(...)`, consumed by
a stylesheet rule.

Library-owned inline placement/transform styles inside `node_modules` require no
lint exemption. Production intentionally allows `style-src 'unsafe-inline'`;
do not reintroduce a nonce-based CSP because it blocks static rendering.
`script-src 'unsafe-inline'` supports Next App Router's inline RSC flight
scripts.

Never use `dangerouslySetInnerHTML` or write `innerHTML`/`outerHTML`. Render
text through JSX or construct DOM with `textContent`/`createElement`.

Preferred patterns:

- Static values: Tailwind utilities, including arbitrary structural values when
  appropriate.
- Runtime values: stylesheet class plus a CSS custom property set through
  CSSOM.
- Colors: named `--color-*` tokens in the `@theme` block of `globals.css`, or
  `src/components/ui/tones.ts` for SVG fill/stroke values exposed through
  `toneHex`.

Do not hardcode raw hex at call sites, interpolated class strings, or SVG
attributes. `tones.ts` and `src/app/(site)/preview` are deliberate raw-hex lint
exemptions; raw `rgba()` is restricted everywhere in source and belongs in the
`globals.css` token layer. Reuse the semantic type, tracking, radius, motion,
stacking, elevation, icon-size, button, field, and card tokens/primitives
already defined by the component system.

Preserve the terminal/EVE visual identity. A new tone, palette, or typeface
needs explicit written justification.

## UI system reference

Use the domain-neutral wrappers in `src/components/ui/` for Field, Checkbox,
RadioGroup, SegmentedControl, Tabs, Tooltip, Kbd, CopyButton, Skeleton, Banner,
Pagination, and ConfirmDialog. Feature code supplies domain meaning and
content; wrappers own interaction semantics and shared appearance.

Exercise new supported states on the admin-gated `/preview/primitives`
reference page when they lack an immediate production consumer. Keep the page
out of public navigation, preserve its server-side admin check inside a Suspense
request-time hole, and register its render mode in
`scripts/route-classification.json`.

## Accessibility behavior

Keep the behavior provided by idiomatic Base UI composition: focus management,
scroll locking, Escape, outside-press dismissal, keyboard operation, and touch
opening. Formal axe/ARIA auditing is deferred to a dedicated pass, but
functional keyboard/touch behavior must not regress.

Choose the primitive that matches the affordance. An informational `(?)` hint
is a Popover with `openOnHover`, not a Tooltip: Base UI Tooltip does not open on
touch and does not provide the required described-by behavior for this use.

## Migration and verification

When replacing an existing interaction, build the library-backed equivalent to
appearance-and-behavior parity, verify it on the real route, then delete the old
implementation in the same change. Do not keep parallel primitives.

Use the `ux-check` skill for changed routes. The standard sweep captures closed
states; dialogs, popovers, menus, toasts, and other interactions need an
appropriate Playwright definition from `docs/ux-check/probes/`, run through the
shared probe runner. Keep open-state probes functional and CSP-focused. The
operator's browser review remains the final visual/feel check.

## Routes and render modes

Register every new page—including previews or demos—in both maps in
`scripts/route-classification.json`. `pnpm verify` does not run
`assert:routes-present`; CI does, and the post-merge Vercel production build
checks the actual render classification. Never run a production-mode build
locally or before merge; reason about the expected mode and verify behavior
through local dev instead.

Choose the most static honest mode:

1. Fully static (`○`) when the page needs no request-time state.
2. Static shell with request-time work isolated in a `<Suspense>` hole (`◐`).
3. Fully dynamic (`ƒ`) only when the entire surface is genuinely
   request-specific.

Cache global, slow-changing reads with `'use cache'`, `cacheLife`, and
`cacheTag`; do not use `unstable_cache` or `experimental.useCache`. Keep request
data inside the smallest Suspense children honesty allows. The static shell must
carry the page's meaningful chrome and every piece of content that is not
genuinely request-scoped; a background-only wrapper with the page head and
results hidden behind one hole is not a useful shell. Prefer
prerendered-then-in-view refresh for live figures over withholding the whole
surface for a request-time stream. Suspense fallbacks follow the loading
primitive contracts: content-shaped regions reserve their geometry with
`Skeleton`, while `LoadingLabel` is only compact inline status. In route
handlers that must remain dynamic, call `connection()` before reading secrets
or environment state.

Do not contort a genuinely dynamic screen into a fake static shell. Record the
chosen mode and a one-line justification in the route classification file.

Content aligned with a frame aligns inside that frame. A row of sibling cards
shares one internal content plane even when labels or controls differ in height;
mixed-height headers must reserve space instead of pushing figures up and down.
The planner KPI label row is the reference implementation of this invisible
grid principle.
