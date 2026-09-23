# Application source

Landmines that lint, Fallow, and nearby tests do not catch.

- Session advisory locks go through `withAdvisoryLock` on the direct
  unpooled client. Never hold that reserved connection across a network
  call.
- One Better Auth user is one human. Linked EVE characters are account
  rows. Leave Better Auth `encryptOAuthTokens` off — application
  AES-256-GCM already wraps EVE tokens.
- An informational `(?)` hint is a Popover with `openOnHover`, not a
  Tooltip. Base UI Tooltip does not open on touch.
- Runtime-dynamic CSS: `ref.current.style.setProperty(...)` after mount.
  Do not add a nonce-based Content Security Policy.
- Pages get a real static shell and put request data in the smallest
  `<Suspense>` hole. Do not wrap a fully dynamic screen in a fake shell.

## Styling

`src/app/globals.css` is the Tailwind compilation root. It holds the Tailwind
import, `@source`, `@theme`, `@utility glass-panel`, `@utility glass-panel-faint`,
the `:root` glass knobs, and document rules (page base, focus ring, the
coarse-pointer control font floor, and the print reset).
`src/app/stylesheet-contract.test.ts` rejects any other class there.

Change a reusable skin on the primitive in `src/components/ui`. Prefer
utilities on that component. When a pseudo-element, keyframe, library DOM node,
or a rule that must beat utilities cannot be a utility, edit the sibling
`.css` and keep its `@import` in `globals.css`.

Style a one-off on the element that wears it, with utilities. When utilities
cannot express the rule, add `<owner>.css` beside that file and `@import` it
from `globals.css` in the sorted position the test prints.

A second consumer of a custom class means a primitive. Add a prop to an
existing `ui` primitive, or create one, and move the rule to its sibling
`.css`. Callers render the primitive.

Do not add a component, feature, or page class to `globals.css`. Do not hash
these sheets with CSS modules. `price-flash`, React Flow selectors, and Sonner
selectors must stay literal.
