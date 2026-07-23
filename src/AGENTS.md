# Source-level UI and rendering guidance

This file extends the root `AGENTS.md` for work under `src/`. Apply the UI-specific sections when changing TSX, CSS, `*-styles.ts`, UI primitives, or interactive behavior. For non-UI source work, keep only the relevant routing, rendering, and security constraints in scope.

## Interactive UI

Use the already-adopted library for each interaction category. Do not hand-roll behavior that the library provides, and do not add a competing library without explicit written justification.

For every interactive primitive:

1. Confirm the installed library's current API with the `find-docs` skill/Context7.
2. Compose the library's documented parts and preserve its native dismiss, focus, keyboard, touch, stacking, pan, or drag behavior.
3. Wrap the library once in `src/components/ui/` as a domain-neutral primitive with abstract props such as `tone="green"`.
4. Import the wrapper through `@/components/ui/*`; feature code never imports the raw library.

Adopted categories:

- Overlays, dialogs, popovers, menus, and navigation: Base UI from `@base-ui/react`, never the deprecated `@base-ui-components/react`. The existing wrapper files are the only Base UI import seam. Require `label` on popover/menu/navigation triggers; dialogs use `labelledBy`.
- Toasts and transient status: sonner through `src/components/ui/toast.tsx`, the only sonner importer and owner of the root `<Toaster>` configuration.
- Charts: visx plus the house CSSOM pattern. Charts are not part of the overlay-wrapper category.
- Fixed-layout trees: keep using `trees/flow/FlowExplorer.tsx`.
- Future free-form mapper: React Flow v12 (`@xyflow/react`), reinstalled only when the mapper lands on a real route.
- Future drag/reorder: classic dnd-kit packages. Give every `<DndContext>` a stable explicit `id` to prevent SSR `aria-describedby` hydration drift, and apply transforms through CSSOM rather than JSX `style`.

The Base UI wrapper allowlist and sole sonner owner are lint-enforced through
scoped `no-restricted-imports` rules; do not widen those exemptions inline.

Keep `Collapsible` as a pure `<details>/<summary>` primitive with native open
state.

## Styling and security

Prefer `className` with Tailwind and established tokens. JSX `style` is lint-banned as house style, not by CSP. Runtime-dynamic values use a CSS custom property set after mount with `ref.current.style.setProperty(...)`, consumed by a stylesheet rule.

Library-owned inline placement/transform styles inside `node_modules` require no lint exemption. Production intentionally allows `style-src 'unsafe-inline'`; do not reintroduce a nonce-based CSP because it blocks static rendering. `script-src 'unsafe-inline'` supports Next App Router's inline RSC flight scripts.

Never use `dangerouslySetInnerHTML` or write `innerHTML`/`outerHTML`. Render text through JSX or construct DOM with `textContent`/`createElement`.

Preferred patterns:

- Static values: Tailwind utilities, including arbitrary structural values when appropriate.
- Runtime values: stylesheet class plus a CSS custom property set through CSSOM.
- Colors: named `--color-*` tokens in the `@theme` block of `globals.css`, or `src/components/ui/tones.ts` for SVG fill/stroke values exposed through `toneHex`.

Do not hardcode raw hex at call sites, interpolated class strings, or SVG attributes. `tones.ts` and `src/app/preview` are deliberate raw-hex lint exemptions; raw `rgba()` is restricted everywhere in source and belongs in the `globals.css` token layer. Reuse the semantic type, tracking, radius, motion, stacking, elevation, icon-size, button, field, and card tokens/primitives already defined by the component system.

Preserve the terminal/EVE visual identity. A new tone, palette, or typeface needs explicit written justification.

## UI system reference

Use the domain-neutral wrappers in `src/components/ui/` for Field, Checkbox, RadioGroup, SegmentedControl, Tabs, Tooltip, Kbd, CopyButton, Skeleton, Banner, Pagination, and ConfirmDialog. Feature code supplies domain meaning and content; wrappers own interaction semantics and shared appearance.

Exercise new supported states on the admin-gated `/preview/primitives` reference page when they lack an immediate production consumer. Keep the page out of public navigation, preserve its server-side admin check inside a Suspense request-time hole, and register its render mode in `scripts/route-classification.json`.

## Accessibility behavior

Keep the behavior provided by idiomatic Base UI composition: focus management, scroll locking, Escape, outside-press dismissal, keyboard operation, and touch opening. Formal axe/ARIA auditing is deferred to a dedicated pass, but functional keyboard/touch behavior must not regress.

Choose the primitive that matches the affordance. An informational `(?)` hint is a Popover with `openOnHover`, not a Tooltip: Base UI Tooltip does not open on touch and does not provide the required described-by behavior for this use.

## Migration and verification

When replacing an existing interaction, build the library-backed equivalent to appearance-and-behavior parity, verify it on the real route, then delete the old implementation in the same change. Do not keep parallel primitives.

Use the `ux-check` skill for changed routes. The standard sweep captures closed states; dialogs, popovers, menus, toasts, and other interactions need an appropriate Playwright definition from `docs/ux-check/probes/`, run through the shared probe runner. Keep open-state probes functional and CSP-focused. The operator's browser review remains the final visual/feel check.

## Routes and render modes

Register every new page—including previews or demos—in both maps in `scripts/route-classification.json`. `pnpm verify` does not run `assert:routes-present`; CI does, and the post-merge Vercel production build checks the actual render classification. Never run a production-mode build locally or before merge; reason about the expected mode and verify behavior through local dev instead.

Choose the most static honest mode:

1. Fully static (`○`) when the page needs no request-time state.
2. Static shell with request-time work isolated in a `<Suspense>` hole (`◐`).
3. Fully dynamic (`ƒ`) only when the entire surface is genuinely request-specific.

Cache global, slow-changing reads with `'use cache'`, `cacheLife`, and
`cacheTag`; do not use `unstable_cache` or `experimental.useCache`. Keep request
data inside Suspense children. In route handlers that must remain dynamic, call
`connection()` before reading secrets or environment state.

Do not contort a genuinely dynamic screen into a fake static shell. Record the
chosen mode and a one-line justification in the route classification file.
