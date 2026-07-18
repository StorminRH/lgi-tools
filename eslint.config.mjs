import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsdoc from "eslint-plugin-jsdoc";
import tsdoc from "eslint-plugin-tsdoc";

// Shared `no-restricted-syntax` selector sets. Factored out because flat config
// REPLACES (does not merge) a rule's options for each matching file — so a
// per-file exemption that lifts one ban must re-list every ban it still wants.
// Keeping the CSP selectors in one const lets the tones.ts / preview-sandbox
// exemptions re-state them verbatim with no drift.
const inlineStyleSelectors = [
  {
    selector: "JSXAttribute[name.name='style']",
    message:
      "No inline `style` attributes — house style. Prefer Tailwind classes for static values, or a CSS custom property set via ref.style.setProperty in an effect for runtime-dynamic ones (inline styles are CSP-permitted but not the default). See CONTRIBUTING.md (Security & CSP).",
  },
];

const rawHtmlSelectors = [
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

const cspSelectors = [...inlineStyleSelectors, ...rawHtmlSelectors];

// Raw color literals belong in the token layer (the `@theme` block in
// globals.css and tones.ts), not hardcoded at call sites. Two shapes: a hex
// anywhere inside a Tailwind arbitrary value — `bg-[#1e2c3a]`, but also one
// embedded mid-value like `shadow-[0_0_4px_#dd4444]` (`\[[^\]]*#…` matches the
// hex wherever it sits in the `[…]` chunk, in a className or cva/clsx string —
// a TemplateElement when interpolated); and a whole-string hex constant like an
// SVG `fill="#0d0f14"`. tones.ts (the JS source for SVG fills) and the
// preview sandbox are exempted below. 3.3.9 routed every call-site color
// into a `--color-*` token; this keeps them there.
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

// Alpha colors follow the same boundary as hex colors, but have only one
// sanctioned home: the globals.css token layer.
const rgbaColorSelectors = [
  {
    selector: "Literal[value=/rgba\\s*\\(/]",
    message:
      "No raw rgba() colors at call sites — define the exact alpha color in globals.css `@theme` and consume its named token utility. See CONTRIBUTING.md (Color tokens).",
  },
  {
    selector: "TemplateElement[value.raw=/rgba\\s*\\(/]",
    message:
      "No raw rgba() colors at call sites (template literal) — define the exact alpha color in globals.css `@theme` and consume its named token utility. See CONTRIBUTING.md (Color tokens).",
  },
];

// Type-scale enforcement (3.8.2.1): raw bracketed pixel font sizes belong on the
// named ladder — the `--text-*` scale in globals.css `@theme` (micro, label, ui,
// body, lead, h3, stat, h2, display). Mirrors the hex-color ban: a plain className
// Literal and an interpolated (cva/clsx/cn) TemplateElement. The regex matches only
// a bracketed numeric px/rem/em value, so it never fires on clamp() or var()
// arbitrary values, width brackets, or leading utilities. Deliberately NOT added to
// the base "**/*.{ts,tsx}" block, so test files (arbitrary-value fixtures) fall
// through to it exempt; the preview sandbox is exempted below. A justified one-off
// opts out with an inline eslint-disable-next-line no-restricted-syntax comment.
// (Prose here avoids literal bracket class tokens — Tailwind's content scanner
// reads this file and would try to compile them.)
const textSizeSelectors = [
  {
    selector: "Literal[value=/text-\\[[0-9.]+(px|rem|em)\\]/]",
    message:
      "No raw arbitrary font sizes — use the named type scale (micro/label/ui/body/lead/h3/stat/h2/display), backed by the `--text-*` tokens in globals.css `@theme`. See CONTRIBUTING.md (Type scale).",
  },
  {
    selector: "TemplateElement[value.raw=/text-\\[[0-9.]+(px|rem|em)\\]/]",
    message:
      "No raw arbitrary font sizes (template literal) — use the named type scale (the `--text-*` tokens in globals.css `@theme`). See CONTRIBUTING.md (Type scale).",
  },
];

// Radius-scale enforcement (3.8.2.2): raw bracketed pixel radii belong on the two
// named tokens — `--radius-ctl` / `--radius-card` in globals.css `@theme` (surfaced
// as `rounded-ctl` / `rounded-card`). Mirrors the type-scale ban: a plain className
// Literal and an interpolated (cva/clsx/cn) TemplateElement, matching only a
// bracketed numeric px/rem/em value — so it never fires on `rounded-full` or a
// `rounded-[var(…)]`. The two sub-4px inner indicators (the switch thumb, the
// checkbox fill) opt out with an inline eslint-disable-next-line. (Prose here stays
// unbracketed — Tailwind's content scanner reads this file.)
const roundedSizeSelectors = [
  {
    selector: "Literal[value=/rounded-\\[[0-9.]+(px|rem|em)\\]/]",
    message:
      "No raw arbitrary radii — use the named radius tokens (rounded-ctl / rounded-card), backed by `--radius-ctl` / `--radius-card` in globals.css `@theme`. See CONTRIBUTING.md (Radius scale).",
  },
  {
    selector: "TemplateElement[value.raw=/rounded-\\[[0-9.]+(px|rem|em)\\]/]",
    message:
      "No raw arbitrary radii (template literal) — use the named radius tokens (rounded-ctl / rounded-card). See CONTRIBUTING.md (Radius scale).",
  },
];

// Component-system enforcement (3.8.2.2): styled form fields live on the shared
// primitives, not hand-rolled. A raw <select> is fully banned — the Select
// primitive (components/ui/select.tsx, 3.8.2.3) is a Base UI overlay, so nothing in
// the tree renders a native <select> and the ban carries no exemption. An
// `inputClass`-style constant is the ad-hoc field string the Input/Select/Textarea
// primitives replaced. Test files fall through exempt (they ride the src/** block,
// which ignores tests).
const selectElementSelectors = [
  {
    selector: "JSXOpeningElement[name.name='select']",
    message:
      "No raw <select> — use the Select primitive (@/components/ui/select), which owns the engraved field + dropdown-panel look. See CONTRIBUTING.md (Component system).",
  },
];
const inputClassSelectors = [
  {
    selector: "VariableDeclarator[id.name=/[iI]nputClass$/]",
    message:
      "No ad-hoc field-style constants — the Input/Select/Textarea primitives (@/components/ui/input) own the field styling. See CONTRIBUTING.md (Component system).",
  },
];

// Typed-API-call enforcement (3.4.T): a literal fetch('/api/…') bypasses the
// shared contracts, so client code must go through apiFetch with the owning
// slice's endpoint object instead. The selectors match only a string/template
// literal as fetch's FIRST argument — api-client.ts itself fetches a variable
// (`endpoint.path`) and sendBeacon isn't `fetch`, so no exemptions are needed.
// Known gaps (an /api path held in a variable; a `${base}/api/…` template) are
// accepted: the route-side convention test (api-contracts.test.ts) still
// guarantees a contract exists, and review covers the call site.
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
  // An inline object literal as apiFetch's first argument bypasses the
  // declared-endpoint convention (it typechecks against ApiEndpoint).
  // Endpoints are declared once in the owning slice's api-contract.ts and
  // passed by name.
  {
    selector: "CallExpression[callee.name='apiFetch'] > ObjectExpression:first-child",
    message:
      "Inline apiFetch endpoint objects bypass the declared API-contract convention — pass the named endpoint object from the owning slice's api-contract.ts.",
  },
];

// Real-Postgres suites use the lifecycle-owning test harness instead of
// constructing a second client or embedding credentials/schema steering. The
// harness module itself is outside the `*.db.test.ts` rail below.
const directPostgresSelectors = [
  {
    selector: "ImportDeclaration[source.value='postgres']",
    message:
      "DB suites use createDbTestHarness (@/db/test-support/db-test-harness); importing postgres-js directly bypasses the shared lifecycle even when the import is aliased.",
  },
  {
    selector: "CallExpression[callee.name='postgres']",
    message:
      "DB suites use createDbTestHarness (@/db/test-support/db-test-harness); direct postgres() construction duplicates reachability, schema steering, and teardown.",
  },
];

const postgresConnectionStringSelectors = [
  {
    selector: "Literal[value=/^postgres(?:ql)?:\\/\\//]",
    message:
      "DB suites must not embed Postgres connection strings — createDbTestHarness owns the local URL and disposable-schema steering.",
  },
  {
    selector: "TemplateElement[value.raw=/^postgres(?:ql)?:\\/\\//]",
    message:
      "DB suites must not embed Postgres connection strings — createDbTestHarness owns the local URL and disposable-schema steering.",
  },
];

// ESI gate enforcement (3.4.5): CCP's error limit is per-IP and shared across
// every ESI call the app makes — one un-gated call burns budget the shared
// scoreboard can't see, and overrunning the limit is a permanent IP-wide ban.
// Banning the host literal outside src/lib/esi means the only way to target
// ESI is the gate's own exports (esiUrl + esiFetch). Scoped to the API host
// exactly: images.evetech.net (the EVE image server) stays legitimately used
// across the UI. Test files are exempt (they mock with host URLs); the gate
// slice itself is exempted below. A hand-assembled host string would slip
// through — accepted, same altitude as the other syntactic bans here.
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

// Typed-env enforcement (3.4.T): server code reads env through the validated
// registry in src/lib/env.ts, never process.env directly. Exempted by the
// selector itself: NODE_ENV (bundler-inlined, must stay a direct read) and
// NEXT_PUBLIC_* (client env — Next's build-time inlining needs the literal
// static read). A bare `process.env` pass-through (an injectable test
// parameter like `env = process.env`) is not a per-variable read and doesn't
// match. env.ts itself is file-exempted below; test files are excluded (they
// stub env directly).
const processEnvSelectors = [
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']:not([property.name=/^NEXT_PUBLIC_/])",
    message:
      "Read server env through readEnv()/requireEnv() (src/lib/env.ts) — typed, lazy, and registry-documented. NODE_ENV and NEXT_PUBLIC_* stay direct reads. See CONTRIBUTING.md (Architecture invariants).",
  },
];

// Dataset freshness windows belong to the ESI dataset registry. A suffix
// narrow enough to avoid unrelated timeouts and cache durations catches the
// duplicated per-feature constants this rail replaces. The registry leaf is
// exempted below so it remains the one legal owner if a named value is ever
// needed there.
const datasetTtlSelectors = [
  {
    selector: "VariableDeclarator[id.name=/_TTL_MS$/]",
    message:
      "Dataset TTL constants belong in the ESI dataset registry; bind a gate from @/lib/esi-datasets/freshness instead.",
  },
];

// UI-library import rail (3.9.2.9, PL-012): feature and app code consume
// Base UI and sonner only through the wrap-once library in
// src/components/ui/. Factored like the selector families above because
// flat-config rule options REPLACE per matching file — every block that
// re-states no-restricted-imports must re-list the bans it keeps.
const baseUiImportPatterns = [
  {
    group: ["@base-ui/react", "@base-ui/react/*"],
    message:
      "Base UI is consumed only through the shared wrappers in @/components/ui — import the primitive (Dialog, Select, Tooltip, …), not the package. See CONTRIBUTING.md (Component system).",
  },
];

// The pre-1.0 package name; never a valid dependency in this repo.
const deprecatedBaseUiImportPatterns = [
  {
    group: ["@base-ui-components/react", "@base-ui-components/react/*"],
    message:
      "@base-ui-components/react is the deprecated Base UI package — the repo uses @base-ui/react, and only through the shared wrappers in @/components/ui.",
  },
];

const sonnerImportPatterns = [
  {
    group: ["sonner"],
    message:
      "sonner is consumed only through @/components/ui/toast (the sole Toaster owner) — import its toast helpers instead. See CONTRIBUTING.md (Component system).",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Recognize the leading-underscore convention as "intentionally unused".
  // Lets handlers declare framework-required parameters they don't read
  // (e.g. NextRequest in a GET that only redirects) and lets destructuring
  // peel fields off with `{ waveId: _waveId, ...rest }` without warnings.
  {
    rules: {
      // EveImage is the only rendered-image seam. The shared wrapper keeps
      // next/image's layout/loading behavior while its custom loader sends EVE
      // requests directly to CCP (never Vercel's optimizer).
      "@next/next/no-img-element": "error",
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
  // Keep the billed Next image optimizer structurally unreachable from feature
  // code. The one ignored module owns both allowed paths: CCP's custom loader
  // and explicit unoptimized delivery for the local EVE SSO asset. This is a
  // dedicated rule block, so it cannot replace any no-restricted-syntax bans.
  {
    files: ["src/**/*.{ts,tsx,mts}"],
    ignores: [
      "src/components/eve-image.tsx",
      "src/components/ui/checkbox.tsx",
      "src/components/ui/combobox.tsx",
      "src/components/ui/dialog.tsx",
      "src/components/ui/field.tsx",
      "src/components/ui/menu.tsx",
      "src/components/ui/navigation-menu.tsx",
      "src/components/ui/popover.tsx",
      "src/components/ui/radio-group.tsx",
      "src/components/ui/segmented.tsx",
      "src/components/ui/select.tsx",
      "src/components/ui/stepper.tsx",
      "src/components/ui/switch.tsx",
      "src/components/ui/tabs.tsx",
      "src/components/ui/toast.tsx",
      "src/components/ui/tooltip.tsx",
      "src/lib/esi-datasets/**/*.{ts,tsx,mts}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/image",
              message:
                "Import EveImage from @/components/eve-image. It is the only module allowed to select CCP's custom loader or the explicit unoptimized static path.",
            },
          ],
          patterns: [
            {
              group: ["**/staleness"],
              message:
                "Import freshness verdicts from @/lib/esi-datasets/freshness; feature-local staleness modules duplicate registry policy.",
            },
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
          ],
        },
      ],
    },
  },
  // Base UI wrappers retain package access but remain subject to every other
  // import rail, including sonner exclusivity.
  {
    files: [
      "src/components/ui/checkbox.tsx",
      "src/components/ui/combobox.tsx",
      "src/components/ui/dialog.tsx",
      "src/components/ui/field.tsx",
      "src/components/ui/menu.tsx",
      "src/components/ui/navigation-menu.tsx",
      "src/components/ui/popover.tsx",
      "src/components/ui/radio-group.tsx",
      "src/components/ui/segmented.tsx",
      "src/components/ui/select.tsx",
      "src/components/ui/stepper.tsx",
      "src/components/ui/switch.tsx",
      "src/components/ui/tabs.tsx",
      "src/components/ui/tooltip.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/image",
              message:
                "Import EveImage from @/components/eve-image. It is the only module allowed to select CCP's custom loader or the explicit unoptimized static path.",
            },
          ],
          patterns: [
            {
              group: ["**/staleness"],
              message:
                "Import freshness verdicts from @/lib/esi-datasets/freshness; feature-local staleness modules duplicate registry policy.",
            },
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
          ],
        },
      ],
    },
  },
  // toast.tsx is the sole sonner owner; Base UI remains restricted here.
  {
    files: ["src/components/ui/toast.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/image",
              message:
                "Import EveImage from @/components/eve-image. It is the only module allowed to select CCP's custom loader or the explicit unoptimized static path.",
            },
          ],
          patterns: [
            {
              group: ["**/staleness"],
              message:
                "Import freshness verdicts from @/lib/esi-datasets/freshness; feature-local staleness modules duplicate registry policy.",
            },
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
          ],
        },
      ],
    },
  },
  // The ESI dataset leaf remains subject to the next/image boundary, but may
  // own internal freshness modules without tripping the consumer import rail.
  {
    files: ["src/lib/esi-datasets/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/image",
              message:
                "Import EveImage from @/components/eve-image. It is the only module allowed to select CCP's custom loader or the explicit unoptimized static path.",
            },
          ],
          patterns: [
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
          ],
        },
      ],
    },
  },
  // Cron route declarations reach auth, advisory locks, the direct DB client,
  // and durable outcome telemetry only through defineCronRoute. Keep the
  // existing next/image boundary in this replacement block as well.
  {
    files: ["src/app/api/cron/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/image",
              message:
                "Import EveImage from @/components/eve-image. It is the only module allowed to select CCP's custom loader or the explicit unoptimized static path.",
            },
            {
              name: "@/lib/cron",
              importNames: ["requireCronAuth"],
              message:
                "Cron routes declare auth through defineCronRoute; do not bypass the shell ordering.",
            },
            {
              name: "@/db/advisory-lock",
              importNames: ["withAdvisoryLock"],
              message:
                "Cron routes declare lock policy through defineCronRoute; do not reserve locks directly.",
            },
            {
              name: "@/db",
              importNames: ["directClient"],
              message:
                "Cron work receives the shared client from CronWorkContext; do not import directClient.",
            },
            {
              name: "@/data/telemetry/queries",
              importNames: ["logUsageEvent"],
              message:
                "Cron outcome telemetry belongs to defineCronRoute or CronWorkContext.record.",
            },
          ],
          patterns: [
            {
              group: ["**/staleness"],
              message:
                "Import freshness verdicts from @/lib/esi-datasets/freshness; feature-local staleness modules duplicate registry policy.",
            },
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
          ],
        },
      ],
    },
  },
  // CSP + color tokens: two families of `no-restricted-syntax` bans share one
  // block (the rule's options REPLACE across matching files, so they can't be
  // split into two `**/*.{ts,tsx}` objects without one wiping the other).
  //   • CSP / house style — inline `style="…"` is lint-banned as house style
  //     (Tailwind + CSSOM preferred); it is CSP-permitted since OOB.1.1, not a
  //     CSP violation. The dangerouslySetInnerHTML / raw-innerHTML bans (3.0.4.6)
  //     keep the "no raw-HTML sinks" property that makes
  //     `script-src 'self' 'unsafe-inline'` safe. The `.ts`/`.tsx` glob also
  //     catches a direct `el.innerHTML = …` in a plain helper.
  //   • Color tokens (3.3.9) — raw hex must live in the token layer, not at call
  //     sites. tones.ts and the preview sandbox are exempted just below.
  // See CONTRIBUTING.md (Security & CSP / Color tokens).
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
      ],
    },
  },
  // Dataset-window declarations are a src/ registry concern. Keep the rail on
  // source tests too, without applying it to Convex's separate response-Expires
  // fallback policy through the repository-wide base block.
  {
    files: ["src/**/*.test.{ts,tsx}"],
    ignores: ["src/lib/esi-datasets/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...datasetTtlSelectors,
      ],
    },
  },
  // Real-Postgres suites retain the base syntax rails and add the DB-harness
  // boundary. Flat-config rule options replace rather than merge, so this block
  // must re-list every selector family inherited from the base test config.
  {
    files: ["src/**/*.db.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...directPostgresSelectors,
        ...postgresConnectionStringSelectors,
        ...datasetTtlSelectors,
      ],
    },
  },
  // Typed env applies to production src code only: test files stub process.env
  // directly (vi.stubEnv and friends), and env.ts is the one module that reads
  // process.env by design. Both keep every other ban via the base block above.
  // The ESI host ban rides along here for the same reason: production src
  // only, tests mock with host URLs.
  {
    files: ["src/**/*.{ts,tsx,mts}"],
    ignores: ["**/*.test.{ts,tsx}", "src/lib/env.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...datasetTtlSelectors,
      ],
    },
  },
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
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...textSizeSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...datasetTtlSelectors,
      ],
    },
  },
  // env.ts is exempt from the process.env ban, not from the dataset-window
  // ownership rail.
  {
    files: ["src/lib/env.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...datasetTtlSelectors,
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
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...datasetTtlSelectors,
      ],
    },
  },
  // Preview pages may intentionally try off-palette hex one-offs, but alpha
  // colors still use the shared token layer. Re-state every other ban.
  {
    files: ["src/app/preview/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...cspSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...datasetTtlSelectors,
      ],
    },
  },
  // Satori requires JSX style objects in generated Open Graph image routes.
  // Lift only that selector, only for the framework's opengraph-image file
  // convention, and re-state every other production-source restriction because
  // flat-config rule options replace rather than merge.
  {
    files: ["src/app/**/opengraph-image.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...rawHtmlSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...datasetTtlSelectors,
      ],
    },
  },
  // The registry leaf is the one legal owner of dataset windows. Re-state
  // every production-source syntax rail except the dataset TTL selector.
  {
    files: ["src/lib/esi-datasets/**/*.{ts,tsx,mts}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
      ],
    },
  },
  // Tests inside the registry leaf retain the common syntax rails while
  // sharing the leaf's dataset-TTL exemption.
  {
    files: ["src/lib/esi-datasets/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "convex/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
    plugins: { jsdoc, tsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: { esm: true, ancestorsOnly: true },
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
          },
          exemptOverloadedImplementations: true,
          skipInterveningOverloadedDeclarations: false,
          contexts: [
            "ExportNamedDeclaration > VariableDeclaration",
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
            "TSEnumDeclaration",
            "TSDeclareFunction",
          ],
        },
      ],
      "tsdoc/syntax": "error",
      "no-warning-comments": [
        "error",
        { terms: ["todo", "fixme"], location: "anywhere" },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gitignored working docs (SCRATCHPAD, plan/audit artifacts) — not source.
    "docs/**",
    // Gitignored local-only Claude Code state, incl. harness worktrees under
    // .claude/worktrees/** (a full repo copy whose prefixed paths bypass the
    // per-file exemptions below — e.g. tones.ts, the preview sandbox).
    ".claude/**",
    // Convex generated code (committed for CI typecheck, regenerated on deploy).
    "convex/_generated/**",
  ]),
]);

export default eslintConfig;
