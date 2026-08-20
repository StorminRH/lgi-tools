# Update-watch baseline

This file records what the operator has **acknowledged**, never what is
installed — `package.json` remains the sole owner of installed state. The
daily report-only update-watch routine compares live state against this
baseline through `tools/update_watch/update_watch_collect.py` and opens a GitHub
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
  registry owned by the collector (`tools/update_watch/update_watch_collect.py`);
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
    "@edge-runtime/vm": { "acknowledgedMajor": 5 },
    "@neondatabase/config": { "acknowledgedMajor": 1 },
    "@neondatabase/serverless": { "acknowledgedMajor": 1 },
    "@next/playwright": { "acknowledgedMajor": 16 },
    "@playwright/test": { "acknowledgedMajor": 1 },
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
    "@xyflow/react": { "acknowledgedMajor": 12 },
    "better-auth": { "acknowledgedMajor": 1 },
    "class-variance-authority": { "acknowledgedMajor": 0 },
    "clsx": { "acknowledgedMajor": 2 },
    "concurrently": { "acknowledgedMajor": 10 },
    "convex": { "acknowledgedMajor": 1 },
    "convex-test": { "acknowledgedMajor": 0 },
    "dotenv": { "acknowledgedMajor": 17 },
    "drizzle-kit": { "acknowledgedMajor": 0 },
    "drizzle-orm": { "acknowledgedMajor": 0 },
    "eslint": { "acknowledgedMajor": 10 },
    "eslint-config-next": { "acknowledgedMajor": 16 },
    "eslint-import-resolver-typescript": { "acknowledgedMajor": 4 },
    "eslint-plugin-tsdoc": { "acknowledgedMajor": 0 },
    "fallow": { "acknowledgedMajor": 3 },
    "fuzzysort": { "acknowledgedMajor": 4 },
    "google-auth-library": { "acknowledgedMajor": 11 },
    "jose": { "acknowledgedMajor": 6 },
    "next": { "acknowledgedMajor": 16 },
    "playwright": { "acknowledgedMajor": 1 },
    "postgres": { "acknowledgedMajor": 3 },
    "react": { "acknowledgedMajor": 19 },
    "react-dom": { "acknowledgedMajor": 19 },
    "server-only": { "acknowledgedMajor": 0 },
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
      "scanSince": "2026-08-13",
      "acknowledgedItems": [
        "https://vercel.com/blog/how-searchable-ships-customer-requested-features-in-30-minutes-on-vercel",
        "https://vercel.com/blog/vercel-agent",
        "https://vercel.com/changelog/python-function-bundles-now-include-precompiled-bytecode",
        "https://vercel.com/changelog/vercel-connect-preset-connectors",
        "https://vercel.com/changelog/vercel-mcp-now-supports-purchases",
        "https://vercel.com/changelog/laguna-s-2-1-is-now-available-on-ai-gateway",
        "https://vercel.com/changelog/gemini-3-6-flash-3-5-flash-lite-on-ai-gateway",
        "https://vercel.com/changelog/service-tiers-now-available-on-ai-gateway",
        "https://vercel.com/changelog/configure-where-run-state-lives-in-vercel-workflows",
        "https://vercel.com/changelog/purge-your-remote-caches-build-and-ci-artifacts",
        "https://vercel.com/changelog/ai-gateway-now-supports-streaming-transcription",
        "https://vercel.com/changelog/eve-extensions",
        "https://vercel.com/changelog/evaluation-metrics-for-vercel-flags",
        "https://vercel.com/changelog/connect-to-and-manage-sandboxes-from-the-dashboard",
        "https://vercel.com/changelog/inspect-feature-flag-history-with-vercel-cli",
        "https://vercel.com/changelog/github-tools-eve-extension",
        "https://vercel.com/changelog/ling-3-0-flash-is-now-available-on-ai-gateway",
        "https://vercel.com/changelog/vercel-mcp-can-now-deploy-code",
        "https://vercel.com/changelog/vercel-waf-for-blob-is-now-in-beta",
        "https://vercel.com/changelog/workflow-steps-now-support-extended-function-durations",
        "https://vercel.com/changelog/claude-opus-5-now-available-on-ai-gateway",
        "https://nextjs.org/blog/july-2026-security-release",
        "https://vercel.com/changelog/regional-inference-now-available-on-ai-gateway",
        "https://vercel.com/changelog/eve-adds-new-slack-event-hooks-and-session-controls",
        "https://vercel.com/blog/deepsecbench-evaluating-model-performance-in-finding-cybersecurity-vulnerabilities",
        "https://vercel.com/changelog/websocket-support-for-openai-responses-api-live-on-ai-gateway",
        "https://vercel.com/changelog/nuxt-july-2026-security-advisory",
        "https://vercel.com/changelog/kimi-k3-and-kimi-k3-fast-on-ai-gateway",
        "https://vercel.com/changelog/claude-managed-agents-with-chat-sdk",
        "https://vercel.com/changelog/vercel-sandbox-supports-forking",
        "https://vercel.com/changelog/vercel-connect-now-supports-custom-environments",
        "https://vercel.com/blog/how-sandstone-grew-40x-in-147-days-on-vercel",
        "https://vercel.com/changelog/grok-voice-think-fast-2-0-now-available-on-ai-gateway",
        "https://vercel.com/changelog/edge-config-is-now-global-config",
        "https://vercel.com/changelog/ai-gateway-adds-unified-fast-mode-support",
        "https://vercel.com/changelog/sign-in-with-chatgpt-is-now-available-on-vercel",
        "https://vercel.com/changelog/additional-custom-environments-can-now-be-purchased",
        "https://vercel.com/changelog/discover-and-install-eve-integrations-from-the-cli",
        "https://vercel.com/changelog/ai-gateway-spend-budgets-and-alerts",
        "https://vercel.com/changelog/deepseek-v4-flash-now-runs-updated-weights-on-ai-gateway",
        "https://vercel.com/changelog/chat-sdk-reactions-and-ephemeral-messages-on-teams",
        "https://vercel.com/changelog/ai-gateway-logs",
        "https://vercel.com/changelog/vercel-mcp-now-supports-the-2026-07-28-mcp-specification",
        "https://vercel.com/changelog/expanded-search-for-workflow-runs-in-vercel-observability",
        "https://vercel.com/changelog/10x-more-capacity-for-laguna-s-2-1-on-ai-gateway",
        "https://vercel.com/changelog/vercel-passport-generally-available",
        "https://vercel.com/changelog/qwen-3-8-max-now-available-on-vercel-ai-gateway",
        "https://vercel.com/changelog/server-timing-header",
        "https://vercel.com/blog/shopify-and-vercel-are-rebuilding-hydrogen-for-faster-storefronts",
        "https://vercel.com/changelog/run-multiple-isolated-agents-in-a-single-sandbox",
        "https://vercel.com/changelog/minimax-h3-now-available-on-vercel-ai-gateway",
        "https://vercel.com/changelog/inkling-small-now-available-on-ai-gateway",
        "https://vercel.com/changelog/turborepo-and-remote-cache-now-support-openid-connect-oidc",
        "https://vercel.com/changelog/ai-gateway-gpt-5-6-pricing-speed-updates",
        "https://vercel.com/changelog/deployments-are-now-up-to-7-seconds-faster",
        "https://vercel.com/changelog/latest-mcp-spec-now-supported-in-mcp-handler",
        "https://vercel.com/changelog/introducing-enterprise-flexible-commitment-for-vercel-marketplace",
        "https://vercel.com/changelog/project-scoped-tokens",
        "https://nextjs.org/blog/next-security-release-program",
        "https://nextjs.org/blog/next-16-3-turbopack",
        "https://vercel.com/changelog/give-your-eve-agent-a-browser",
        "https://vercel.com/changelog/vercel-waf-for-blob-is-now-generally-available",
        "https://vercel.com/blog/how-factory-scaled-its-cloud-backend-to-tens-of-millions-of-daily-requests",
        "https://vercel.com/changelog/share-vercel-container-registry-repositories-across-teams",
        "https://nextjs.org/blog/next-16-3",
        "https://vercel.com/changelog/chat-sdk-durable-approvals",
        "https://vercel.com/changelog/project-avatars",
        "https://vercel.com/changelog/new-setup-page-after-domain-checkout",
        "https://vercel.com/changelog/export-ai-gateway-traces-with-vercel-drains",
        "https://vercel.com/blog/introducing-the-new-v0-api",
        "https://vercel.com/changelog/ai-gateway-is-now-available-on-aws-marketplace",
        "https://vercel.com/changelog/muse-spark-1-2-is-now-available-on-vercel-ai-gateway",
        "https://vercel.com/changelog/vercel-sandbox-now-supports-10-000-concurrent-sandboxes-and-5-000-vcpus-per-minute",
        "https://vercel.com/changelog/search-and-buy-domains-in-the-dashboard",
        "https://vercel.com/changelog/measure-time-between-steps-in-vercel-workflows",
        "https://vercel.com/changelog/full-sandbox-egress-firewall-now-available-on-hobby-plan",
        "https://vercel.com/changelog/vercel-sandbox-now-supports-devin-outposts",
        "https://vercel.com/blog/vercel-supports-next-js-16-3",
        "https://vercel.com/changelog/skill-packs-are-now-available",
        "https://vercel.com/changelog/deploys-are-now-up-to-33-faster-for-apps-with-many-isr-pages",
        "https://vercel.com/changelog/deepseek-v4-flash-is-90-off-through-novita",
        "https://vercel.com/blog/introducing-agent-plugins",
        "https://vercel.com/changelog/seedance-2-5-now-available-on-vercel-ai-gateway",
        "https://vercel.com/changelog/vercel-marketplace-agent-skills",
        "https://vercel.com/changelog/ling-3-0-tiny-is-now-available-on-ai-gateway",
        "https://vercel.com/changelog/introducing-agent-plugins-1-0-0",
        "https://nextjs.org/blog/making-v0-navigations-instant",
        "https://vercel.com/changelog/grok-imagine-image-2-0-preview-now-available-on-vercel-ai-gateway",
        "https://vercel.com/changelog/vercel-ai-gateway-and-vercel-sandbox-now-available-on-hermes-agent",
        "https://vercel.com/changelog/vercel-container-registry-repositories-can-now-be-made-public",
        "https://vercel.com/changelog/audit-log-drains-now-support-datadog-splunk-and-panther",
        "https://vercel.com/changelog/free-domain-now-included-with-new-pro-subscriptions",
        "https://vercel.com/blog/a-sandbox-without-a-network-boundary-is-only-half-a-sandbox",
        "https://vercel.com/changelog/vercel-sandbox-managed-images",
        "https://vercel.com/changelog/simplified-onboarding-for-deepsec",
        "https://vercel.com/changelog/bun-serve-entrypoint-for-vercel-functions",
        "https://vercel.com/changelog/vercel-connect-adds-observability-support",
        "https://vercel.com/changelog/enterprise-managed-users",
        "https://vercel.com/changelog/vercel-cli-100-services",
        "https://vercel.com/blog/everything-hackable-will-get-hacked",
        "https://vercel.com/blog/deepseek-overtakes-google-on-volume-cost-per-token-falls",
        "https://vercel.com/changelog/launchdarkly-is-now-available-on-the-vercel-marketplace",
        "https://vercel.com/changelog/deepseek-v4-pro-now-runs-updated-weights-on-ai-gateway",
        "https://vercel.com/changelog/exa-web-search-free-through-august-31-on-ai-gateway-and-eve",
        "https://vercel.com/blog/building-a-software-factory-for-ai-sdk",
        "https://vercel.com/changelog/set-up-coding-agents-in-one-command-with-ai-gateway",
        "https://vercel.com/changelog/free-domain-for-one-year-now-for-all-pro-teams",
        "https://vercel.com/changelog/grok-4-6-now-available-on-ai-gateway",
        "https://vercel.com/blog/how-we-migrated-the-database-behind-every-vercel-build"
      ]
    },
    {
      "name": "Neon",
      "watch": ["https://neon.com/docs/changelog/rss.xml"],
      "idRule": "url",
      "scanSince": "2026-08-13",
      "acknowledgedItems": [
        "https://neon.com/docs/changelog/2026-07-24",
        "https://neon.com/docs/changelog/2026-07-31",
        "https://neon.com/docs/changelog/2026-07-17",
        "https://neon.com/docs/changelog/2026-08-07"
      ]
    },
    {
      "name": "Convex",
      "watch": ["https://news.convex.dev/rss/"],
      "idRule": "url",
      "scanSince": "2026-08-07",
      "acknowledgedItems": [
        "https://news.convex.dev/abstract",
        "https://news.convex.dev/convex-open-source-recap-2025",
        "https://news.convex.dev/enterprise-launch",
        "https://news.convex.dev/convex-raises-57m"
      ]
    },
    {
      "name": "Upstash",
      "watch": ["https://upstash.com/blog/feed.xml"],
      "idRule": "url",
      "scanSince": "2026-08-13",
      "acknowledgedItems": [
        "https://upstash.com/blog/durable-workflow-engines-compared-every-major-option-in-2026",
        "https://upstash.com/blog/context7-vs-static-llm-knowledge-benchmarking-coding-assistants",
        "https://upstash.com/blog/how-to-self-host-redis-in-2026",
        "https://upstash.com/blog/replicated-cache-backed-by-redis",
        "https://upstash.com/blog/time-series-data-in-redis-patterns-and-best-practices",
        "https://upstash.com/blog/google-cloud-run-vs-agent-sandboxes",
        "https://upstash.com/blog/how-to-build-search-on-redis",
        "https://upstash.com/blog/running-claude-code-in-a-remote-sandbox-with-upstash-box",
        "https://upstash.com/blog/upstash-vs-aws-elasticache-serverless-redis-pricing-and-performance-2026",
        "https://upstash.com/blog/redis-cloud-pricing-in-2026-plans-costs-and-real-examples",
        "https://upstash.com/blog/upstash-agentkit-redis-memory-rag-and-chat-history-for-ai-agents",
        "https://upstash.com/blog/context7-portable-agent-plugin",
        "https://upstash.com/blog/how-background-coding-agents-keep-working"
      ]
    }
  ],
  "eveSurface": [
    {
      "name": "EVE Developers blog",
      "watch": ["https://developers.eveonline.com/feed.xml"],
      "idRule": "url",
      "scanSince": "2026-08-07",
      "acknowledgedItems": [
        "https://developers.eveonline.com/blog/a-splash-of-color-corporation-palette-and-a-few-fresh-fields",
        "https://developers.eveonline.com/blog/goodbye-swagger-removing-the-last-remnants",
        "https://developers.eveonline.com/blog/cradle-of-war-on-esi-character-titles-and-achievements",
        "https://developers.eveonline.com/blog/military-campaigns-on-esi-joining-the-war-effort"
      ]
    },
    {
      "name": "EVE developer documentation",
      "watch": ["https://developers.eveonline.com/docs/sitemap.xml"],
      "idRule": "url",
      "scanSince": "2026-07-22",
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
        "https://developers.eveonline.com/docs/community/isk-gg",
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
        "https://developers.eveonline.com/docs/support",
        "https://developers.eveonline.com/docs/community/fuzzwork",
        "https://developers.eveonline.com/docs/community/fuzzwork-sde"
      ]
    }
  ]
}
```

## Seeded state note (3.9.3.5 demonstration)

`clsx` was deliberately acknowledged at major 1 while major 2 was current —
the seeded delta for the routine's demonstration runs. The demonstration's
report and suppressed-quiet runs completed against that seed (digest issue
#269), after which this absorption raised the acknowledgment to the true
major 2, exactly as the absorption procedure prescribes.
