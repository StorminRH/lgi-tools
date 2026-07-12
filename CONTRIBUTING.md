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
between them is **enforced in CI** by `pnpm fallow` (the zones and rules live in
[`.fallowrc.json`](.fallowrc.json)), so a violating import fails the build:

- `src/features/<name>/` — self-contained feature slices (their own
  `components/`, `schema.ts`, `queries.ts`, `types.ts` as needed). **Two features
  never import from each other.**
- `src/data/` — shared data layers (EVE SDE, market prices, telemetry). A data
  slice **never imports a feature**, and two data slices never import each other.
  Cross-slice composition lives in a layer *above* both.
- `src/components/ui/` — domain-agnostic UI primitives. These accept abstract
  `tone` props (`green`, `red`, …); only feature-level style maps know that, say,
  "C5 is red". UI primitives import only from `src/lib`.
- `src/lib/` — cross-cutting helpers importable from anywhere; `lib` imports only
  `lib`, never a feature, data, or ui module.
- `src/app/` — routes and API handlers. `convex/` — the live reactive backend
  (see below).

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

- **Static by default.** Every route prerenders a static shell; only genuinely
  request-time data (search params, cookies/session, per-request DB) streams in
  from a `<Suspense>` boundary. Cache global, slow-changing reads with the
  `'use cache'` directive (plus `cacheLife`/`cacheTag`).
- **Live per-character state lives in Convex**, not Postgres. Postgres (via
  Drizzle) is authoritative for global/shared data; Convex is the derived,
  regenerable store for live per-character data (skills, industry jobs), which the
  browser subscribes to directly.

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
  danger) × `size` (md / sm). A link or anchor that must look like a button borrows
  the exported `buttonVariants` as its `className` rather than restyling it.
- **Input / Select / Textarea** (`@/components/ui/input`) — the engraved inset-well
  fields. A raw `<select>` is banned (use `Select`, whose own native `<select>`
  lives in the exempted `input.tsx`); an ad-hoc `inputClass`-style field constant is
  banned (the primitives own the field look). The native checkbox stays native.

## UI components & overlays

Interactive UI is built on adopted libraries, each **wrapped once in
`src/components/ui/`** as a tone-prop primitive and consumed from features via
`@/components/ui/*` — a feature never imports the raw library:

- **Overlays** (tooltip / popover / dialog / menu / nav) → Base UI
  (`@base-ui/react`).
- **Toasts** → sonner, through `components/ui/toast.tsx` (the only sonner
  importer).
- **Node graphs** → React Flow; **drag / reorder** → dnd-kit; **charts** → visx.

Style className-first with tone tokens (no inline `style` — see [Security &
CSP](#security--csp)). Configure each library's built-in dismiss / focus /
keyboard behavior rather than re-implementing it. When adding a route — including
a sandbox demo — register it in `scripts/route-classification.json`.

## Architecture invariants

These are load-bearing constraints, several **lint-enforced**:

- **API contracts.** Every input-accepting JSON route validates with a Zod schema
  in the **route handler** (not in queries). The schema and the route's response
  types live in the owning slice's `api-contract.ts`; clients call `apiFetch`
  (`src/lib/api-client.ts`) with that slice's endpoint object — never a raw
  `fetch('/api/…')`.
- **Server env.** Read server-side env through `readEnv`/`requireEnv`
  (`src/lib/env.ts`), the one validated registry — never `process.env` directly.
  (`NODE_ENV` and `NEXT_PUBLIC_*` stay direct reads.)
- **The ESI gate.** Every call to EVE's ESI API routes through the single
  `esiFetch` in `src/lib/esi/` and its shared rate-limit budget — never a second
  wrapper. Build URLs with `esiUrl()`.
- **One source of truth for config.** Postgres enums are driven from TypeScript
  `as const` arrays; types/variants are constants defined in one place. Adding one
  is a config change, not a code change.

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
   `typecheck`, `lint`, `test`, and `fallow` (the static-analysis gate: dead code,
   duplication, complexity, architecture boundaries). CI runs the same gates plus
   a route-classification presence check (`assert:routes-present`).
3. Fill in the PR template's **test plan** — what you verified and how.
4. Reference the issue the PR resolves (e.g. `Fixes #123`).

## Conduct, security & license

- This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).
- To report a security vulnerability, see [SECURITY.md](SECURITY.md) — please
  **don't** open a public issue for it.
- LGI.tools is [MIT](LICENSE) licensed; contributions are made under the same
  license.
