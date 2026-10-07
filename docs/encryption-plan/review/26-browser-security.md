# Part 26: Browser security on lgi.tools: CSP, scripts and key handling

**Status:** Draft for owner review

## In one paragraph

Once browsers hold unlocked keys, any script on lgi.tools can use them. Everything stays on one domain (README), so every page should follow the same stricter rules. This part makes the script policy strict and keeps today's style policy. It removes Speed Insights, adds Trusted Types, and puts all key handling in one crypto worker. Next.js 16.3.4's SRI hashes cover script files but not the inline data scripts, so SRI alone cannot remove `'unsafe-inline'`. Nonces can, but they make every page dynamic and drop the prefetched shells that make navigation instant. The recommendation is nonces plus SRI only if staging shows no visible change on navigation; otherwise keep `'unsafe-inline'` scripts and adopt the rest. Nothing new is shown to users.

## How it works today

- `src/proxy.ts` sets the CSP on each page response. The matcher skips `/api`, `_next/static`, `_next/image`, the icons and prefetch requests. The policy is `script-src 'self' 'unsafe-inline'` (plus `'unsafe-eval'` in development) and `style-src 'self' 'unsafe-inline'`. It allows `img-src` from `images.evetech.net`, and `connect-src` to `'self'`, `login.eveonline.com`, `*.vercel-insights.com` and the Convex origin (https and wss). It sets `frame-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `base-uri 'self'`, `object-src 'none'` and `upgrade-insecure-requests`. There is no nonce, no `worker-src`, no Trusted Types and no violation reporting.
- `next.config.ts` adds HSTS (preload), `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a permissions policy. `cacheComponents`, `partialPrefetching` and `experimental.instantInsights` are on, so pages are served from prerendered static shells and navigations are instant. `build:vercel` runs `scripts/assert-route-classification.mjs` against `scripts/route-classification.json`, which expects 28 partial and 7 static routes. `experimental.sri` is not set.
- `src/app/layout.tsx` renders `<SpeedInsights />` from `@vercel/speed-insights` 2.0.0 on hosted Vercel builds. In production it loads `/_vercel/speed-insights/script.js` from the same origin. So the `*.vercel-insights.com` entry in `connect-src` looks unused today. Fonts come through `next/font/google`, hosted on lgi.tools at build time.
- `src/components/composition/SignedInFold.tsx`, used by `HomeDashboard.tsx`, renders an inline `<script>` in server HTML. It reads `localStorage` before first paint, so returning pilots never see visitor content flash. `JsonLd.tsx` emits `application/ld+json`, which is data, not script.
- Two libraries add `<style>` elements at runtime: `sonner` (`__insertCSS` in `node_modules/sonner/dist/index.mjs`, wrapped by `src/components/ui/toast.tsx`, with overrides in `toast.css` that rely on sonner's unlayered CSS), and Base UI's Select popup (`src/components/ui/select.tsx`; `styleDisableScrollbar.getElement(nonce)` in `@base-ui/react/select/popup/SelectPopup.mjs`).
- `eslint.config.mjs` already bans `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML` writes and JSX `style` attributes. A search of `src` finds no `eval`, `new Function` or `next/script`.
- There is one worker: `src/mapper/layout/use-layout-kernel.ts` calls `new Worker(new URL('./layout.worker.ts', import.meta.url))`. Turbopack rewrites this: its runtime starts a shared worker entry chunk with a `#params=` list of chunk URLs, forces a classic worker (`type: undefined`), and loads the chunks with `importScripts`. Nothing uses IndexedDB.
- No browser code calls `login.eveonline.com`.
- With nonces, Next.js adds a nonce to its own scripts and styles, but nonces need dynamic rendering and do not work with partial prerendering or CDN caching (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`). With SRI, Next.js hashes script files (`server/app-render/required-scripts.js`). The inline `self.__next_f.push(...)` data scripts get only a nonce, never a hash (`server/app-render/use-flight-response.js`).

Files: `src/proxy.ts`, `next.config.ts`, `scripts/route-classification.json`, `src/app/layout.tsx`, `src/components/composition/SignedInFold.tsx`, `src/components/ui/toast.tsx`, `src/components/ui/select.tsx`, `eslint.config.mjs`, `src/mapper/layout/use-layout-kernel.ts`, `node_modules/next/dist/server/app-render/use-flight-response.js`.

## What changes

- The script policy becomes strict: no `'unsafe-inline'` or `'unsafe-eval'` (subject to Question 1). The style policy stays as today.
- Speed Insights and its package are removed, with unused `connect-src` origins.
- Trusted Types run in report-only mode, enforced only once staging is clean.
- A crypto worker becomes the only code that touches keys. It also verifies the attestation.
- Users see nothing different.

## Design

### Script policy: what the SRI evaluation found

| Option | Static shells kept | Removes `'unsafe-inline'` scripts | Notes |
|---|---|---|---|
| SRI only | Yes | No | Inline data scripts carry no hash in 16.3.4, so a strict `script-src` would block them |
| Nonces plus SRI (default if the gate passes) | No: the root layout calls `connection()` | Yes | All 35 classified routes become dynamic. Every HTML request and soft navigation waits for an `iad1` render; prefetched shells are gone |
| Keep `'unsafe-inline'` scripts, add the rest | Yes | No | Default if nonces cost visible time |
| Nonces only on signed-in pages | Partly | Partly | Rejected: one origin shares IndexedDB, so an injection on a public page reaches the same keys |

The nonce switch must update `scripts/route-classification.json` in the same commit (28 partial and 7 static become dynamic), or the Vercel build fails.

### Target production policy

```
default-src 'self';
script-src 'nonce-{n}' 'strict-dynamic';
script-src-attr 'none';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data: https://images.evetech.net;
font-src 'self';
connect-src 'self' https://{convex} wss://{convex};
worker-src 'self';
manifest-src 'self';
frame-src 'none'; frame-ancestors 'none'; object-src 'none';
form-action 'self'; base-uri 'none';
require-trusted-types-for 'script';
trusted-types default;
upgrade-insecure-requests;
report-uri /api/csp-report;
report-to csp
```

- `Reporting-Endpoints: csp="/api/csp-report"` is sent with the CSP. `report-uri` is the fallback for Firefox and Safari.
- The nonce is 128 random bits, made fresh per request in `src/proxy.ts` and passed by the `x-nonce` request header, as in the Next.js guide. Development keeps its own looser policy (`'unsafe-eval'`, overlay styles).
- `style-src` keeps `'unsafe-inline'` with no nonce (a nonce would disable it). CSS injection needs HTML injection first, which escaping, the lint bans and the script policy block. Sonner, Base UI and `toast.css` work unchanged.
- The sealed service is reached through Convex (Part 07), so no AWS origin is needed.
- The report route stores the directive, the blocked origin and the route pattern only (Part 29).
- Worker scripts take their CSP from their own response. `next.config.ts` gives `_next/static` worker files `default-src 'none'; script-src 'self'`. Worker chunks still load through `importScripts`, and `connect-src` stays `'none'`, so the crypto worker cannot fetch.
- After SRI is enabled, add `Integrity-Policy` where browsers support it. Re-check inline-script hashing on each Next.js upgrade; a future release may make SRI enough.

### Trusted Types

Turbopack, not app code, calls the Worker and script sinks, so a named app policy would never be consulted. One `default` policy covers everything:

| Sink | Rule |
|---|---|
| `createScriptURL` | Accept only same-origin `/_next/static/` URLs. For a worker entry URL, parse `#params` and require every chunk path to be under `/_next/static/chunks/` |
| `createHTML`, `createScript` | Always throw |

The policy is registered in a nonced inline `<head>` script emitted before the Next.js runtime, so it exists before the first dynamic chunk loads. Run report-only on staging. Enforce only if staging shows zero reports. Browsers without Trusted Types ignore the directive.

### What breaks and the fix

| Item | Problem under the new policy | Fix |
|---|---|---|
| `SignedInFold` inline script | No nonce, so it is blocked and returning pilots see the visitor fold flash | `HomeDashboard` (a server component) reads `(await headers()).get('x-nonce')` and passes it as a prop to `<script nonce>`. Playwright on staging checks a returning session sees no flash |
| Route classification | 35 routes turn dynamic and the build check fails | Update `scripts/route-classification.json` in the same commit |
| Static shells and instant navigation | Lost under nonces | Staging timing gate (Assumptions, Question 1) |
| Layout and crypto workers | `importScripts` needs `script-src` in the worker policy | Worker policy allows `script-src 'self'` |
| Speed Insights | Vendor code on pages that hold keys | Remove the component and package |
| `*.vercel-insights.com`, `login.eveonline.com` in `connect-src` | Look unused | Confirm with CSP reports on staging, then remove. Login is a navigation |
| Sonner, Base UI Select | Runtime `<style>` | No change under the recommended style policy. If strict styles are chosen: Base UI `CSPProvider` with the nonce or `disableStyleElements` plus the `.base-ui-disable-scrollbar` rule in `globals.css`; a sonner patch and a `toast.css` cascade check |
| `JsonLd.tsx` | Data block, not script | None |

### Crypto worker boundary

- **Module:** one dedicated worker (suggested `src/platform/crypto/`), a classic worker as Turbopack builds it. The rest of the app reaches it only through one small client facade.
- **Enforcement:** Fallow boundaries check imports only, so globals need lint. An ESLint `no-restricted-properties` / `no-restricted-globals` rule bans `crypto.subtle` and `indexedDB` outside `src/platform/crypto/`. A Fallow boundary lets only the crypto-worker zone import `src/lib/seal/` from browser code; the enclave image imports it too (Part 09).
- **Work it does:** makes the browser session key and PKCE verifier, verifies the attestation (Part 06), opens login replies, unwraps map keys as non-extractable, seals and opens content, and wipes keys (Part 09).
- **Data in and out:** the main thread sends ciphertext and receives plaintext. It never receives key bytes. The worker alone reads and writes the `lgi-keys` IndexedDB store.
- **No empty frames:** the main thread keeps a memory-only plaintext memo keyed by row ID, version and key epoch. It renders the last plaintext until the new decrypt resolves, and batches each Convex update into one worker message. So remounts look as they do today with Convex `useQuery`.
- **Raw bytes:** where the HPKE library allows, the user key is opened straight into `unwrapKey` / `importKey` and never sits in a JS buffer. Otherwise zeroing is best effort only: the library and engine may copy buffers and the garbage collector can move them.
- **Attestation code:** pure TypeScript with exact-pinned CBOR and X.509 parsing, the AWS Nitro root certificate bundled at build time, tested against recorded AWS documents (Part 32).
- **Fingerprints:** the bundled `sealed-service/fingerprints.json` is the starting list. On an unknown fingerprint the worker refetches `lgi.tools/sealed/fingerprints.json` once and retries (Part 06), so a tab open for days survives an enclave release. Same trust as the bundle, since one deployment serves both.
- **Dependencies:** a short, pinned list: HPKE over WebCrypto, CBOR and X.509. No WebAssembly, so no `'wasm-unsafe-eval'`.

The worker keeps key bytes from page script. It is not a wall against XSS: injected script can message it as the app does.

### XSS: the main browser risk

Injected script, including from a compromised dependency, could use the unlocked keys through the worker, read decrypted content and send data out through `'self'` or Convex, within the session. It could not export key bytes, reach other users' keys, see EVE tokens or outlast sign-out. The defences are React escaping, the lint bans, Trusted Types, the strict script policy and a short worker dependency list.

### What the browser takes on trust

Vercel serves the attestation code, the fingerprint list, the root certificate and the CSP header. Whoever controls that deployment could ship code that leaks keys after login. Public builds (Part 27) make that detectable, not preventable.

## Data: readable vs encrypted

| Data item | Stays readable on LGI servers | Encrypted | Where computed |
|---|---|---|---|
| CSP header and nonce | Yes | No | LGI server (`src/proxy.ts`) |
| SRI hashes, fingerprint list, AWS root certificate | Yes (public) | No | Build in CI; checked in the browser |
| CSP and Trusted Types violation reports | Yes (route pattern, directive, origin) | No | LGI server |
| Attestation document | Passes through Convex | No (public proof) | Verified in the browser |
| Browser session key | Public halves only (Part 07) | Private halves never leave the browser | Browser |
| User key and map key epochs in the browser | No | Yes on servers. Non-extractable in IndexedDB | Browser |
| Decrypted content and plaintext memo | No | Yes on servers | Browser memory only |
| Speed Insights data | Removed | — | — |

## Hard rules

1. [Agreed] Everything stays on lgi.tools.
2. [Proposed] Every page follows the same production policy. No per-page exceptions.
3. [Agreed] Users see no new prompts, banners or encryption copy from this work.
4. [Proposed] No third-party or vendor-injected script on any page. Speed Insights is removed.
5. [Proposed] Production `script-src` allows no `'unsafe-inline'` or `'unsafe-eval'` (if Question 1 accepts nonces). `style-src` stays `'self' 'unsafe-inline'` with no nonce.
6. [Proposed] `connect-src` lists only `'self'` and the Convex origin. Adding an origin needs owner approval.
7. [Proposed] The production policy is enforced before the first release that puts a key in a browser (Phase 1, Part 30).
8. [Proposed] Only `src/platform/crypto/` uses `crypto.subtle` or `indexedDB`, enforced by ESLint. Only the crypto-worker zone imports `src/lib/seal/` from browser code, enforced by Fallow (matching Part 09). The worker never posts key bytes.
9. [Proposed] Worker scripts are served with `default-src 'none'; script-src 'self'`.
10. [Proposed] The only Trusted Types policy is a narrow `default`, registered first in `<head>`. It rejects HTML and script strings.
11. [Proposed] The existing lint bans stay, plus no `eval`, `new Function`, `next/script` or un-nonced inline `<script>` in app code.
12. [Proposed] Any CSP or Trusted Types violation fails the Playwright smoke run on staging, detected by `securitypolicyviolation` listeners in the page as well as reports.
13. [Proposed] Violation reports carry no character, map or account IDs and no full URLs.
14. [Proposed] On an unknown fingerprint the worker refetches the list from lgi.tools once before failing.
15. [Proposed] No WebAssembly in the browser. Worker dependencies are exact-pinned. The AWS root certificate and starting fingerprint list are bundled at build.
16. [Proposed] Development keeps its own looser policy; production headers never carry its allowances.
17. [Proposed] The nonce switch updates `scripts/route-classification.json` in the same commit. Inline-script hashing is re-checked on each Next.js upgrade.
18. [Proposed] Decrypts never show an empty frame: the main thread renders its memory-only plaintext memo until the new decrypt resolves.

## Assumptions

| Assumption | How to check |
|---|---|
| SRI in 16.3.4 does not hash inline data scripts | Re-read `use-flight-response.js` after each upgrade. Load a page on staging with SRI and `script-src 'self'` |
| Nonces cost no visible time | On staging, compare before and after: TTFB and LCP, soft navigation (click to content) from a non-US location, and cold loads of the public `/sites` pages. Local production builds are not run (AGENTS.md) |
| `next.config.ts` headers reach `_next/static` worker files on Vercel | Inspect response headers on staging |
| Worker chunks load under the worker policy | On staging, open a chain-layout map and log in |
| Turbopack chunk loading passes the `default` policy | Trusted Types report-only on staging |
| Runtime style injectors are Sonner and Base UI Select | CSP reports during the staging smoke run |
| `login.eveonline.com` and `*.vercel-insights.com` are unused in `connect-src` | CSP reports on staging, then remove and run the login journey |
| Trusted Types are supported in current Chromium, Firefox and Safari | Check current support. Browsers without it still get the CSP |

Part 32 should add: no fold flash for a returning session, no empty frame on map remount, and a long-lived tab across an enclave release.

## What users see

Nothing new. Pages, toasts, select popups and timings stay as they are. Speed Insights was never visible.

## Questions for the owner

1. **Nonces or keep `'unsafe-inline'` scripts?** Recommended: nonces on every page with SRI also on, only if staging shows no visible change on navigation (the gate). If it fails, keep `'unsafe-inline'` scripts with everything else, and re-check on each Next.js upgrade.
2. **Strict styles?** Recommended: no. Keep `style-src 'self' 'unsafe-inline'`. Strict styles need a sonner patch, Base UI nonce plumbing and a `toast.css` cascade check for little gain.
3. **Trusted Types: report-only or enforced?** Recommended: report-only, enforced only if staging shows zero reports.
4. **Replace Speed Insights?** Recommended: send Web Vitals through the existing first-party telemetry, with route patterns only, so the timing checks have data.
