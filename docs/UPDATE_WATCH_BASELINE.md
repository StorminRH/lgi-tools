# Update-watch baseline

This file records what the operator has **acknowledged**, never what is
installed — `package.json` remains the sole owner of installed state. The
daily report-only update-watch routine compares live state against this
baseline through `.agent-local/update_watch_collect.py` and opens a GitHub
digest issue only for deltas that are neither acknowledged here nor already
reported in an open digest issue. The routine has no write path to this file;
every update is manual absorption during a normal session.

## Delta model (identity-first)

- A dependency delta exists when the npm registry's latest major for a
  dependency exceeds its `acknowledgedMajor` — the highest major the operator
  has consciously seen announced, which may exceed the installed major.
- An advisory delta exists when `pnpm audit` reports an advisory whose id is
  not in `acknowledgedAdvisories`, or whose observed applicability differs
  from the recorded `appliesTo` — a vulnerability reintroduced by downgrade or
  dependency change surfaces again instead of staying suppressed.
- A service/EVE announcement is a delta iff its canonical id is not in its
  source's `acknowledgedItems` and not reported in an open digest issue.
  Dates never decide identity.
- `idRule` names the per-source canonical-id extraction from the shared source
  registry owned by the collector (`.agent-local/update_watch_collect.py`);
  URL-derived ids are canonicalized (lowercase scheme/host, strip
  query/fragment/trailing slash).

## Discovery window and absorption

`scanSince` bounds discovery only. An item is in-window when its as-published
date is on or after `scanSince` (inclusive; source-published dates taken
as-is). Undated or backdated items on a watched page are always in-window —
identity alone decides them, so an announcement stamped earlier than its
appearance still surfaces.

**Absorption invariant:** `scanSince` may advance only when every currently
in-window item for that source is in `acknowledgedItems`. Partial absorption
keeps the window. To absorb a digest issue: add each reported item's canonical
id to its source's `acknowledgedItems` (or raise the relevant
`acknowledgedMajor` / add the advisory with its observed applicability), close
the issue, and only advance `scanSince` after confirming nothing in-window
remains unacknowledged. This invariant cannot be verified against live pages
by the checker; it is owned by this procedure.

The baseline below was seeded from a manual sweep of every registry source on
2026-07-19. The feed-backed sources' items all predate the sweep and are
dated, so those `acknowledgedItems` lists start empty. The EVE developer
documentation source instead watches the rendered docs sitemap's URL set —
cloud-session GitHub egress is scoped to the routine's own repository, and
the MkDocs sitemap build-stamps every page's lastmod — so its baseline
acknowledges all 81 page URLs present at sweep time: new or removed pages
surface by identity, while in-place edits are a documented non-signal (the
dev blog announces material ESI changes). The advisory list records the five
findings `pnpm audit` reported that day (all in transitive development
tooling).

```update-watch-baseline
{
  "dependencies": {
    "@base-ui/react": { "acknowledgedMajor": 1 },
    "@convex-dev/rate-limiter": { "acknowledgedMajor": 0 },
    "@convex-dev/workpool": { "acknowledgedMajor": 0 },
    "@edge-runtime/vm": { "acknowledgedMajor": 5 },
    "@neondatabase/config": { "acknowledgedMajor": 0 },
    "@neondatabase/serverless": { "acknowledgedMajor": 1 },
    "@shikijs/langs": { "acknowledgedMajor": 4 },
    "@shikijs/themes": { "acknowledgedMajor": 4 },
    "@tailwindcss/postcss": { "acknowledgedMajor": 4 },
    "@types/node": { "acknowledgedMajor": 26 },
    "@types/react": { "acknowledgedMajor": 19 },
    "@types/react-dom": { "acknowledgedMajor": 19 },
    "@types/yauzl": { "acknowledgedMajor": 3 },
    "@upstash/ratelimit": { "acknowledgedMajor": 2 },
    "@upstash/redis": { "acknowledgedMajor": 1 },
    "@vercel/speed-insights": { "acknowledgedMajor": 2 },
    "@visx/event": { "acknowledgedMajor": 4 },
    "@visx/scale": { "acknowledgedMajor": 4 },
    "@visx/shape": { "acknowledgedMajor": 4 },
    "@visx/tooltip": { "acknowledgedMajor": 4 },
    "@vitest/coverage-istanbul": { "acknowledgedMajor": 4 },
    "better-auth": { "acknowledgedMajor": 1 },
    "class-variance-authority": { "acknowledgedMajor": 0 },
    "clsx": { "acknowledgedMajor": 1 },
    "concurrently": { "acknowledgedMajor": 10 },
    "convex": { "acknowledgedMajor": 1 },
    "convex-test": { "acknowledgedMajor": 0 },
    "dotenv": { "acknowledgedMajor": 17 },
    "drizzle-kit": { "acknowledgedMajor": 0 },
    "drizzle-orm": { "acknowledgedMajor": 0 },
    "eslint": { "acknowledgedMajor": 10 },
    "eslint-config-next": { "acknowledgedMajor": 16 },
    "eslint-import-resolver-typescript": { "acknowledgedMajor": 4 },
    "eslint-plugin-jsdoc": { "acknowledgedMajor": 63 },
    "eslint-plugin-tsdoc": { "acknowledgedMajor": 0 },
    "fallow": { "acknowledgedMajor": 3 },
    "fuzzysort": { "acknowledgedMajor": 3 },
    "google-auth-library": { "acknowledgedMajor": 10 },
    "jose": { "acknowledgedMajor": 6 },
    "next": { "acknowledgedMajor": 16 },
    "playwright": { "acknowledgedMajor": 1 },
    "postgres": { "acknowledgedMajor": 3 },
    "react": { "acknowledgedMajor": 19 },
    "react-dom": { "acknowledgedMajor": 19 },
    "shiki": { "acknowledgedMajor": 4 },
    "sonner": { "acknowledgedMajor": 2 },
    "tailwind-merge": { "acknowledgedMajor": 3 },
    "tailwindcss": { "acknowledgedMajor": 4 },
    "tsx": { "acknowledgedMajor": 4 },
    "typescript": { "acknowledgedMajor": 7 },
    "vitest": { "acknowledgedMajor": 4 },
    "yauzl": { "acknowledgedMajor": 3 },
    "zod": { "acknowledgedMajor": 4 }
  },
  "acknowledgedAdvisories": [
    { "id": "GHSA-g7r4-m6w7-qqqr", "appliesTo": "esbuild@>=0.27.3 <0.28.1" },
    { "id": "GHSA-v6wh-96g9-6wx3", "appliesTo": "vite@>=8.0.0 <=8.0.15" },
    { "id": "GHSA-h67p-54hq-rp68", "appliesTo": "js-yaml@>=4.0.0 <=4.1.1" },
    { "id": "GHSA-fx2h-pf6j-xcff", "appliesTo": "vite@>=8.0.0 <=8.0.15" },
    { "id": "GHSA-4x5r-pxfx-6jf8", "appliesTo": "@babel/core@<=7.29.0" }
  ],
  "services": [
    {
      "name": "Vercel / Next.js",
      "watch": ["https://vercel.com/atom", "https://nextjs.org/feed.xml"],
      "idRule": "url",
      "scanSince": "2026-07-19",
      "acknowledgedItems": []
    },
    {
      "name": "Neon",
      "watch": ["https://neon.com/docs/changelog/rss.xml"],
      "idRule": "url",
      "scanSince": "2026-07-19",
      "acknowledgedItems": []
    },
    {
      "name": "Convex",
      "watch": ["https://news.convex.dev/rss/"],
      "idRule": "url",
      "scanSince": "2026-07-19",
      "acknowledgedItems": []
    },
    {
      "name": "Upstash",
      "watch": ["https://upstash.com/blog/feed.xml"],
      "idRule": "url",
      "scanSince": "2026-07-19",
      "acknowledgedItems": []
    }
  ],
  "eveSurface": [
    {
      "name": "EVE Developers blog",
      "watch": ["https://developers.eveonline.com/feed.xml"],
      "idRule": "url",
      "scanSince": "2026-07-19",
      "acknowledgedItems": []
    },
    {
      "name": "EVE developer documentation",
      "watch": ["https://developers.eveonline.com/docs/sitemap.xml"],
      "idRule": "url",
      "scanSince": "2026-07-19",
      "acknowledgedItems": [
        "https://developers.eveonline.com/docs",
        "https://developers.eveonline.com/docs/community",
        "https://developers.eveonline.com/docs/community/abyss-tracker",
        "https://developers.eveonline.com/docs/community/alliance-auth",
        "https://developers.eveonline.com/docs/community/django-esi",
        "https://developers.eveonline.com/docs/community/dscan-icu",
        "https://developers.eveonline.com/docs/community/dscan-icu/index_cn",
        "https://developers.eveonline.com/docs/community/elt",
        "https://developers.eveonline.com/docs/community/eve-ai-agent",
        "https://developers.eveonline.com/docs/community/eve-api-for-golang",
        "https://developers.eveonline.com/docs/community/eve-api-for-php",
        "https://developers.eveonline.com/docs/community/eve-api-for-typescript",
        "https://developers.eveonline.com/docs/community/eve-auth-for-django",
        "https://developers.eveonline.com/docs/community/eve-auth-for-go",
        "https://developers.eveonline.com/docs/community/eve-auth-for-python",
        "https://developers.eveonline.com/docs/community/eve-buddy",
        "https://developers.eveonline.com/docs/community/eve-esi-proxy",
        "https://developers.eveonline.com/docs/community/eve-kill-com",
        "https://developers.eveonline.com/docs/community/eve-online-sde-documentation",
        "https://developers.eveonline.com/docs/community/eve-preview-manager",
        "https://developers.eveonline.com/docs/community/eve-ref",
        "https://developers.eveonline.com/docs/community/eve-srp",
        "https://developers.eveonline.com/docs/community/eve-sso-for-php",
        "https://developers.eveonline.com/docs/community/eve-workbench",
        "https://developers.eveonline.com/docs/community/eve-wrench",
        "https://developers.eveonline.com/docs/community/eveRwrapper",
        "https://developers.eveonline.com/docs/community/evecia-online",
        "https://developers.eveonline.com/docs/community/evecompanion",
        "https://developers.eveonline.com/docs/community/evemissioneer",
        "https://developers.eveonline.com/docs/community/eveops",
        "https://developers.eveonline.com/docs/community/evepandora",
        "https://developers.eveonline.com/docs/community/eveship-fit",
        "https://developers.eveonline.com/docs/community/innominate-appraisal",
        "https://developers.eveonline.com/docs/community/jeveassets",
        "https://developers.eveonline.com/docs/community/jitaspace",
        "https://developers.eveonline.com/docs/community/killfeed-by-lak-moore",
        "https://developers.eveonline.com/docs/community/localisprimary-esi",
        "https://developers.eveonline.com/docs/community/marquette",
        "https://developers.eveonline.com/docs/community/mutamarket",
        "https://developers.eveonline.com/docs/community/neucore",
        "https://developers.eveonline.com/docs/community/rift-intel-fusion-tool",
        "https://developers.eveonline.com/docs/community/sample-service",
        "https://developers.eveonline.com/docs/community/sde-conversion",
        "https://developers.eveonline.com/docs/community/sde-rest-api",
        "https://developers.eveonline.com/docs/community/seat",
        "https://developers.eveonline.com/docs/community/smt",
        "https://developers.eveonline.com/docs/community/socketkill.com",
        "https://developers.eveonline.com/docs/community/theorycrafter",
        "https://developers.eveonline.com/docs/community/tritanium",
        "https://developers.eveonline.com/docs/community/tritanium/index_cn",
        "https://developers.eveonline.com/docs/community/turtle-alternate-icons",
        "https://developers.eveonline.com/docs/community/ueberauth-eve-online",
        "https://developers.eveonline.com/docs/community/upwell-gg",
        "https://developers.eveonline.com/docs/community/wanderer",
        "https://developers.eveonline.com/docs/community/wormholesystems",
        "https://developers.eveonline.com/docs/community/zkillboard-com",
        "https://developers.eveonline.com/docs/contributors",
        "https://developers.eveonline.com/docs/guides/fitting",
        "https://developers.eveonline.com/docs/guides/glossary",
        "https://developers.eveonline.com/docs/guides/id-ranges",
        "https://developers.eveonline.com/docs/guides/map-data",
        "https://developers.eveonline.com/docs/guides/pi",
        "https://developers.eveonline.com/docs/guides/route-calculation",
        "https://developers.eveonline.com/docs/guides/staticdata",
        "https://developers.eveonline.com/docs/guides/system-security",
        "https://developers.eveonline.com/docs/guides/useful-formulae",
        "https://developers.eveonline.com/docs/menu",
        "https://developers.eveonline.com/docs/resources",
        "https://developers.eveonline.com/docs/resources/license",
        "https://developers.eveonline.com/docs/services/esi/best-practices",
        "https://developers.eveonline.com/docs/services/esi/endpoints",
        "https://developers.eveonline.com/docs/services/esi/overview",
        "https://developers.eveonline.com/docs/services/esi/pagination/cursor-based",
        "https://developers.eveonline.com/docs/services/esi/pagination/from-id",
        "https://developers.eveonline.com/docs/services/esi/pagination/x-pages",
        "https://developers.eveonline.com/docs/services/esi/rate-limiting",
        "https://developers.eveonline.com/docs/services/iec",
        "https://developers.eveonline.com/docs/services/image-server",
        "https://developers.eveonline.com/docs/services/sso",
        "https://developers.eveonline.com/docs/services/static-data",
        "https://developers.eveonline.com/docs/support"
      ]
    }
  ]
}
```

## Seeded state note (3.9.3.5 demonstration)

`clsx` is deliberately acknowledged at major 1 while major 2 is current — the
seeded delta for the routine's demonstration runs. The demonstration's final
step absorbs it back to the true acknowledged major.
