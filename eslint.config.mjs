import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
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
// body, lead, h3, stat, h2, display, hero). Mirrors the hex-color ban: a plain className
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
      "No raw arbitrary font sizes — use the named type scale (micro/label/ui/body/lead/h3/stat/h2/display/hero), backed by the `--text-*` tokens in globals.css `@theme`. See CONTRIBUTING.md (Type scale).",
  },
  {
    selector: "TemplateElement[value.raw=/text-\\[[0-9.]+(px|rem|em)\\]/]",
    message:
      "No raw arbitrary font sizes (template literal) — use the named type scale (the `--text-*` tokens in globals.css `@theme`). See CONTRIBUTING.md (Type scale).",
  },
];

// Retired type-role utilities compile to no CSS after their theme keys disappear,
// which would otherwise leave a silent inheritance bug. Match complete class
// tokens only so CSS custom-property references such as var(--font-body) remain
// legal evidence in tests and documentation helpers.
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

// UI-adoption enforcement (3.10.4.1): production call sites consume the shared
// primitive layer instead of re-implementing its HTML, ARIA, recipes, or
// primitive-owned styling tokens. The few necessary raw-element owners and
// recorded exceptions use exact flat-config blocks below; the adoption rail
// test proves each lifted selector while keeping a neighboring ban active.
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
      "Raw fetch('/api/…') bypasses the shared API contracts — call apiFetch (src/transport/api-client.ts) with the endpoint object from the owning slice's api-contract.ts. See CONTRIBUTING.md (Architecture invariants).",
  },
  {
    selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.quasis.0.value.raw=/^\/api\//]`,
    message:
      "Raw fetch(`/api/…`) bypasses the shared API contracts — call apiFetch (src/transport/api-client.ts) with the endpoint object from the owning slice's api-contract.ts. See CONTRIBUTING.md (Architecture invariants).",
  },
  // An inline object literal as apiFetch's first argument bypasses the
  // declared-endpoint convention (it typechecks against EndpointContract).
  // Endpoints are declared once in the owning slice's api-contract.ts through
  // defineEndpoint and passed by name.
  {
    selector: "CallExpression[callee.name='apiFetch'] > ObjectExpression:first-child",
    message:
      "Inline apiFetch endpoint objects bypass the declared API-contract convention — pass the named defineEndpoint contract from the owning slice's api-contract.ts.",
  },
];

// Real-Postgres suites use the lifecycle-owning test harness instead of
// constructing a second client or embedding credentials/schema steering. The
// harness module itself is outside the `*.db.test.ts` rail below.
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

// ESI gate enforcement (3.4.5): CCP's error limit is per-IP and shared across
// every ESI call the app makes — one un-gated call burns budget the shared
// scoreboard can't see, and overrunning the limit is a permanent IP-wide ban.
// Banning the host literal outside src/platform/esi means the only way to target
// ESI is the gate's own exports (esiUrl + esiFetch). Scoped to the API host
// exactly: images.evetech.net (the EVE image server) stays legitimately used
// across the UI. Test files are exempt (they mock with host URLs); the gate
// slice itself is exempted below. A hand-assembled host string would slip
// through — accepted, same altitude as the other syntactic bans here.
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

// Vendor-call resilience rail (3.10.2.4): every outbound HTTP call routes
// through a wrapper that attaches an explicit timeout, so a bare `fetch` in
// production source is banned outside the two transport owners
// (src/lib/fetch-with-timeout.ts and src/transport/api-client.ts, exempted
// below). Without a bound, one hung upstream stalls a serverless invocation
// toward the 300s platform limit instead of failing into the degradation path
// the caller already has. Same altitude as the apiFetch/ESI-host selectors
// above: an indirected call (`globalThis.fetch`, or a fetch held in a variable)
// slips through — accepted, because the vendor-resilience census pins the
// production found-set as well. Test files ride the base block and stay exempt,
// since they stub `fetch` freely.
const bareFetchSelectors = [
  {
    selector: "CallExpression[callee.name='fetch']",
    message:
      "No bare `fetch` in production source — call fetchWithTimeout (@/lib/fetch-with-timeout) so the request carries an explicit timeout, or apiFetch for a first-party route. The declared policy per integration lives in src/composition/__tests__/vendor-resilience-registry.ts.",
  },
];

// EVE SSO host ownership (3.10.2.4): mirrors the ESI host ban above. Banning the
// literal outside its owners means the only way to target EVE SSO is through the
// constants module and the bounded wrapper that consumes it. Three sanctioned
// owners are exempted below: the constants module, eve-sso.ts (which sets the
// literal Host header), and src/proxy.ts (whose CSP `connect-src` names the host
// in a header source list, not a vendor call — the runtime Fallow zone cannot
// import `platform`, so deriving it from the constants is unavailable).
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

// EVE type-image rendition ownership (3.9.3.2): callers state intent through
// the resolver instead of choosing CCP endpoint variants at render sites. Both
// JSX props and descriptor object literals are covered; the resolver module and
// its characterization test are the only sanctioned owners below.
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

// The two rails every source block keeps regardless of which vendor exemption it
// carries. Factored out for the same reason as the selector families above:
// flat-config rule options REPLACE per matching file, and the vendor rail below
// adds enough exemption blocks that an inline copy in each one would be the
// likeliest place for a ban to be dropped silently.
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

// Vendor package ownership (3.10.2.4): each integration's SDK is importable only
// by the module that owns its declared resilience policy, so no call site can
// bypass the wrapper and its explicit timeout. Declared per vendor rather than as
// one blob so an exemption block can lift exactly one and re-list the rest.
//
// Type imports are covered deliberately — the core rule does not distinguish
// them, and the owned aliases (`Sql`/`ReservedConnection` from @/db,
// `UpstashRedis` from @/lib/upstash) mean a consumer never needs the package to
// type a field. A blanket `allowTypeImports` escape would be exactly the fuzzy
// exception this rail exists to prevent.
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
      "@/features/feedback/create-github-issue",
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
  // Client-addressable modules retain the shared import rails and additionally
  // reject every declared server root. App-local client directives are closed
  // by the transitive filesystem test because flat globs cannot distinguish
  // server and client modules under src/app.
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
  // The mapper is the only React Flow package owner. It keeps every other
  // shared, vendor, component, and client/server import rail.
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
  // EveImage owns the one permitted next/image import but keeps every other
  // client import rail from the overlapping block above.
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
  // Base UI wrappers retain package access but remain subject to every other
  // import rail, including sonner exclusivity.
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
  // toast.tsx is the sole sonner owner; Base UI remains restricted here.
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
  // The ESI dataset leaf remains subject to the next/image boundary, but may
  // own internal freshness modules without tripping the consumer import rail.
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
  // Convex had no import rail before 3.10.2.4; its isolate can reach the same
  // vendors, so it gets the vendor rail in a block of its own. The generated
  // client is globally ignored and Convex is outside every UI/server-root rail,
  // so the vendor patterns are the only bans this block carries.
  {
    files: ["convex/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [...vendorImportPatterns] }],
    },
  },
  // --- Vendor rail exemptions (3.10.2.4). Each block below is the declared home
  // for exactly one vendor and re-lists every other ban it keeps, because
  // flat-config rule options REPLACE rather than merge. Each is an enumerated
  // file or directory with a stated reason, never a pattern-shaped escape.
  //
  // @/lib/upstash owns every Upstash Redis client construction.
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
  // @/lib/rate-limit owns the sliding-window limiter; its Redis client comes
  // from the factory, so the @upstash/redis ban still applies here.
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
  // @/db owns both database drivers and their bounds; the src/scripts CLI band
  // runs outside the Next runtime and constructs its own short-lived clients.
  // The DB test harness owns disposable-schema steering for the real-Postgres
  // suites, and the concurrency suite deliberately opens two competing
  // connections to prove advisory-lock serialization.
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
  // @/platform/auth owns the Better Auth instance, its adapter, and the EVE
  // token wiring; the auth catch-all route mounts its handler, the industry
  // helper narrows a BetterAuthError, and its co-located suite exercises the
  // same surfaces. The auth route is globbed as its directory because its real
  // path is `[...all]/route.ts`, and a literal bracket segment reads as a
  // minimatch character class rather than as itself; that directory holds only
  // the catch-all route and its co-located suite.
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
  // @/data/convex owns the browser Convex client and its hooks. This slice is
  // client-addressable — `use-sync-subject.ts` is matched by the `use-*` glob in
  // the client block above — so this replacement MUST re-list
  // serverRootImportPatterns; without it the hook would silently lose its
  // server-root protection while lint stayed green.
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
  // @/data/gsc owns the Google auth client and its token-fetch bound.
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
  // The client-addressable vendor homes. These sit in the client-addressable
  // block above, so their exemptions MUST re-list serverRootImportPatterns —
  // dropping it here would silently let a client module import a server root.
  // Split by vendor rather than grouped: one block lifting both better-auth and
  // convex/react for all of them would let the auth client import Convex and the
  // Convex provider import Better Auth, which is wider than each home owns.
  //
  // The auth client and its providers own Better Auth's client surface only;
  // convex/react stays banned here so this grant cannot quietly create a second
  // Convex consumer.
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
  // The Convex provider is the one file that legitimately needs both: it
  // composes Better Auth identity into the Convex client. Ordered after the
  // block above so its narrower grant wins.
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
        ...imageVariantSelectors,
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
        ...imageVariantSelectors,
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
  // The ESI gate slice is the sanctioned home for the ESI host literal — the
  // whole point of the ban is to funnel consumers here. Re-state every other
  // ban without the host selectors (replace semantics).
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
  // env.ts is exempt from the process.env ban, not from the dataset-window
  // ownership rail.
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
  // tones.ts is the sanctioned home for raw color literals — `toneHex` is the
  // JS source for SVG fills. Re-state every other ban without the hex selectors
  // so only the color rule is lifted here (replace semantics).
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
  // Preview pages may intentionally try off-palette hex one-offs, but alpha
  // colors still use the shared token layer. Re-state every other ban.
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
  // Satori requires JSX style objects in generated Open Graph image routes.
  // Lift only that selector, only for the framework's opengraph-image file
  // convention, and re-state every other production-source restriction because
  // flat-config rule options replace rather than merge.
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
  // The registry leaf is the one legal owner of dataset windows. Re-state
  // every production-source syntax rail except the dataset TTL selector.
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
        ...imageVariantSelectors,
      ],
    },
  },
  // The resolver owns rendition literals. Re-state every production-source
  // syntax rail except the image-variant selectors (flat-config replacement).
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
  // The co-located resolver test constructs expected descriptors and keeps all
  // other source-test rails while sharing the owner's rendition exemption.
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
  // Convex production modules had no syntax rail beyond the repository-wide base
  // block. They can call out of the isolate, so they take the bare-fetch and SSO
  // host bans, re-listing the base families this block replaces. Deliberately no
  // process.env ban: Convex reads its own environment directly, unlike src/.
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
  // The two sanctioned outbound-HTTP owners: fetch-with-timeout.ts IS the bound,
  // and api-client.ts is the typed first-party transport (its own call is a
  // variable path, so the apiFetch selectors never fired on it). Every other
  // production-source ban is re-listed.
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
  // The three sanctioned EVE SSO host owners: the constants module that declares
  // every endpoint, the bounded wrapper that sets the literal Host header, and
  // the proxy's CSP connect-src source list. Every other production-source ban is
  // re-listed, including the bare-fetch rail.
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
  // Primitive modules are the sanctioned owners of their own styling tokens.
  // They retain every element and semantic adoption rail by default.
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
  // Exact UI-adoption owner seams. Each block lifts only the selector family
  // the named component owns and re-states every neighboring syntax rail.
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
    files: [
      "src/components/ui/collapsible.tsx",
      "src/components/ui/content-browser-nav.tsx",
    ],
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
      "src/features/devlog/components/CodeExcerpt.tsx",
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

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tracked workflow and product docs are prose, not lint source.
    "docs/**",
    // Gitignored local-only harness state, including worktrees under
    // .claude/worktrees/** (a full repo copy whose prefixed paths bypass the
    // per-file exemptions below — e.g. tones.ts, the preview sandbox).
    ".claude/**",
    // Convex generated code (committed for CI typecheck, regenerated on deploy).
    "convex/_generated/**",
  ]),
]);

export default eslintConfig;
