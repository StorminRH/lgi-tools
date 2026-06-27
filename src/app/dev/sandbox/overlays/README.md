# Base UI overlay conventions — captured in OOB.2.1

This throwaway sandbox (`/dev/sandbox/overlays`) proves the Base UI idioms the real
`components/ui` overlay primitives (OOB.2.2–.4) will follow. Read this before building them.

## Package (corrected at install time)

- **Use `@base-ui/react` (latest stable `1.6.0`).** The older `@base-ui-components/react`
  is **deprecated and frozen at `1.0.0-rc.0`** — installing it prints
  `Package was renamed to @base-ui/react`. Subpath imports, one per component:
  `import { Tooltip } from '@base-ui/react/tooltip'` (`/popover`, `/dialog`, `/menu`).
- Peer deps: `react ^17||^18||^19` (React 19.2.4 ✓). `date-fns`/`@date-fns/tz` peers are
  **optional** (date-picker components only) — not needed for these overlays.
- No `transpilePackages` / `serverExternalPackages` — it's an ESM package, bundles natively
  under Next 16 / Turbopack.

## 1. Idiomatic composition (the parts, anchor, dismiss/focus)

Confirmed against the installed `node_modules/@base-ui/react/<part>/index.parts.d.ts`.
Common model: **Trigger is the anchor → Portal (renders into `document.body`) → Positioner
(Floating UI; placement via props `side`/`align`/`sideOffset`/`alignOffset`) → Popup (the
styled surface)**. Dismiss + focus management are built in — configure, don't hand-roll.

| Overlay  | Composition | Driven by |
| -------- | ----------- | --------- |
| Tooltip  | `Provider › Root › Trigger + Portal › Positioner › Popup` | hover / focus; Provider shares one open-delay |
| Popover  | `Root › Trigger + Portal › Positioner › Popup` (`Title`/`Description`/`Close`) | click; Esc + outside-click dismiss; focus moves in, restores to trigger |
| Dialog   | `Root › Trigger + Portal › Backdrop + Popup` (`Title`/`Description`/`Close`) | click; **modal** — focus-trapped, scroll-locked, Esc-to-close. **No Positioner** (a dialog isn't anchored — center it with translate utilities) |
| Menu     | `Root › Trigger + Portal › Positioner › Popup › Item` (`Group`/`GroupLabel`/`Separator`/…) | click; arrow-key navigation + typeahead; select / Esc / outside-click dismiss |

Optional parts available in 1.6.0 and intentionally omitted here (add when a primitive needs
them): `Arrow` (all), `Viewport` (a scrollable/animated content container), `Menu.SubmenuRoot`/
`SubmenuTrigger`, `RadioGroup`/`CheckboxItem`, `Popover.Backdrop`.

## 2. Tailwind v4 / React 19 handling

- Overlays are **client-only** (Portals / context / hooks) → demo files carry `'use client'`.
- **Style every part via `className`** (utility-first). Base UI exposes state as `data-*`
  attributes — target them with Tailwind arbitrary variants:
  - `data-[popup-open]:…` on triggers, `data-[highlighted]:…` on menu items,
  - `data-[starting-style]:…` / `data-[ending-style]:…` to drive enter/exit transitions
    (the recommended animation idiom — no keyframes), paired with
    `origin-[var(--transform-origin)]` (a custom property Base UI sets on the popup).
- Tailwind v4 auto-scans `src/**`, so sandbox classes are picked up with **no config change**.
- Stay in-aesthetic with the existing tone tokens (`bg-tooltip`, `bg-surface-raised`,
  `border-border-active`, `text-isk`, `text-muted`, `bg-row-hover`, …) — no new palette.

## 3. Does our primitive code emit inline `style`? → NO — so OOB.2.2–.4 need NO lint exemption

- We style **only** via `className`. Base UI's **Positioner computes placement with Floating UI
  and writes the resulting `position`/`top`/`left`/`transform` + custom props
  (`--transform-origin`, `--available-width`, …) to the positioner element's own `style` at
  runtime** — our JSX passes no `style` attribute. (Positioner *has* an optional `style` prop;
  we don't use it.)
- ⇒ The house-style JSX `style`-attribute lint ban (`eslint.config.mjs` `cspSelectors`, which
  still applies under `src/app/dev/**`) is **not tripped by our code**. A green `pnpm lint` on
  this harness is itself the proof: **no exemption to add** in OOB.2.2–.4.
- The runtime inline `style` Base UI injects is permitted by the post-OOB.1.1 CSP
  (`style-src 'self' 'unsafe-inline'`, `src/proxy.ts`) → renders **CSP-clean**. (Under the old
  nonce CSP this would have violated `style-src`; the OOB.1.1 relaxation is what unblocks Base UI.)
