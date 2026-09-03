import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tsdoc from "eslint-plugin-tsdoc";

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

const textSizeSelectors = [
  {
    selector: "Literal[value=/text-\\[[0-9.]+(px|rem|em)\\]/]",
    message:
      "No raw arbitrary font sizes — use the named type scale (micro/label/ui/body/lead/h3/stat/h2/display/hero), backed by the `--text-*` tokens in globals.css `@theme`. See CONTRIBUTING.md (Type scale).",
  },
  {
    selector: "TemplateElement[value.raw=/text-\\[[0-9.]+(px|rem|em)\\]/]",
    message:
      "No raw arbitrary font sizes (template literal) — use the named type scale (the `--text-*` tokens in globals.css `@theme`). See CONTRIBUTING.md (Type scale).",
  },
];

const legacyTypeRoleSelectors = [
  {
    selector:
      "Literal[value=/(?:^|\\s)(?:\\S+:)*(?:font-(?:mono|jb|body)|tracking-(?:ui|control|emphasis|display))(?:\\s|$)/]",
    message:
      "No retired font or tracking utility — use font-ui/font-data/font-display and the registered tracking scale.",
  },
  {
    selector:
      "TemplateElement[value.raw=/(?:^|\\s)(?:\\S+:)*(?:font-(?:mono|jb|body)|tracking-(?:ui|control|emphasis|display))(?:\\s|$)/]",
    message:
      "No retired font or tracking utility — use font-ui/font-data/font-display and the registered tracking scale.",
  },
];

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

const rawButtonSelector = {
  selector: "JSXOpeningElement[name.name='button']",
  message:
    "No raw <button> in production UI — use Button or buttonVariants from @/components/ui/button.",
};
const visibleInputSelector = {
  selector:
    "JSXOpeningElement[name.name='input']:not(:has(JSXAttribute[name.name='type'][value.value='hidden']))",
  message:
    "No visible raw <input> in production UI — use Input, Checkbox, RadioGroup, Switch, Stepper, or the owning primitive.",
};
const textareaSelector = {
  selector: "JSXOpeningElement[name.name='textarea']",
  message:
    "No raw <textarea> in production UI — use Textarea from @/components/ui/input.",
};
const tableSelector = {
  selector: "JSXOpeningElement[name.name='table']",
  message:
    "No raw <table> in production UI — use StaticTable or SortableTable from @/components/ui.",
};
const detailsSelector = {
  selector: "JSXOpeningElement[name.name='details']",
  message:
    "No raw <details> in production UI — use Collapsible unless the local exception documents an owning native-details contract.",
};

const nativeTitleSelector = {
  selector:
    "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='title']",
  message:
    "No native title attribute on lowercase JSX elements — use Tooltip or Popover so the hint is focusable and touch-accessible.",
};
const buttonTitleSelector = {
  selector:
    "JSXOpeningElement[name.name='Button'] > JSXAttribute[name.name='title']",
  message:
    "No native title forwarded through Button — use Tooltip or Popover unless this is an approved disabled-control exception.",
};
const jsxButtonRoleSelector = {
  selector:
    "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='role'][value.value='button']",
  message:
    "No role='button' reimplementation — use the Button primitive and its native keyboard semantics.",
};
const objectButtonRoleSelector = {
  selector: "Property[key.name='role'][value.value='button']",
  message:
    "No object-authored role='button' reimplementation — use the Button primitive and its native keyboard semantics.",
};
const rawPressedSelector = {
  selector:
    "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='aria-pressed']",
  message:
    "No raw pressed-button semantics — use Button, Segmented, ChipToggle, or another owning primitive.",
};
const liveRegionSelector = {
  selector:
    "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='role'][value.value=/^(alert|status)$/]",
  message:
    "No hand-built alert/status region — use Banner, Callout, EmptyState, LoadingLabel, or Skeleton.",
};
const actionClassSelector = {
  selector:
    "VariableDeclarator[id.name=/[bB]utton(Class|Classes)$|[aA]ction(Class|Classes)$|[hH]eader(Class|Classes)$|[hH]eading(Class|Classes)$|[tT]itle(Class|Classes)$|_(BTN|BOX)$|^SECTION_HEAD$/]",
  message:
    "No ad-hoc action or heading class constants — use the owning Button, SectionHeader, SectionLabel, or PageHead primitive.",
};

const uiElementSelectors = [
  rawButtonSelector,
  visibleInputSelector,
  textareaSelector,
  tableSelector,
  detailsSelector,
];

const uiSemanticSelectors = [
  nativeTitleSelector,
  buttonTitleSelector,
  jsxButtonRoleSelector,
  objectButtonRoleSelector,
  rawPressedSelector,
  liveRegionSelector,
  actionClassSelector,
];

const emptyStateTokenSelectors = [
  {
    selector: "Literal[value=/text-empty/]",
    message:
      "No empty-state token at a call site — consume the EmptyState primitive.",
  },
  {
    selector: "TemplateElement[value.raw=/text-empty/]",
    message:
      "No empty-state token at a call site — consume the EmptyState primitive.",
  },
];

const toneTokenSelectors = [
  {
    selector: "Literal[value=/(?:bg|text|border)-(?:pill|chip)-/]",
    message:
      "No pill/chip tone token at a call site — consume the owning tone primitive.",
  },
  {
    selector: "TemplateElement[value.raw=/(?:bg|text|border)-(?:pill|chip)-/]",
    message:
      "No pill/chip tone token at a call site — consume the owning tone primitive.",
  },
];

const skeletonTokenSelectors = [
  {
    selector: "Literal[value=/skeleton-shimmer/]",
    message:
      "No skeleton token at a call site — consume the Skeleton primitive.",
  },
  {
    selector: "TemplateElement[value.raw=/skeleton-shimmer/]",
    message:
      "No skeleton token at a call site — consume the Skeleton primitive.",
  },
];

const progressTokenSelectors = [
  {
    selector: "Literal[value=/--pct/]",
    message:
      "No progress custom property at a call site — consume the ProgressBar primitive.",
  },
  {
    selector: "TemplateElement[value.raw=/--pct/]",
    message:
      "No progress custom property at a call site — consume the ProgressBar primitive.",
  },
];

const loadingToastSelector = {
  selector:
    "CallExpression[callee.object.name='toast'][callee.property.name='loading']",
  message:
    "Do not call toast.loading directly — use the shared loading-toast primitive.",
};

const uiTokenSelectors = [
  ...emptyStateTokenSelectors,
  ...toneTokenSelectors,
  ...skeletonTokenSelectors,
  ...progressTokenSelectors,
  loadingToastSelector,
];

const uiAdoptionSelectors = [
  ...uiElementSelectors,
  ...uiSemanticSelectors,
  ...uiTokenSelectors,
];

const apiFetchSelectors = [
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.value=/^\/api\//]`,
    message:
      "Raw fetch('/api/…') bypasses the shared API contracts — call apiFetch (src/transport/api-client.ts) with the endpoint object from the owning slice's api-contract.ts. See CONTRIBUTING.md (Architecture invariants).",
  },
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.quasis.0.value.raw=/^\/api\//]`,
    message:
      "Raw fetch(`/api/…`) bypasses the shared API contracts — call apiFetch (src/transport/api-client.ts) with the endpoint object from the owning slice's api-contract.ts. See CONTRIBUTING.md (Architecture invariants).",
  },

  {
    selector: "CallExpression[callee.name='apiFetch'] > ObjectExpression:first-child",
    message:
      "Inline apiFetch endpoint objects bypass the declared API-contract convention — pass the named defineEndpoint contract from the owning slice's api-contract.ts.",
  },
];

const directPostgresSelectors = [
  {
    selector: "ImportDeclaration[source.value='postgres']",
    message:
      "DB suites use createDbTestHarness (@/db/__tests__/support/db-test-harness); importing postgres-js directly bypasses the shared lifecycle even when the import is aliased.",
  },
  {
    selector: "CallExpression[callee.name='postgres']",
    message:
      "DB suites use createDbTestHarness (@/db/__tests__/support/db-test-harness); direct postgres() construction duplicates reachability, schema steering, and teardown.",
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

const esiHostSelectors = [
  {
    selector: String.raw`Literal[value=/esi\.evetech\.net/]`,
    message:
      "Don't hand-write ESI URLs — build them with esiUrl() and dispatch through esiFetch (@/platform/esi): the gate owns CCP's shared per-IP error budget. See CONTRIBUTING.md (Architecture invariants).",
  },
  {
    selector: String.raw`TemplateElement[value.raw=/esi\.evetech\.net/]`,
    message:
      "Don't hand-write ESI URLs (template literal) — build them with esiUrl() and dispatch through esiFetch (@/platform/esi): the gate owns CCP's shared per-IP error budget. See CONTRIBUTING.md (Architecture invariants).",
  },
];

const bareFetchSelectors = [
  {
    selector: "CallExpression[callee.name='fetch']",
    message:
      "No bare `fetch` in production source — call fetchWithTimeout (@/lib/fetch-with-timeout) so the request carries an explicit timeout, or apiFetch for a first-party route. The declared policy per integration lives in src/composition/__tests__/vendor-resilience-registry.ts.",
  },
];

const ssoHostSelectors = [
  {
    selector: String.raw`Literal[value=/login\.eveonline\.com/]`,
    message:
      "Don't hand-write EVE SSO URLs — import the endpoint constants from @/platform/auth/eve-sso-constants and dispatch through the bounded wrapper in @/platform/auth/eve-sso.",
  },
  {
    selector: String.raw`TemplateElement[value.raw=/login\.eveonline\.com/]`,
    message:
      "Don't hand-write EVE SSO URLs (template literal) — import the endpoint constants from @/platform/auth/eve-sso-constants and dispatch through the bounded wrapper in @/platform/auth/eve-sso.",
  },
];

const imageVariantSelectors = [
  {
    selector: 'JSXAttribute[name.name="variant"][value.value=/^(icon|render|bp|bpc)$/]',
    message:
      'Do not choose EVE type-image variants at call sites — use an intent resolver from @/data/eve-data/type-images.',
  },
  {
    selector: 'Property[key.name="variant"][value.value=/^(icon|render|bp|bpc)$/]',
    message:
      'Do not construct EVE type-image descriptors at call sites — use an intent resolver from @/data/eve-data/type-images.',
  },
];

const processEnvSelectors = [
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']:not([property.name=/^NEXT_PUBLIC_/])",
    message:
      "Read server env through readEnv()/requireEnv() (src/lib/env.ts) — typed, lazy, and registry-documented. NODE_ENV and NEXT_PUBLIC_* stay direct reads. See CONTRIBUTING.md (Architecture invariants).",
  },
];

const datasetTtlSelectors = [
  {
    selector: "VariableDeclarator[id.name=/_TTL_MS$/]",
    message:
      "Dataset TTL constants belong in the ESI dataset registry; bind a gate from @/lib/esi-datasets/freshness instead.",
  },
];

const baseUiWrapperFiles = [
  "src/components/ui/checkbox.tsx",
  "src/components/ui/combobox.tsx",
  "src/components/ui/dialog.tsx",
  "src/components/ui/drawer.tsx",
  "src/components/ui/field.tsx",
  "src/components/ui/menu.tsx",
  "src/components/ui/navigation-menu.tsx",
  "src/components/ui/pointer-menu.tsx",
  "src/components/ui/popover.tsx",
  "src/components/ui/radio-group.tsx",
  "src/components/ui/segmented.tsx",
  "src/components/ui/chip-toggle.tsx",
  "src/components/ui/select.tsx",
  "src/components/ui/stepper.tsx",
  "src/components/ui/switch.tsx",
  "src/components/ui/tabs.tsx",
  "src/components/ui/tooltip.tsx",
];

const baseUiImportPatterns = [
  {
    group: ["@base-ui/react", "@base-ui/react/*"],
    message:
      "Base UI is consumed only through the shared wrappers in @/components/ui — import the primitive (Dialog, Select, Tooltip, …), not the package. See CONTRIBUTING.md (Component system).",
  },
];

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

const nextImageImportPaths = [
  {
    name: "next/image",
    message:
      "Import EveImage from @/components/eve-image. It is the only module allowed to select CCP's custom loader or the explicit unoptimized static path.",
  },
];

const stalenessImportPatterns = [
  {
    group: ["**/staleness"],
    message:
      "Import freshness verdicts from @/lib/esi-datasets/freshness; feature-local staleness modules duplicate registry policy.",
  },
];

const reactFlowImportPatterns = [
  {
    group: ["@xyflow/react", "@xyflow/react/*"],
    message:
      "React Flow is confined to the mapper host layer. Import mapper surfaces from @/mapper outside src/mapper.",
  },
];

const crossCuttingImportPatterns = [
  ...stalenessImportPatterns,
  ...reactFlowImportPatterns,
];

const upstashRedisImportPatterns = [
  {
    group: ["@upstash/redis"],
    message:
      "Construct Upstash Redis clients through createUpstashClient / resolveUpstashClient (@/lib/upstash), the single construction owner; import the `UpstashRedis` type from there instead of the package.",
  },
];

const upstashRatelimitImportPatterns = [
  {
    group: ["@upstash/ratelimit"],
    message:
      "The sliding-window limiter is owned by @/lib/rate-limit — call checkRateLimit / rateLimit instead of building a second limiter.",
  },
];

const databaseDriverImportPatterns = [
  {
    group: ["@neondatabase/serverless", "postgres"],
    message:
      "Database drivers are constructed only in @/db (and the src/scripts CLI band), which owns the query and connection bounds; import `db`, `directClient`, or the owned `Sql`/`ReservedConnection` types from @/db.",
  },
];

const betterAuthImportPatterns = [
  {
    group: ["better-auth", "better-auth/*", "better-auth/**"],
    message:
      "Better Auth is consumed through @/platform/auth, which owns the session, adapter, and EVE token wiring; feature code imports that slice, not the package.",
  },
];

const convexReactImportPatterns = [
  {
    group: ["convex/react"],
    message:
      "The Convex browser client is owned by @/data/convex/client (and the two provider components); import `convexClient` or a slice hook instead of the package.",
  },
];

const googleAuthImportPatterns = [
  {
    group: ["google-auth-library"],
    message:
      "Google auth clients are constructed only in @/data/gsc, which owns the token-fetch timeout; import that slice's source functions instead.",
  },
];

const vendorImportPatterns = [
  ...upstashRedisImportPatterns,
  ...upstashRatelimitImportPatterns,
  ...databaseDriverImportPatterns,
  ...betterAuthImportPatterns,
  ...convexReactImportPatterns,
  ...googleAuthImportPatterns,
];

const serverRootImportPatterns = [
  {
    group: [
      "@/db",
      "@/db/*",
      "@/scripts/*",
      "@/lib/env",
      "@/platform/esi",
      "@/platform/esi/*",
      "@/platform/auth/auth",
      "@/platform/auth/eve-sso",
      "@/lib/rate-limit",
      "@/data/gsc/source",
      "@/features/feedback/create-linear-issue",
      "@/data/wh-statics/source",
      "@/data/eve-data/source",
      "@/data/esi-refresh-jobs/pending-signal",
    ],
    message:
      "Client modules cannot import server roots. Move the read behind a server boundary or import a client-safe contract.",
  },
];

function selectorsWithout(selectors, exemptions) {
  return selectors.filter((selector) => !exemptions.includes(selector));
}

function productionSyntaxSelectorsExcept(...exemptions) {
  return [
    ...bareFetchSelectors,
    ...ssoHostSelectors,
    ...cspSelectors,
    ...hexColorSelectors,
    ...rgbaColorSelectors,
    ...apiFetchSelectors,
    ...processEnvSelectors,
    ...esiHostSelectors,
    ...textSizeSelectors,
    ...legacyTypeRoleSelectors,
    ...roundedSizeSelectors,
    ...selectElementSelectors,
    ...inputClassSelectors,
    ...selectorsWithout(uiAdoptionSelectors, exemptions),
    ...datasetTtlSelectors,
    ...imageVariantSelectors,
  ];
}

function primitiveSyntaxSelectorsExcept(...exemptions) {
  return [
    ...bareFetchSelectors,
    ...ssoHostSelectors,
    ...cspSelectors,
    ...hexColorSelectors,
    ...rgbaColorSelectors,
    ...apiFetchSelectors,
    ...processEnvSelectors,
    ...esiHostSelectors,
    ...textSizeSelectors,
    ...legacyTypeRoleSelectors,
    ...roundedSizeSelectors,
    ...selectElementSelectors,
    ...inputClassSelectors,
    ...selectorsWithout(uiAdoptionSelectors, exemptions),
    ...datasetTtlSelectors,
    ...imageVariantSelectors,
  ];
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {

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

  {
    files: ["src/**/*.{ts,tsx,mts}"],
    ignores: [
      "src/components/eve-image.tsx",
      ...baseUiWrapperFiles,
      "src/components/ui/toast.tsx",
      "src/lib/esi-datasets/**/*.{ts,tsx,mts}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...nextImageImportPaths,
          ],
          patterns: [
            ...vendorImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: [
      "src/components/**/*.{ts,tsx,mts}",
      "src/features/**/components/**/*.{ts,tsx,mts}",
      "src/features/**/use-*.{ts,tsx}",
      "src/data/**/use-*.{ts,tsx}",
      "src/mapper/**/*.{ts,tsx,mts}",
      "src/platform/auth/auth-client.ts",
      "src/platform/auth/components/**/*.{ts,tsx,mts}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...nextImageImportPaths,
          ],
          patterns: [
            ...vendorImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
            ...serverRootImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: ["src/mapper/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...nextImageImportPaths,
          ],
          patterns: [
            ...vendorImportPatterns,
            ...stalenessImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
            ...serverRootImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: ["src/components/eve-image.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...vendorImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
            ...serverRootImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: baseUiWrapperFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...nextImageImportPaths,
          ],
          patterns: [
            ...vendorImportPatterns,
            ...crossCuttingImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
            ...serverRootImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: ["src/components/ui/toast.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...nextImageImportPaths,
          ],
          patterns: [
            ...vendorImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...serverRootImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: ["src/lib/esi-datasets/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...nextImageImportPaths,
          ],
          patterns: [
            ...vendorImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
            ...serverRootImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: ["src/app/api/cron/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...nextImageImportPaths,
            {
              name: "@/transport/cron",
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
            ...vendorImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: ["convex/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [...vendorImportPatterns] }],
    },
  },

  {
    files: ["src/lib/upstash.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...nextImageImportPaths],
          patterns: [
            ...upstashRatelimitImportPatterns,
            ...databaseDriverImportPatterns,
            ...betterAuthImportPatterns,
            ...convexReactImportPatterns,
            ...googleAuthImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: ["src/lib/rate-limit.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...nextImageImportPaths],
          patterns: [
            ...upstashRedisImportPatterns,
            ...databaseDriverImportPatterns,
            ...betterAuthImportPatterns,
            ...convexReactImportPatterns,
            ...googleAuthImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: [
      "src/db/index.ts",
      "src/scripts/**/*.{ts,mts}",
      "src/db/__tests__/support/db-test-harness.ts",
      "src/db/advisory-lock.concurrency.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...nextImageImportPaths],
          patterns: [
            ...upstashRedisImportPatterns,
            ...upstashRatelimitImportPatterns,
            ...betterAuthImportPatterns,
            ...convexReactImportPatterns,
            ...googleAuthImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/platform/auth/**/*.{ts,tsx,mts}",
      "src/app/api/auth/**/route.{ts,tsx}",
      "src/app/(site)/industry/active-job-character-ids.ts",
      "src/app/(site)/industry/active-job-character-ids.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...nextImageImportPaths],
          patterns: [
            ...upstashRedisImportPatterns,
            ...upstashRatelimitImportPatterns,
            ...databaseDriverImportPatterns,
            ...convexReactImportPatterns,
            ...googleAuthImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: ["src/data/convex/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...nextImageImportPaths],
          patterns: [
            ...upstashRedisImportPatterns,
            ...upstashRatelimitImportPatterns,
            ...databaseDriverImportPatterns,
            ...betterAuthImportPatterns,
            ...googleAuthImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
            ...serverRootImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: ["src/data/gsc/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...nextImageImportPaths],
          patterns: [
            ...upstashRedisImportPatterns,
            ...upstashRatelimitImportPatterns,
            ...databaseDriverImportPatterns,
            ...betterAuthImportPatterns,
            ...convexReactImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: [
      "src/platform/auth/auth-client.ts",
      "src/platform/auth/components/**/*.{ts,tsx,mts}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...nextImageImportPaths],
          patterns: [
            ...upstashRedisImportPatterns,
            ...upstashRatelimitImportPatterns,
            ...databaseDriverImportPatterns,
            ...convexReactImportPatterns,
            ...googleAuthImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
            ...serverRootImportPatterns,
          ],
        },
      ],
    },
  },

  {
    files: ["src/platform/auth/components/ConvexClientProvider.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...nextImageImportPaths],
          patterns: [
            ...upstashRedisImportPatterns,
            ...upstashRatelimitImportPatterns,
            ...databaseDriverImportPatterns,
            ...googleAuthImportPatterns,
            ...crossCuttingImportPatterns,
            ...baseUiImportPatterns,
            ...deprecatedBaseUiImportPatterns,
            ...sonnerImportPatterns,
            ...serverRootImportPatterns,
          ],
        },
      ],
    },
  },

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
        ...imageVariantSelectors,
      ],
    },
  },

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
        ...imageVariantSelectors,
      ],
    },
  },

  {
    files: ["src/**/*.{ts,tsx,mts}"],
    ignores: ["**/*.test.{ts,tsx}", "src/lib/env.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...bareFetchSelectors,
        ...ssoHostSelectors,
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...legacyTypeRoleSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...uiAdoptionSelectors,
        ...datasetTtlSelectors,
        ...imageVariantSelectors,
      ],
    },
  },

  {
    files: ["src/platform/esi/**/*.{ts,tsx,mts}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...bareFetchSelectors,
        ...ssoHostSelectors,
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...textSizeSelectors,
        ...legacyTypeRoleSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...uiAdoptionSelectors,
        ...datasetTtlSelectors,
        ...imageVariantSelectors,
      ],
    },
  },

  {
    files: ["src/lib/env.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...bareFetchSelectors,
        ...ssoHostSelectors,
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...legacyTypeRoleSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...uiAdoptionSelectors,
        ...datasetTtlSelectors,
        ...imageVariantSelectors,
      ],
    },
  },

  {
    files: ["src/components/ui/tones.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...bareFetchSelectors,
        ...ssoHostSelectors,
        ...cspSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...legacyTypeRoleSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...uiAdoptionSelectors,
        ...datasetTtlSelectors,
        ...imageVariantSelectors,
      ],
    },
  },

  {
    files: ["src/app/(site)/preview/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...bareFetchSelectors,
        ...ssoHostSelectors,
        ...cspSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...legacyTypeRoleSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...uiAdoptionSelectors,
        ...datasetTtlSelectors,
        ...imageVariantSelectors,
      ],
    },
  },

  {
    files: ["src/app/**/opengraph-image.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...bareFetchSelectors,
        ...ssoHostSelectors,
        ...rawHtmlSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...legacyTypeRoleSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...uiAdoptionSelectors,
        ...datasetTtlSelectors,
        ...imageVariantSelectors,
      ],
    },
  },

  {
    files: ["src/lib/esi-datasets/**/*.{ts,tsx,mts}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...bareFetchSelectors,
        ...ssoHostSelectors,
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...legacyTypeRoleSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...uiAdoptionSelectors,
        ...imageVariantSelectors,
      ],
    },
  },

  {
    files: ["src/lib/esi-datasets/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...imageVariantSelectors,
      ],
    },
  },

  {
    files: ["src/data/eve-data/type-images.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...bareFetchSelectors,
        ...ssoHostSelectors,
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...legacyTypeRoleSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...uiAdoptionSelectors,
        ...datasetTtlSelectors,
      ],
    },
  },

  {
    files: ["src/data/eve-data/type-images.test.ts"],
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

  {
    files: ["convex/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...bareFetchSelectors,
        ...ssoHostSelectors,
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
      ],
    },
  },

  {
    files: ["src/lib/fetch-with-timeout.ts", "src/transport/api-client.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...ssoHostSelectors,
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...legacyTypeRoleSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...uiAdoptionSelectors,
        ...datasetTtlSelectors,
        ...imageVariantSelectors,
      ],
    },
  },

  {
    files: [
      "src/platform/auth/eve-sso-constants.ts",
      "src/platform/auth/eve-sso.ts",
      "src/proxy.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...bareFetchSelectors,
        ...cspSelectors,
        ...hexColorSelectors,
        ...rgbaColorSelectors,
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
        ...legacyTypeRoleSelectors,
        ...roundedSizeSelectors,
        ...selectElementSelectors,
        ...inputClassSelectors,
        ...uiAdoptionSelectors,
        ...datasetTtlSelectors,
        ...imageVariantSelectors,
      ],
    },
  },

  {
    files: ["src/components/ui/**/*.{ts,tsx,mts}"],
    ignores: ["**/*.test.{ts,tsx}", "src/components/ui/tones.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...primitiveSyntaxSelectorsExcept(),
      ],
    },
  },

  {
    files: [
      "src/components/ui/banner.tsx",
      "src/components/ui/button.tsx",
      "src/components/ui/pagination.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...primitiveSyntaxSelectorsExcept(rawButtonSelector, ...toneTokenSelectors),
      ],
    },
  },
  {
    files: ["src/components/ui/copy-button.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...primitiveSyntaxSelectorsExcept(
          rawButtonSelector,
          liveRegionSelector,
          ...toneTokenSelectors,
        ),
      ],
    },
  },
  {
    files: ["src/components/ui/collapsible.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...primitiveSyntaxSelectorsExcept(detailsSelector),
      ],
    },
  },
  {
    files: ["src/components/ui/confirm-dialog.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...primitiveSyntaxSelectorsExcept(liveRegionSelector, ...toneTokenSelectors),
      ],
    },
  },
  {
    files: ["src/components/ui/skeleton.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...primitiveSyntaxSelectorsExcept(liveRegionSelector, ...skeletonTokenSelectors),
      ],
    },
  },
  {
    files: ["src/components/ui/input.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...primitiveSyntaxSelectorsExcept(visibleInputSelector, textareaSelector),
      ],
    },
  },
  {
    files: ["src/components/ui/static-table.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...primitiveSyntaxSelectorsExcept(tableSelector),
      ],
    },
  },
  {
    files: [
      "src/components/ui/access-gate.tsx",
      "src/components/ui/checkbox.tsx",
      "src/components/ui/chip-toggle.tsx",
      "src/components/ui/chip.tsx",
      "src/components/ui/dropdown-panel.ts",
      "src/components/ui/field.tsx",
      "src/components/ui/pill.tsx",
      "src/components/ui/switch.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...primitiveSyntaxSelectorsExcept(...toneTokenSelectors),
      ],
    },
  },
  {
    files: ["src/components/ui/empty-state.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...primitiveSyntaxSelectorsExcept(...emptyStateTokenSelectors),
      ],
    },
  },
  {
    files: ["src/components/ui/progress-bar.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...primitiveSyntaxSelectorsExcept(...progressTokenSelectors),
      ],
    },
  },
  {
    files: ["src/components/ui/loading-toast.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...primitiveSyntaxSelectorsExcept(loadingToastSelector),
      ],
    },
  },
  {
    files: ["src/components/composition/NavTools.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...productionSyntaxSelectorsExcept(nativeTitleSelector),
      ],
    },
  },
  {
    files: ["src/components/composition/account/LoginButton.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...productionSyntaxSelectorsExcept(rawButtonSelector),
      ],
    },
  },
  {
    files: [
      "src/components/composition/account/AdminForceLogoutForm.tsx",
      "src/components/composition/account/AdminReassignCharacterForm.tsx",
      "src/components/composition/account/AdminUnlinkCharacterForm.tsx",
      "src/components/composition/account/RoleToggleForm.tsx",
      "src/components/composition/account/UnlinkCharacterForm.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...productionSyntaxSelectorsExcept(buttonTitleSelector),
      ],
    },
  },
  {
    files: [
      "src/features/wormhole-sites/components/SitesTable.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...productionSyntaxSelectorsExcept(detailsSelector),
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "convex/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
    plugins: { tsdoc },
    rules: {
      "tsdoc/syntax": "error",
      "no-warning-comments": [
        "error",
        { terms: ["todo", "fixme"], location: "anywhere" },
      ],
    },
  },

  globalIgnores([

    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    "docs/**",

    ".claude/**",

    "convex/_generated/**",
  ]),
]);

export default eslintConfig;
