## TypeScript
<!-- updated: 2026-06-30 -->

TypeScript is one of the places where the “built with AI” part of this project becomes very practical.

AI can produce code that looks right. It can also produce code where two sides of the same boundary quietly disagree: a route returns `staleAfter`, a client expects `stale_after`; a database query returns a `bigint`, a JSON response tries to send it raw; an env var can be empty but the call site treats empty as missing; an external API returns a shape that looks close enough until one field is not there. Those are not dramatic architecture failures. They are the small mismatches that turn into weird bugs later.

So TypeScript’s job in LGI.tools is not just “make the editor nicer.” It is a rail that makes boundary drift expensive. If a value crosses a wire, leaves the process, enters from a user, comes back from EVE, or gets shared between a route and a client, I want as much of that shape as possible declared once and checked where it is used.

The baseline is strict TypeScript with `noEmit`. The compiler is not the thing that produces the app bundle; it is a verification step. That distinction matters. `pnpm typecheck` is there to fail the branch when the repo’s declared shapes no longer agree, not to generate output. In an AI workflow, that gives me a fast answer to a question I cannot answer by reading every diff line: did this change break the contracts the rest of the repo depends on?<sup><a href="#code-typescript-tsconfig">1</a></sup>

The biggest TypeScript rail landed in [PR #89](https://github.com/StorminRH/lgi-tools/pull/89). Before that, API routes and API clients could drift more easily than I liked. A route could validate one shape, return another shape, and a browser caller could paper over the gap with a hand-written `as` cast. That is the kind of thing AI is very comfortable doing. It satisfies the local code path and hides the mismatch from the compiler.

The new rule is that JSON-speaking API routes have an owning `api-contract.ts`. The request schema and response type live there, near the feature or data slice that owns the route. The route imports the schema and still performs the runtime validation. The response payload is pinned with `satisfies`. The client imports the endpoint object and calls `apiFetch`, which returns the contract’s response type. A renamed field now breaks both sides at typecheck time instead of becoming a silent client bug.<sup><a href="#code-typescript-api-contract">2</a></sup><sup><a href="#code-typescript-route-satisfies">3</a></sup><sup><a href="#code-typescript-api-client">4</a></sup>

The market-price refresh route is a good example. The wire contract knows that database `bigint` volumes become strings, timestamps become ISO strings, and price sources must stay inside the allowed enum. The route maps the database rows into that wire shape and uses `satisfies RefreshPricesResponse` on the JSON payload. The client reads the same endpoint through `apiFetch`, then deserializes the wire strings and timestamps into the local shape it needs for the UI. That is the right split: TypeScript pins the wire, and the client owns the conversion after the wire has been proven.<sup><a href="#code-typescript-api-contract">2</a></sup><sup><a href="#code-typescript-route-satisfies">3</a></sup><sup><a href="#code-typescript-api-client">4</a></sup>

There is also a convention test because TypeScript only helps if the code actually participates in the contract system. A new route that never imports an `api-contract` module can still compile. So the repo has a mechanical test that walks `src/app/api/**/route.*` and fails if a route does not import from an owning `api-contract` module, with a small allowlist for library-owned routes. This is the same philosophy as the authz marker and route-rendering checks: do not rely on me noticing the missing contract during review if the repo can notice it first.<sup><a href="#code-typescript-contract-test">5</a></sup>

The lint rail then protects the client side of the same system. Raw `fetch('/api/...')` calls are banned because they bypass the shared endpoint object. That is technically an ESLint rule, but it exists to preserve the TypeScript contract. The compiler cannot type a route response if the caller has escaped into raw string fetches. The lint rule keeps the path through `apiFetch` obvious, and the contract test keeps route authors from forgetting the other half.<sup><a href="#code-typescript-api-fetch-lint">6</a></sup>

Environment variables got the same treatment. `process.env` looks like a simple global, but it is one of the easiest places to create hidden behavior differences. Some variables treat an empty string as missing. Others need to preserve an empty string because the call site uses nullish checks or exact comparisons. [PR #89](https://github.com/StorminRH/lgi-tools/pull/89) moved server-side env reads into a typed registry with `readEnv` and `requireEnv`. The registry is lazy, so importing a module does not suddenly validate the whole deployment environment, and the type split prevents `requireEnv` from being used on variables where an empty string is meaningful.<sup><a href="#code-typescript-env">7</a></sup>

That “equivalence-preserving” part is important. I did not want the env rail to secretly change runtime behavior while pretending to be a cleanup. The registry records the behavior the app already had, then makes it harder for future code to read around it. `NODE_ENV` and `NEXT_PUBLIC_*` stay direct reads because bundlers and Next’s client-env inlining need those literal accesses. Everything else server-side goes through the registry, and ESLint backs that up by banning unsanctioned `process.env` reads.<sup><a href="#code-typescript-env">7</a></sup><sup><a href="#code-typescript-api-fetch-lint">6</a></sup>

The outbound-call rail started earlier in [PR #48](https://github.com/StorminRH/lgi-tools/pull/48). The issue there was not just typing the app’s own routes. It was typing and bounding what comes back from outside services. ESI, Fuzzwork, EVE SSO, Discord, email, and SDE downloads all sit beyond my codebase. A slow upstream can pin a serverless function until the platform kills it. A malformed response can drift downstream as `undefined`, `NaN`, or a missing access token. The fix was to make outbound boundaries fail fast and reject malformed bodies at the edge.<sup><a href="#code-typescript-fetch-timeout">8</a></sup>

That is where Zod and TypeScript work together. Zod validates the runtime value that came back from the network. TypeScript carries the narrowed shape after validation. The Fuzzwork and ESI price paths are examples: the code does not just declare what the response should be and trust it. It parses the body against the boundary schema, then either proceeds with the inferred type or routes to the existing failure behavior. The type is only useful because the boundary check earned it.

This also changed how I think about database queries. Validation belongs at the route or external boundary. Once a value is parsed, narrowed, and typed, the query layer should accept the typed value and do its job. That keeps the data layer from becoming a second, inconsistent validation system. Drizzle gives the repo typed table and query surfaces; the route contracts decide what untrusted input is allowed to become before it reaches those queries.

The pattern is the same across the rail: do not let unknown shapes wander through the app. User input is parsed at the route. API responses are pinned to contracts. Browser callers use typed endpoint objects. Env reads go through a typed registry. External responses are validated before they become application values. Queries receive already-typed inputs.

TypeScript does not make the code correct by itself. It cannot tell me whether a feature is useful, whether a cache policy is wise, or whether an EVE endpoint is the right source of truth. But it is excellent at one thing I need constantly in an AI-built repo: making disagreement visible. If two parts of the system think a value has a different shape, I want the branch to fail before that disagreement becomes a production behavior.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-typescript-tsconfig" file="tsconfig.json" lines="3-35" lang="json" -->
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

<!-- uth:code id="code-typescript-api-contract" file="src/data/market-prices/api-contract.ts" lines="14-64" lang="ts" -->
```ts
export const refreshPricesRequestSchema = z.object({
  typeIds: z
    .array(z.number().int().positive().max(PG_INT4_MAX))
    .min(1)
    .max(ON_DEMAND_REFRESH_MAX_TYPE_IDS),
});

export const wirePriceSchema = z.object({
  typeId: z.number(),
  bestBuy: z.number().nullable(),
  bestSell: z.number().nullable(),
  pct5Buy: z.number().nullable(),
  pct5Sell: z.number().nullable(),
  buyVolume: z.string().nullable(),
  sellVolume: z.string().nullable(),
  buyDepth: z.array(wireDepthBandSchema).nullable(),
  sellDepth: z.array(wireDepthBandSchema).nullable(),
  updatedAt: z.string(),
  staleAfter: z.string(),
  source: z.enum(['esi', 'fuzzwork-fallback', 'fuzzwork']) satisfies z.ZodType<PriceSource>,
});

export const refreshPricesResponseSchema = z.object({ prices: z.array(wirePriceSchema) });
export type RefreshPricesResponse = z.infer<typeof refreshPricesResponseSchema>;

export const refreshPricesEndpoint: ApiEndpoint<
  z.input<typeof refreshPricesRequestSchema>,
  RefreshPricesResponse
> = {
  method: 'POST',
  path: '/api/market-prices/refresh',
  request: refreshPricesRequestSchema,
  response: refreshPricesResponseSchema,
};
```

<!-- uth:code id="code-typescript-route-satisfies" file="src/app/api/market-prices/refresh/route.ts" lines="36-108" lang="ts" -->
```ts
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" } satisfies RefreshPricesBadRequest, {
      status: 400,
    });
  }

  const parsed = refreshPricesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues } satisfies RefreshPricesBadRequest,
      { status: 400 },
    );
  }

  const typeIds = Array.from(new Set(parsed.data.typeIds));
  const { prices } = await getLivePrices(typeIds);

  return Response.json({
    prices: typeIds
      .map((typeId) => prices.get(typeId))
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .map((row) => ({
        typeId: row.typeId,
        bestBuy: row.bestBuy,
        bestSell: row.bestSell,
        pct5Buy: row.pct5Buy,
        pct5Sell: row.pct5Sell,
        buyVolume: row.buyVolume?.toString() ?? null,
        sellVolume: row.sellVolume?.toString() ?? null,
        buyDepth: row.buyDepth,
        sellDepth: row.sellDepth,
        updatedAt: row.updatedAt.toISOString(),
        staleAfter: row.staleAfter.toISOString(),
        source: row.source,
      })),
  } satisfies RefreshPricesResponse);
}
```

<!-- uth:code id="code-typescript-api-client" file="src/lib/api-client.ts" lines="3-71" lang="ts" -->
```ts
export interface ApiEndpoint<TIn, TData> {
  method: 'GET' | 'POST';
  path: string;
  request: z.ZodType<unknown, TIn> | null;
  response: z.ZodType<TData> | null;
}

export async function apiFetch<TData>(
  endpoint: ApiEndpoint<null, TData>,
  init?: CallInit,
): Promise<ApiResult<TData>>;
export async function apiFetch<TIn, TData>(
  endpoint: ApiEndpoint<TIn, TData>,
  init: CallInit & { body: TIn },
): Promise<ApiResult<TData>>;
export async function apiFetch(
  endpoint: ApiEndpoint<unknown, unknown>,
  init: CallInit & { body?: unknown } = {},
): Promise<ApiResult<unknown>> {
  const { body, ...rest } = init;
  const res = await fetch(endpoint.path, {
    method: endpoint.method,
    ...(endpoint.request !== null
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    ...rest,
  });
  if (!res.ok) return { ok: false, status: res.status, response: res };
  if (endpoint.response === null) return { ok: true, status: res.status, data: undefined };
  const data: unknown = await res.json();
  if (process.env.NODE_ENV !== 'production') {
    const check = endpoint.response.safeParse(data);
    if (!check.success) {
      console.error(
        `[api-client] ${endpoint.method} ${endpoint.path} response drifted from its contract`,
        check.error,
      );
    }
  }
  return { ok: true, status: res.status, data };
}
```

<!-- uth:code id="code-typescript-contract-test" file="src/app/api/api-contracts.test.ts" lines="8-63" lang="ts" -->
```ts
// Mechanical API-contract guard (3.4.T) — the sibling of authz-markers.test.ts.
// Every route handler under src/app/api must import from its owning slice's
// api-contract module, where its request schema and response types live, so the
// route and its clients share one wire shape.

const CONTRACT_IMPORT_RE = /from\s+['"][^'"]*api-contract['"]/;
const LIBRARY_OWNED = new Set(['auth/[...all]/route.ts']);

const ROUTE_FILES = findRouteFiles(API_DIR).filter(
  (file) => !LIBRARY_OWNED.has(relative(API_DIR, file)),
);

describe('api contract imports', () => {
  it('finds at least one API route file (guards against a broken glob passing vacuously)', () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(0);
  });

  it.each(ROUTE_FILES)('%s imports from its slice's api-contract module', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(
      CONTRACT_IMPORT_RE.test(src),
      `${label(file)} does not import from an api-contract module. Every src/app/api/**/route.* ` +
        `file must take its request schema (and response types, pinned with \`satisfies\`) from ` +
        `the owning slice's api-contract.ts`,
    ).toBe(true);
  });
});
```

<!-- uth:code id="code-typescript-api-fetch-lint" file="eslint.config.mjs" lines="55-63,78-93" lang="js" -->
```js
const apiFetchSelectors = [
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.value=/^\/api\//]`,
    message:
      "Raw fetch('/api/…') bypasses the shared API contracts — call apiFetch (src/lib/api-client.ts) with the endpoint object from the owning slice's api-contract.ts.",
  },
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.quasis.0.value.raw=/^\/api\//]`,
    message:
      "Raw fetch(`/api/…`) bypasses the shared API contracts — call apiFetch (src/lib/api-client.ts) with the endpoint object from the owning slice's api-contract.ts.",
  },
];

const processEnvSelectors = [
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']:not([property.name=/^NEXT_PUBLIC_/])",
    message:
      "Read server env through readEnv()/requireEnv() (src/lib/env.ts) — typed, lazy, and registry-documented. NODE_ENV and NEXT_PUBLIC_* stay direct reads.",
  },
];
```

<!-- uth:code id="code-typescript-env" file="src/lib/env.ts" lines="3-87" lang="ts" -->
```ts
// Typed, lazily-read server env (3.4.T). One registry of every server-side
// variable; a read validates on access — never at import, never cached.

const REQUIRED_ENV = {
  DATABASE_URL: required,
  EVE_CLIENT_ID: required,
  EVE_CLIENT_SECRET: required,
  EVE_TOKEN_ENCRYPTION_KEY: required,
  CONVEX_SERVICE_SECRET: required,
  CRON_SECRET: required,
  DISCORD_WEBHOOK_URL: required,
  DISCORD_ALERT_WEBHOOK_URL: required,
  GSC_SERVICE_ACCOUNT_JSON: required,
  GSC_SITE_URL: required,
} as const;

const VERBATIM_ENV = {
  DATABASE_URL_UNPOOLED: verbatim,
  LOCAL_DB_DRIVER: verbatim,
  DOTENV_PATH: verbatim,
  BETTER_AUTH_SECRET: verbatim,
  SESSION_SECRET: verbatim,
  BETTER_AUTH_URL: verbatim,
  SUPERADMIN_CHARACTER_ID: verbatim,
  KV_REST_API_URL: verbatim,
  KV_REST_API_TOKEN: verbatim,
  UPSTASH_REDIS_REST_URL: verbatim,
  UPSTASH_REDIS_REST_TOKEN: verbatim,
  GOOGLE_SITE_VERIFICATION: verbatim,
  VERCEL_ENV: verbatim,
  LGI_FORCE_TREE_REBUILD: verbatim,
} as const;

export type RequiredEnvName = keyof typeof REQUIRED_ENV;
export type ServerEnvName = RequiredEnvName | keyof typeof VERBATIM_ENV;

export function readEnv(name: ServerEnvName): string | undefined {
  const parsed = SERVER_ENV[name].safeParse(process.env[name]);
  return parsed.success ? parsed.data : undefined;
}

export function requireEnv(name: RequiredEnvName): string {
  const value = readEnv(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
```

<!-- uth:code id="code-typescript-fetch-timeout" file="src/lib/fetch-with-timeout.ts" lines="3-51" lang="ts" -->
```ts
// Shared fail-fast timeout for outbound `fetch`. A slow or hung upstream
// would otherwise stall a serverless function until the 300s platform limit.

export const OUTBOUND_FETCH_TIMEOUT_MS = 10_000;
export const SDE_DOWNLOAD_TIMEOUT_MS = 60_000;

export function fetchWithTimeout(
  input: string | URL,
  init?: RequestInit,
  timeoutMs: number = OUTBOUND_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('signal timed out', 'TimeoutError'));
  }, timeoutMs);
  const callerSignal = init?.signal;
  const forwardAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal != null) {
    if (callerSignal.aborted) forwardAbort();
    else callerSignal.addEventListener('abort', forwardAbort, { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardAbort);
  });
}
```
<!-- uth:code-excerpts:end -->
