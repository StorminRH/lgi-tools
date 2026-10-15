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
- Render code never reads the clock. A read while a page prerenders or
  prefetches fails the render, and a per-link prefetch only fails in
  `next dev`. A Server Component awaits `requestNow()` inside `<Suspense>`;
  a Client Component shows the time once hydrated (`useHydrating`, then
  `useNow`, as `PriceUpdateAge` does). `render-clock/no-read` catches direct
  reads but not a helper that reads the clock for its caller, so helpers
  take `now` as a parameter.
- App-wide client state that changes after load (session, preferences)
  goes in a `createClientStore` read with `useClientStore`, never a
  context value. Next wraps each route segment in an Activity boundary that
  hydrates after the root, and a context change reaching it throws its server
  HTML away (React #418 or a silent re-render).
- An EVE-data page shows the stored copy at once and streams the newer
  data in. Its server read (`*OnView`, or the structures page data) returns
  `refreshing` from `refreshDue`, its endpoint's 200 body declares
  `refreshing: z.boolean()`, and its client hook is built on
  `useLiveDataset`, which checks back on the shared schedule until the
  refresh lands. Never read such an endpoint with your own `apiFetch`;
  `src/esi-datasets/live-readers.test.ts` pins the set.

## Styling

- Keep Tailwind setup, tokens, shared utilities, and document rules in
  `app/globals.css`.
- Style reusable UI in `components/ui`; keep one-off styles with their owner.
  Prefer Tailwind utilities. Extract shared UI for a real second consumer.
- Put rules that need CSS in a sibling `<owner>.css` and import it from
  `app/globals.css`. Preserve cascade order and layer placement when moving rules.
  Keep React Flow, Sonner, and runtime class names literal.
