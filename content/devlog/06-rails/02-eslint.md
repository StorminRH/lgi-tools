## ESLint
<!-- updated: 2026-06-30 -->

ESLint is the fastest rail in the repo.

TypeScript tells me whether the code still type-checks. Tests tell me whether known behavior still holds. Fallow, now, handles the broader static-analysis pass. ESLint has a narrower job: catch the risky source shapes while the file is still open. It is the keyboard-level guard for patterns that are easy for an AI agent to produce and easy for a human to miss in review.

The first version of this rail came from [PR #36](https://github.com/StorminRH/lgi-tools/pull/36). At the time, a lot of architecture rules lived as prose: features do not import other features, data slices do not import features, UI primitives stay domain-agnostic, and inline styles were dangerous under the then-current CSP. Turning the mechanically-checkable pieces into lint errors was the right move. It made the repo stop relying on memory.

But that first shape also taught a boundary about the tooling itself. ESLint can inspect syntax quickly. It is less ideal as the long-term owner for whole-repo graph analysis, unused-code accounting, complexity, and duplication. When [PR #116](https://github.com/StorminRH/lgi-tools/pull/116) adopted Fallow as the static-analysis gate, those architecture-boundary rules moved there. That left ESLint with the things it is best at in this codebase: hooks and framework lint, restricted syntax, typed-call nudges, and source-level safety rails. The next section covers Fallow as the broader gate.

The current ESLint config starts with the Next.js recommended rule sets, then layers project-specific bans on top. One small but important override is unused variables. The repo allows a leading underscore to mean “this framework parameter or destructured field is intentionally unused.” That keeps the rule useful without fighting common Next and Drizzle shapes. A handler can accept `_request`, or a mapper can strip `{ waveId: _waveId, ...rest }`, without creating noise.<sup><a href="#code-eslint-unused-vars">1</a></sup>

The CSP rail is the oldest one still in the file, but its reason changed over time. Early on, inline `style={{ ... }}` was blocked because the production CSP dropped style attributes. Later CSP changes made inline styles technically possible, but the repo kept the ban as house style: static values belong in Tailwind classes, and runtime values should go through a CSS custom property set from an effect. The more important security part remains the raw-HTML ban. With inline scripts allowed by the current script policy, `dangerouslySetInnerHTML` and direct `innerHTML` or `outerHTML` writes are not casual escape hatches; they are XSS-shaped risks. ESLint catches those patterns syntactically.<sup><a href="#code-eslint-csp-selectors">2</a></sup>

[PR #78](https://github.com/StorminRH/lgi-tools/pull/78) added the color-token rail after a different kind of drift. The app had hardcoded hex colors spread through component class strings, SVG fills, borders, focus rings, and repeated tone values. That was not only a design problem. It was an AI problem. Once raw colors existed everywhere, future generated code had no obvious reason to use the token layer. The fix was two-part: route existing call-site colors into named `--color-*` tokens or the sanctioned `tones.ts` table, then ban new raw hex at call sites. The selector catches hex inside Tailwind arbitrary values and standalone hex constants.<sup><a href="#code-eslint-color-selectors">3</a></sup>

That change also exposed an ESLint flat-config gotcha. Rule options do not merge across matching config blocks; they replace. If I exempt `tones.ts` from the raw-hex ban, I cannot just “remove the color selector.” I have to restate every other restricted-syntax selector that should still apply there. The config now keeps selector groups in arrays so exemptions can deliberately re-list the bans they keep. That is less elegant than a magical merge, but it is honest. The exception is narrow, and the rest of the rails stay live.<sup><a href="#code-eslint-exemptions">4</a></sup>

[PR #89](https://github.com/StorminRH/lgi-tools/pull/89) added two more source-shape rails: typed API calls and typed environment reads. A literal `fetch('/api/...')` in client code bypasses the shared endpoint contracts, so ESLint rejects that shape and points the caller to `apiFetch`. The helper takes an endpoint object from the owning slice’s `api-contract.ts`, sends the same wire bytes the old call would have sent, and returns the contract’s response type. The lint rule is intentionally syntactic. It catches the common bad path, not every possible way to hide an API URL in a variable. The route-side contract test and TypeScript do the deeper drift work.<sup><a href="#code-eslint-api-fetch-selectors">5</a></sup><sup><a href="#code-eslint-api-client">6</a></sup>

The environment rule has the same shape. Server code reads environment variables through `readEnv` or `requireEnv`, not raw `process.env`, because the registry documents every server variable and validates lazily on access. Laziness is the important part. Importing a module should not explode because an environment variable is missing in a context that never calls the code path. `NODE_ENV` and `NEXT_PUBLIC_*` are intentionally exempt because bundlers and Next.js need those literal reads. Tests are exempt because they stub process env directly.<sup><a href="#code-eslint-env-selectors">7</a></sup><sup><a href="#code-eslint-env-registry">8</a></sup>

The ESI host ban came from the same lesson as the ESI gate. After [PR #91](https://github.com/StorminRH/lgi-tools/pull/91) moved ESI access out of the market-prices slice and into shared infrastructure, it was not enough to ask future code to use the gate. A single hand-written `esi.evetech.net` URL would bypass the shared User-Agent posture, compatibility date, timeout, conditional headers, and budget scoreboard. ESLint now rejects that host literal outside the gate itself and test files. The rule is scoped to ESI’s API host, not the EVE image server, because portraits and item icons are a different service.<sup><a href="#code-eslint-esi-selectors">9</a></sup>

The exceptions are deliberately visible. `src/lib/esi` is the only sanctioned home for the ESI API host literal. `tones.ts` is the sanctioned home for raw color literals. Dev and preview sandboxes may try off-palette colors, but they still keep the CSP, API, env, and ESI bans. Tests can stub env and mock ESI URLs. Those exceptions are not loopholes hidden in review culture; they are encoded in the config, and each one keeps the other rails active.<sup><a href="#code-eslint-exemptions">4</a></sup>

The API-contract convention test is the sibling to the raw-fetch ban. ESLint catches client code that reaches around `apiFetch`; the test catches route files that forget to import their owning contract at all. It only checks presence. The actual safety comes from route payloads using `satisfies`, clients using `apiFetch`, and `pnpm typecheck` seeing both sides. This is the pattern I like: one small mechanical assertion forces the right shape, and the type system does the precise work after that.<sup><a href="#code-eslint-api-contract-test">10</a></sup>

The rail only matters because it runs everywhere. `pnpm lint` is part of the local `verify` command and the GitHub Actions test workflow. That makes ESLint part of the same definition of done as typecheck, tests, route presence, and Fallow. If an AI agent adds a raw API fetch, a direct server env read, a hardcoded ESI URL, a raw HTML sink, or a new call-site hex color, the failure shows up before merge.<sup><a href="#code-eslint-package-ci">11</a></sup><sup><a href="#code-eslint-workflow">12</a></sup>

The lesson here is restraint. ESLint is not the place to encode every preference or every architectural judgment. Overusing it would make the repo harder to work in and teach agents to fight the tooling. The rules that stay here are the ones that are syntactic, explainable, cheap, and tied to a real mistake: no raw HTML sinks, no inline-style escape hatch, no call-site hex colors, no raw own-API fetches, no direct server env reads, and no ESI host outside the shared gate.

That is the standard I want for rails in an AI-built codebase. Do not make a rule because it sounds strict. Make a rule because the repo already learned what happens without it.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-eslint-unused-vars" file="eslint.config.mjs" lines="119-144" lang="js" -->
```js
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Recognize the leading-underscore convention as "intentionally unused".
  // Lets handlers declare framework-required parameters they don't read
  // (e.g. NextRequest in a GET that only redirects) and lets destructuring
  // peel fields off with `{ waveId: _waveId, ...rest }` without warnings.
  {
    rules: {
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
```

<!-- uth:code id="code-eslint-csp-selectors" file="eslint.config.mjs" lines="7-29" lang="js" -->
```js
const cspSelectors = [
  {
    selector: "JSXAttribute[name.name='style']",
    message:
      "No inline `style` attributes — house style. Prefer Tailwind classes for static values, or a CSS custom property set via ref.style.setProperty in an effect for runtime-dynamic ones (inline styles are CSP-permitted but not the default). See CONTRIBUTING.md (Security & CSP).",
  },
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message:
      "No `dangerouslySetInnerHTML` — the production CSP allows `'unsafe-inline'` scripts, so an unescaped HTML sink becomes an XSS vector. Render text through JSX (auto-escaped) instead. See CONTRIBUTING.md (Security & CSP).",
  },
  {
    selector:
      "AssignmentExpression[left.property.name=/^(inner|outer)HTML$/]",
    message:
      "No raw `innerHTML`/`outerHTML` writes — same XSS risk as dangerouslySetInnerHTML under the `'unsafe-inline'` CSP. Use safe DOM APIs (textContent, createElement) instead. See CONTRIBUTING.md (Security & CSP).",
  },
];
```

<!-- uth:code id="code-eslint-color-selectors" file="eslint.config.mjs" lines="31-57" lang="js" -->
```js
const hexColorSelectors = [
  {
    selector: "Literal[value=/\\[[^\\]]*#[0-9a-fA-F]{3,8}/]",
    message:
      "No raw hex in Tailwind arbitrary values — route the color through a token (a `--color-*` in globals.css `@theme`, surfaced as `bg-…`/`text-…`/`border-…`/`fill-…`) or tones.ts. See CONTRIBUTING.md (Color tokens).",
  },
  {
    selector: "TemplateElement[value.raw=/\\[[^\\]]*#[0-9a-fA-F]{3,8}/]",
    message:
      "No raw hex in Tailwind arbitrary values (template literal) — route the color through a `--color-*` token (globals.css `@theme`) or tones.ts. See CONTRIBUTING.md (Color tokens).",
  },
  {
    selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
    message:
      "No raw hex color constants — SVG fills/strokes read from tones.ts (toneHex) or a Tailwind `fill-…`/`stroke-…` utility backed by a `--color-*` token. See CONTRIBUTING.md (Color tokens).",
  },
];
```

<!-- uth:code id="code-eslint-exemptions" file="eslint.config.mjs" lines="187-232" lang="js" -->
```js
// The ESI gate slice is the sanctioned home for the ESI host literal — the
// whole point of the ban is to funnel consumers here. Re-state every other
// ban without the host selectors (replace semantics).
{
  files: ["src/lib/esi/**/*.{ts,tsx,mts}"],
  ignores: ["**/*.test.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...cspSelectors,
      ...hexColorSelectors,
      ...apiFetchSelectors,
      ...processEnvSelectors,
    ],
  },
},
// tones.ts is the sanctioned home for raw color literals — `toneHex` is the
// JS source for SVG fills. Re-state every other ban without the hex selectors
// so only the color rule is lifted here (replace semantics).
{
  files: ["src/components/ui/tones.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...cspSelectors,
      ...apiFetchSelectors,
      ...processEnvSelectors,
      ...esiHostSelectors,
    ],
  },
},
```

<!-- uth:code id="code-eslint-api-fetch-selectors" file="eslint.config.mjs" lines="59-78,145-167" lang="js" -->
```js
const apiFetchSelectors = [
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.value=/^\/api\//]`,
    message:
      "Raw fetch('/api/…') bypasses the shared API contracts — call apiFetch (src/lib/api-client.ts) with the endpoint object from the owning slice's api-contract.ts. See CONTRIBUTING.md (Architecture invariants).",
  },
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.quasis.0.value.raw=/^\/api\//]`,
    message:
      "Raw fetch(`/api/…`) bypasses the shared API contracts — call apiFetch (src/lib/api-client.ts) with the endpoint object from the owning slice's api-contract.ts. See CONTRIBUTING.md (Architecture invariants).",
  },
];

{
  files: ["**/*.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...cspSelectors,
      ...hexColorSelectors,
      ...apiFetchSelectors,
    ],
  },
},
```

<!-- uth:code id="code-eslint-api-client" file="src/lib/api-client.ts" lines="16-30,35-71" lang="ts" -->
```ts
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
      console.error(
        `[api-client] ${endpoint.method} ${endpoint.path} response drifted from its contract`,
        check.error,
      );
    }
  }
  return { ok: true, status: res.status, data };
}
```

<!-- uth:code id="code-eslint-env-selectors" file="eslint.config.mjs" lines="102-117,168-186" lang="js" -->
```js
const processEnvSelectors = [
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']:not([property.name=/^NEXT_PUBLIC_/])",
    message:
      "Read server env through readEnv()/requireEnv() (src/lib/env.ts) — typed, lazy, and registry-documented. NODE_ENV and NEXT_PUBLIC_* stay direct reads. See CONTRIBUTING.md (Architecture invariants).",
  },
];

{
  files: ["src/**/*.{ts,tsx,mts}"],
  ignores: ["**/*.test.{ts,tsx}", "src/lib/env.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...cspSelectors,
      ...hexColorSelectors,
      ...apiFetchSelectors,
      ...processEnvSelectors,
      ...esiHostSelectors,
    ],
  },
},
```

<!-- uth:code id="code-eslint-env-registry" file="src/lib/env.ts" lines="29-41,43-63,70-87" lang="ts" -->
```ts
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

<!-- uth:code id="code-eslint-esi-selectors" file="eslint.config.mjs" lines="80-100,187-202" lang="js" -->
```js
const esiHostSelectors = [
  {
    selector: String.raw`Literal[value=/esi\.evetech\.net/]`,
    message:
      "Don't hand-write ESI URLs — build them with esiUrl() and dispatch through esiFetch (@/lib/esi): the gate owns CCP's shared per-IP error budget. See CONTRIBUTING.md (Architecture invariants).",
  },
  {
    selector: String.raw`TemplateElement[value.raw=/esi\.evetech\.net/]`,
    message:
      "Don't hand-write ESI URLs (template literal) — build them with esiUrl() and dispatch through esiFetch (@/lib/esi): the gate owns CCP's shared per-IP error budget. See CONTRIBUTING.md (Architecture invariants).",
  },
];

{
  files: ["src/lib/esi/**/*.{ts,tsx,mts}"],
  ignores: ["**/*.test.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...cspSelectors,
      ...hexColorSelectors,
      ...apiFetchSelectors,
      ...processEnvSelectors,
    ],
  },
},
```

<!-- uth:code id="code-eslint-api-contract-test" file="src/app/api/api-contracts.test.ts" lines="8-14,48-62" lang="ts" -->
```ts
// Mechanical API-contract guard (3.4.T) — the sibling of authz-markers.test.ts.
// Every route handler under src/app/api must import from its owning slice's
// api-contract module, where its request schema and response types live, so the
// route and its clients share one wire shape.

describe('api contract imports', () => {
  it('finds at least one API route file (guards against a broken glob passing vacuously)', () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(0);
  });

  it.each(ROUTE_FILES)('%s imports from its slice\'s api-contract module', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(
      CONTRACT_IMPORT_RE.test(src),
      `${label(file)} does not import from an api-contract module.`,
    ).toBe(true);
  });
});
```

<!-- uth:code id="code-eslint-package-ci" file="package.json" lines="21-28,43-48" lang="json" -->
```json
{
  "build": "next build",
  "build:vercel": "tsx src/db/migrate.ts && tsx src/db/backfill-users-if-empty.ts && tsx src/db/ingest-sde-if-empty.ts && next build && node scripts/assert-route-classification.mjs",
  "assert:routes": "node scripts/assert-route-classification.mjs",
  "assert:routes-present": "node scripts/assert-routes-present.mjs",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "fallow": "fallow audit --fail-on-issues",
  "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm fallow"
}
```

<!-- uth:code id="code-eslint-workflow" file=".github/workflows/test.yml" lines="32-41,51-67" lang="yaml" -->
```yaml
- run: pnpm typecheck

- run: pnpm lint

# Lightweight presence gate (no build): every src/app route is classified
# in route-classification.json and vice-versa.
- run: pnpm assert:routes-present

- run: pnpm test:coverage

# fallow audit is the static gate of record (dead code, duplication,
# complexity, architecture boundaries), scoped to the PR diff with
# new-only attribution.
- run: pnpm fallow
  env:
    FALLOW_AUDIT_BASE: ${{ github.event.pull_request.base.sha || github.event.before }}
```
<!-- uth:code-excerpts:end -->
