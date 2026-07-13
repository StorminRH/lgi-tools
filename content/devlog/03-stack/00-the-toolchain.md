## The Toolchain

The service sections explain where LGI.tools runs. This section is about what the app is written with, and why those choices matter.

I do not think about the stack as a list of favorite technologies. That would be the wrong framing for this project. LGI.tools was built with AI, so the tools around the code have to do more than make development pleasant. They have to make the project harder to accidentally damage.

That shaped almost every choice.

I wanted boring, common, well-documented tools where possible. Not because boring is exciting, but because an AI agent is much more likely to stay inside the rails when the rails are built around familiar patterns. A strange custom framework would put more hidden context in my head. A conventional TypeScript/React/Next/Postgres stack gives the repo patterns that are easier to inspect, easier to test, and easier to explain back to the next coding session.

So the stack is less about taste and more about leverage. Each tool gives the repo a kind of pressure I can use: TypeScript for static shape, Zod for runtime validation, Drizzle for database schema, Better Auth for session scaffolding, Tailwind for UI composition, Vitest for behavior, ESLint for local bans, Fallow for repo structure, and Next.js/Vercel for the app and deployment model.

The public repo started from a fairly ordinary modern web shape: Next.js, React, TypeScript, Tailwind, Drizzle, Postgres, Vercel, pnpm, and Vitest. [PR #22](https://github.com/StorminRH/lgi-tools/pull/22) was the point where it stopped feeling like a private experiment and started acting like a project someone else could clone: a README, license, `.env.example`, documented commands, and local setup notes. That mattered because AI-built projects need more written structure, not less. Every missing convention is an invitation for the next agent to invent one.<sup><a href="#code-stack-package">1</a></sup>

Next.js gives the app its main shape. Pages, layouts, route handlers, server-side reads, client islands, and the production build all live inside one framework. That consistency is useful because each feature does not need to invent its own web-server pattern. The tradeoff is that framework behavior becomes load-bearing. Rendering mode, server/client boundaries, cached reads, route handlers, and build output all affect the final app. That is why later rails exist around route classification and build assertions. The stack choice gave the app a clear shape, but the repo still had to prove that shape did not drift.<sup><a href="#code-stack-package">1</a></sup>

TypeScript is the first compile-time rail. The repo runs with `strict` and `noEmit`, which means type-checking is a proof step, not the thing that produces JavaScript. That may sound like a small distinction, but it is important. I am not asking TypeScript to build the app. I am asking it to stop the branch when two parts of the repo disagree about a value’s shape. The dedicated TypeScript rails section goes deeper on API contracts, env reads, and typed boundaries; at the stack level, the point is that “does this typecheck?” became one of the first questions every generated change has to answer.<sup><a href="#code-stack-tsconfig">2</a></sup>

Drizzle is the database layer because it keeps the database shape close to the TypeScript code while still producing migrations. I wanted the schema to be reviewable as code, not described in one place and remembered somewhere else. `drizzle.config.ts` points migration generation at the central schema export, while the actual table definitions stay owned by feature and data slices. That fits the broader rule: the feature that owns a concept should own its table shape, but the database still needs one coherent model when migrations are generated.<sup><a href="#code-stack-drizzle">3</a></sup>

Zod fills the gap TypeScript cannot cover. TypeScript can describe what the app expects, but it cannot prove that a browser POST, URL param, environment variable, or external API response actually matches that expectation at runtime. That is why the stack uses Zod at boundaries. Route handlers validate untrusted input. API contract files pair request schemas with response types. The typed `apiFetch` helper lets clients consume those contracts instead of papering over responses with hand-written casts. This is one of the places the stack becomes a real safety system: the route and the client share one declared wire shape instead of two separate guesses.<sup><a href="#code-stack-api-client">4</a></sup><sup><a href="#code-stack-api-contract-test">5</a></sup>

Environment variables are another boundary that needed more discipline than I expected. Raw `process.env` reads are easy to scatter and hard to audit. They also hide subtle behavior: some values should treat an empty string as missing, while others need the empty string to remain meaningful. The env registry makes those differences explicit and lazy. It validates when a value is read, not when a module is imported, so the repo keeps the side-effect-free import behavior that matters for tests, scripts, and serverless startup.<sup><a href="#code-stack-env">6</a></sup>

Authentication is handled by Better Auth rather than a fully custom session system. That was a deliberate “buy the boring part” decision. LGI.tools still has plenty of EVE-specific identity rules: character linking, owner hashes, token custody, EVE scopes, admin roles, and account purge behavior. I did not also want AI-generated code to invent a session framework from scratch. Better Auth provides the spine, and the repo owns the EVE-specific edges around it. The account chapter goes into that boundary more deeply.<sup><a href="#code-stack-auth">7</a></sup>

The styling stack follows the same pattern. Tailwind makes the UI fast to compose, but the repo does not let arbitrary styling spread forever. Theme variables in `globals.css` define the palette, and lint rules push call sites toward tokens and shared tone helpers instead of raw color literals. [PR #68](https://github.com/StorminRH/lgi-tools/pull/68) applied the same idea to charts: before using a charting library for real features, the repo proved SVG charts could work under the project’s CSP constraints without inline-style surprises. That is the version of a stack decision I trust most: prove the constraint before building a feature on top of it.<sup><a href="#code-stack-theme">8</a></sup><sup><a href="#code-stack-lint">9</a></sup>

The verification tools are part of the stack too. Vitest tests behavior. ESLint catches local syntax and policy violations. Fallow watches the broader repo graph: unused files, unused exports, dependency drift, boundary violations, duplication, and complexity. Those tools matter because AI can leave behind code that is plausible but heavy. A helper can be clean in isolation and still be in the wrong layer. A file can compile and still be dead. An export can look useful and still have no consumer.<sup><a href="#code-stack-package">1</a></sup><sup><a href="#code-stack-fallow">10</a></sup>

That is the way I think about the stack now. It is not just the list of libraries the app happens to use. It is a layered set of constraints around an AI-directed project. Next.js gives the app one framework shape. TypeScript makes static disagreement visible. Zod checks runtime boundaries. Drizzle keeps the database model in code. Better Auth keeps session machinery out of the custom-code pile. Tailwind and theme tokens keep the UI from drifting. Vitest, ESLint, and Fallow turn review instincts into repeatable checks.

The rule I keep coming back to is simple: when I direct AI to make a change, the stack should make the safe path easier than the clever path. The tools do not replace judgment, but they reduce how much trust I have to place in any single generated answer.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-stack-package" file="package.json" lines="17-81" lang="json" -->
```json
"scripts": {
  "dev": "next dev",
  "predev:all": "docker compose up -d",
  "dev:all": "concurrently -k -n next,convex -c cyan,magenta \"next dev\" \"convex dev\"",
  "build": "next build",
  "vercel-build": "pnpm exec convex deploy --cmd 'pnpm build:vercel' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL",
  "build:vercel": "tsx src/db/migrate.ts && tsx src/db/backfill-users-if-empty.ts && tsx src/db/ingest-sde-if-empty.ts && next build && node scripts/assert-route-classification.mjs",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "fallow": "fallow audit --fail-on-issues",
  "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm fallow"
},
"dependencies": {
  "@neondatabase/serverless": "^1.1.0",
  "@upstash/ratelimit": "^2.0.8",
  "@upstash/redis": "^1.38.0",
  "@visx/event": "^4.0.0",
  "@visx/scale": "^4.0.0",
  "@visx/shape": "^4.0.0",
  "@visx/tooltip": "^4.0.0",
  "better-auth": "^1.6.15",
  "convex": "^1.42.0",
  "drizzle-orm": "^0.45.2",
  "next": "16.2.6",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "zod": "^4.4.3"
}
```

<!-- uth:code id="code-stack-tsconfig" file="tsconfig.json" lines="4-25" lang="json" -->
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "jsx": "react-jsx",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

<!-- uth:code id="code-stack-drizzle" file="drizzle.config.ts" lines="13-20" lang="ts" -->
```ts
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
} satisfies Config;
```

<!-- uth:code id="code-stack-api-client" file="src/lib/api-client.ts" lines="3-31,35-71" lang="ts" -->
```ts
// Typed fetch for our own /api routes. Each JSON-speaking route's owning slice
// exports an ApiEndpoint from its api-contract.ts; callers go through apiFetch
// and get the contract's response type back — raw fetch('/api/…') is lint-banned.

export interface ApiEndpoint<TIn, TData> {
  method: 'GET' | 'POST';
  path: string;
  request: z.ZodType<unknown, TIn> | null;
  response: z.ZodType<TData> | null;
}

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
      console.error(`[api-client] ${endpoint.method} ${endpoint.path} response drifted from its contract`, check.error);
    }
  }
  return { ok: true, status: res.status, data };
}
```

<!-- uth:code id="code-stack-api-contract-test" file="src/app/api/api-contracts.test.ts" lines="8-14,48-62" lang="ts" -->
```ts
// Mechanical API-contract guard. Every route handler under src/app/api must
// import from its owning slice's api-contract module, where its request schema
// and response types live, so the route and its clients share one wire shape.

describe('api contract imports', () => {
  it.each(ROUTE_FILES)('%s imports from its slice\'s api-contract module', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(
      CONTRACT_IMPORT_RE.test(src),
      `${label(file)} does not import from an api-contract module. Every src/app/api/**/route.* ` +
        `file must take its request schema (and response types, pinned with \`satisfies\`) from ` +
        `the owning slice's api-contract.ts.`,
    ).toBe(true);
  });
});
```

<!-- uth:code id="code-stack-env" file="src/lib/env.ts" lines="3-23,29-41,43-63,70-87" lang="ts" -->
```ts
// Typed, lazily-read server env. One registry of every server-side variable;
// a read validates on access — never at import, never cached — so module import
// stays side-effect-free and vi.stubEnv keeps working in tests.

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
  BETTER_AUTH_SECRET: verbatim,
  SESSION_SECRET: verbatim,
  BETTER_AUTH_URL: verbatim,
  SUPERADMIN_CHARACTER_ID: verbatim,
  KV_REST_API_URL: verbatim,
  KV_REST_API_TOKEN: verbatim,
  UPSTASH_REDIS_REST_URL: verbatim,
  UPSTASH_REDIS_REST_TOKEN: verbatim,
} as const;

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

<!-- uth:code id="code-stack-auth" file="src/features/auth/auth.ts" lines="3-13,87-116" lang="ts" -->
```ts
// The Better Auth server instance — the spine of identity/authz.
//
// Replaces the hand-rolled JWE-cookie + EVE PKCE flow with Better Auth on the
// Drizzle/Neon adapter. EVE SSO is wired as a Generic OAuth provider; identity
// comes from the verified access-token JWT, and the user↔character link lives
// in the `account` row.

const options = {
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification, jwks },
  }),
  secret: readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET'),
  baseURL: readEnv('BETTER_AUTH_URL'),
  databaseHooks: {
    account: {
      create: { before: async (acct) => ({ data: encryptAccountTokens(acct) }) },
      update: { before: async (acct) => ({ data: encryptAccountTokens(acct) }) },
    },
  },
  account: {
    accountLinking: { allowDifferentEmails: true },
  },
};
```

<!-- uth:code id="code-stack-theme" file="src/app/globals.css" lines="3-15,50-55,89-92" lang="css" -->
```css
@import "tailwindcss";

@theme {
  --color-bg-deep:     #060708;
  --color-bg:          #0b0d10;
  --color-section:     #0f1216;
  --color-tooltip:     #161b22;
  --color-border:      #1d232c;
  --color-border-soft: #141821;

  /* Call-site color tokens. The no-raw-hex lint rule keeps call sites pointed here. */

  /* Tone hues — pill/dot text + feature error text. Mirror toneHex. */
  --color-tone-green-strong: #44dd99;
  --color-tone-orange:       #d68c3d;
}
```

<!-- uth:code id="code-stack-lint" file="eslint.config.mjs" lines="15-34,58-73" lang="js" -->
```js
// Typed-API-call enforcement: a literal fetch('/api/…') bypasses the shared
// contracts, so client code must go through apiFetch with the owning slice's
// endpoint object instead.

const apiFetchSelectors = [
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.value=/^\/api\//]`,
    message:
      "Raw fetch('/api/…') bypasses the shared API contracts — call apiFetch (src/lib/api-client.ts) with the endpoint object from the owning slice's api-contract.ts.",
  },
];

// Typed-env enforcement: server code reads env through the validated registry
// in src/lib/env.ts, never process.env directly.

const processEnvSelectors = [
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']:not([property.name=/^NEXT_PUBLIC_/])",
    message:
      "Read server env through readEnv()/requireEnv() (src/lib/env.ts) — typed, lazy, and registry-documented.",
  },
];
```

<!-- uth:code id="code-stack-fallow" file=".fallowrc.json" lines="8-18,36-52,54-75" lang="json" -->
```json
{
  "entry": [
    "src/db/migrate.ts",
    "src/db/backfill-users-if-empty.ts",
    "src/db/ingest-sde-if-empty.ts",
    "src/db/ingest-sde.ts",
    "src/db/refresh-prices.ts",
    "src/db/refresh-sde.ts",
    "scripts/assert-route-classification.mjs",
    "drizzle.config.ts"
  ],
  "rules": {
    "unused-files": "error",
    "unused-exports": "error",
    "unused-dependencies": "error",
    "unlisted-dependencies": "error",
    "boundary-violation": "error",
    "stale-suppressions": "warn"
  },
  "health": {
    "maxCyclomatic": 20,
    "maxCognitive": 15,
    "maxCrap": 30.0
  }
}
```
<!-- uth:code-excerpts:end -->

