import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

// Shared `no-restricted-syntax` selector sets. Factored out because flat config
// REPLACES (does not merge) a rule's options for each matching file — so a
// per-file exemption that lifts one ban must re-list every ban it still wants.
// Keeping the CSP selectors in one const lets the tones.ts / sandbox exemptions
// re-state them verbatim with no drift.
const cspSelectors = [
  {
    selector: "JSXAttribute[name.name='style']",
    message:
      "No inline `style` attributes — the production CSP's `style-src 'self'` drops them. Use Tailwind classes for static values, or a CSS custom property set via ref.style.setProperty in an effect for runtime-dynamic ones. See CLAUDE.md > CSP.",
  },
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message:
      "No `dangerouslySetInnerHTML` — the production CSP allows `'unsafe-inline'` scripts, so an unescaped HTML sink becomes an XSS vector. Render text through JSX (auto-escaped) instead. See CLAUDE.md > CSP.",
  },
  {
    selector:
      "AssignmentExpression[left.property.name=/^(inner|outer)HTML$/]",
    message:
      "No raw `innerHTML`/`outerHTML` writes — same XSS risk as dangerouslySetInnerHTML under the `'unsafe-inline'` CSP. Use safe DOM APIs (textContent, createElement) instead. See CLAUDE.md > CSP.",
  },
];

// Raw color literals belong in the token layer (the `@theme` block in
// globals.css and tones.ts), not hardcoded at call sites. Two shapes: a hex
// anywhere inside a Tailwind arbitrary value — `bg-[#1e2c3a]`, but also one
// embedded mid-value like `shadow-[0_0_4px_#dd4444]` (`\[[^\]]*#…` matches the
// hex wherever it sits in the `[…]` chunk, in a className or cva/clsx string —
// a TemplateElement when interpolated); and a whole-string hex constant like an
// SVG `fill="#0d0f14"`. tones.ts (the JS source for SVG fills) and the
// dev/preview sandboxes are exempted below. 3.3.9 routed every call-site color
// into a `--color-*` token; this keeps them there. (rgba is intentionally out
// of scope — the rule bans hex only.)
const hexColorSelectors = [
  {
    selector: "Literal[value=/\\[[^\\]]*#[0-9a-fA-F]{3,8}/]",
    message:
      "No raw hex in Tailwind arbitrary values — route the color through a token (a `--color-*` in globals.css `@theme`, surfaced as `bg-…`/`text-…`/`border-…`/`fill-…`) or tones.ts. See CLAUDE.md > color tokens.",
  },
  {
    selector: "TemplateElement[value.raw=/\\[[^\\]]*#[0-9a-fA-F]{3,8}/]",
    message:
      "No raw hex in Tailwind arbitrary values (template literal) — route the color through a `--color-*` token (globals.css `@theme`) or tones.ts. See CLAUDE.md > color tokens.",
  },
  {
    selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
    message:
      "No raw hex color constants — SVG fills/strokes read from tones.ts (toneHex) or a Tailwind `fill-…`/`stroke-…` utility backed by a `--color-*` token. See CLAUDE.md > color tokens.",
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
      // EVE images (character portraits, type icons) render via plain <img>,
      // not next/image: next/image injects an inline `style="color:transparent"`
      // attribute that the production CSP's `style-src 'self'` (no nonce, no
      // unsafe-inline) silently drops. See docs/VERSION_3.0.4.3_CSP_DECISION.md.
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
  // Architectural boundary enforcement — turns the import-graph invariants in
  // CLAUDE.md ("Architecture Invariants") into lint errors. Mechanical edges
  // only; the design judgment of "is this a good primitive" stays a review
  // concern. See docs / SCRATCHPAD for the encoded exceptions.
  {
    files: ["src/**/*.{ts,tsx,mts}"],
    plugins: { boundaries },
    settings: {
      // boundaries resolves imported modules through its own copy of
      // eslint-module-utils, so it needs the TS resolver pointed at tsconfig
      // to follow the `@/*` path alias. Without this every aliased import is
      // "unresolved" and the rules silently pass on everything.
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
      },
      // Order matters: most-specific first. auth's *shared surface* (the
      // Session type + the characters table) is de-facto platform infra,
      // imported by other features and by data slices (incl. a real FK from
      // telemetry). It is classified apart from the rest of the auth feature,
      // whose UI/session/query surface stays feature-local and non-importable.
      "boundaries/elements": [
        {
          type: "shared-auth-surface",
          mode: "full",
          pattern: ["src/features/auth/types.ts", "src/features/auth/schema.ts"],
        },
        { type: "ui", mode: "folder", pattern: "src/components/ui" },
        {
          type: "feature",
          mode: "folder",
          pattern: "src/features/*",
          capture: ["featureName"],
        },
        {
          type: "data",
          mode: "folder",
          pattern: "src/data/*",
          capture: ["sliceName"],
        },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message:
            "Architectural boundary violation. Allowed import directions: feature → {ui, data, auth shared surface}; data → {auth shared surface}; ui → nothing cross-layer. Features never import each other; data slices never import features; eve-data and market-prices stay isolated (compose from above, e.g. src/db/sde-pipeline.ts). See CLAUDE.md > Architecture Invariants.",
          rules: [
            // The shared surface's type file references its own schema file.
            { from: { type: "shared-auth-surface" }, allow: [{ to: { type: "shared-auth-surface" } }] },
            // Feature slices may use UI primitives, data layers, and auth's
            // shared surface — never another feature. Cross-feature imports
            // fall through to the default `disallow`; same-feature imports are
            // internal and ignored.
            {
              from: { type: "feature" },
              allow: [
                { to: { type: "ui" } },
                { to: { type: "data" } },
                { to: { type: "shared-auth-surface" } },
              ],
            },
            // Data slices may use auth's shared surface — nothing else cross-layer.
            // No `feature` in the allow-list ⇒ data ↛ features. No general
            // data → data ⇒ eve-data ⊥ market-prices holds automatically. (The
            // search engine lives in the unclassified src/search/ layer, so data
            // sources importing its types/matcher trip no rule and need no
            // exception — the wiring manifest composes them from above.)
            {
              from: { type: "data" },
              allow: [
                { to: { type: "shared-auth-surface" } },
              ],
            },
            // npc-stats reads SDE attributes from eve-data — directed layering,
            // not the forbidden eve-data ⊥ market-prices sibling pair. Listed
            // last so it grants the eve-data edge on top of the general data rule.
            {
              from: { type: "data", captured: { sliceName: "npc-stats" } },
              allow: [
                { to: { type: "data", captured: { sliceName: "eve-data" } } },
              ],
            },
            // UI primitives are domain-agnostic: no rule grants them feature /
            // data / auth-surface imports, so the default `disallow` forbids
            // them.
          ],
        },
      ],
    },
  },

  // CSP + color tokens: two families of `no-restricted-syntax` bans share one
  // block (the rule's options REPLACE across matching files, so they can't be
  // split into two `**/*.{ts,tsx}` objects without one wiping the other).
  //   • CSP — `style-src 'self'` (no nonce) drops inline `style="…"`, so any JSX
  //     `style={{}}` is forbidden; the dangerouslySetInnerHTML / raw-innerHTML
  //     bans (3.0.4.6) keep the "no raw-HTML sinks" property that makes
  //     `script-src 'self' 'unsafe-inline'` safe. The `.ts`/`.tsx` glob also
  //     catches a direct `el.innerHTML = …` in a plain helper.
  //   • Color tokens (3.3.9) — raw hex must live in the token layer, not at call
  //     sites. tones.ts and the dev/preview sandboxes are exempted just below.
  // See CLAUDE.md > CSP / color tokens.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...cspSelectors, ...hexColorSelectors],
    },
  },
  // tones.ts is the sanctioned home for raw color literals — `toneHex` is the
  // JS source for SVG fills. Re-state the CSP bans without the hex selectors so
  // only the color rule is lifted here (replace semantics).
  {
    files: ["src/components/ui/tones.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...cspSelectors],
    },
  },
  // Dev/preview sandboxes are design scratchpads that intentionally try
  // off-palette one-offs; exempt them from the hex-color ban (the 3.3.10
  // sandbox port will tokenize them), but keep the CSP bans.
  {
    files: ["src/app/dev/**/*.{ts,tsx}", "src/app/preview/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...cspSelectors],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
