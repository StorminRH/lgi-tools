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
