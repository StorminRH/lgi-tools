# Application source

Zone imports are owned by `.fallowrc.json`. This file is only the landmines
that lint, Fallow, and nearby code do not catch. Do not grow it.

- Session advisory locks use a reserved direct, unpooled connection and must
  release in `finally`. Never hold a transaction or pooled connection across a
  network call.
- A new user- or character-keyed Neon table needs a purge contributor or an
  explicit retained exemption. The checks live in
  `src/esi-datasets/dataset-declarations.test.ts`.
- Routes without a JSON or form body declare exactly one own-line marker:
  `// input: none`, `// input: query`, or `// input: path`. Body-consuming
  routes carry none of them.
- One Better Auth user is one human. Linked EVE characters are account rows.
  EVE SSO is the only login. Keep Better Auth `encryptOAuthTokens` off —
  application AES-256-GCM already wraps EVE tokens.
- Before placing data in Convex, read `docs/CONVEX.md`. Neon is the source of
  truth; Convex is a live projection plus a narrow mapper exception.
- An informational `(?)` hint is a Popover with `openOnHover`, not a Tooltip.
  Base UI Tooltip does not open on touch.
- Runtime-dynamic CSS: set a custom property with
  `ref.current.style.setProperty(...)` after mount. Do not bring back a
  nonce-based Content Security Policy — it forces every route dynamic.
- Register every new page in `scripts/route-classification.json`. Prefer a real
  static shell with request data in the smallest `<Suspense>` hole; do not wrap
  a fully dynamic screen in a fake shell. `pnpm verify` does not check this; CI
  does.
- When replacing an interaction, ship the new one and delete the old in the
  same change.
