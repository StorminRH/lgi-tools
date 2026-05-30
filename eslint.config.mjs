import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

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
            "Architectural boundary violation. Allowed import directions: feature → {ui, data, auth shared surface}; data → {auth shared surface, the search registry hub}; ui → nothing cross-layer. Features never import each other; data slices never import features; eve-data and market-prices stay isolated (compose from above, e.g. src/db/sde-pipeline.ts). See CLAUDE.md > Architecture Invariants.",
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
            // Data slices may use auth's shared surface and the slice-agnostic
            // `search` registry hub (tools/commands register sources into it).
            // No `feature` in the allow-list ⇒ data ↛ features. No general
            // data → data ⇒ eve-data ⊥ market-prices holds automatically.
            {
              from: { type: "data" },
              allow: [
                { to: { type: "shared-auth-surface" } },
                { to: { type: "data", captured: { sliceName: "search" } } },
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

  // CSP: the production policy is `style-src 'self'` (no nonce, no
  // unsafe-inline), which covers the external stylesheet but NOT inline
  // `style="…"` attributes — any JSX `style={{}}` renders as such an attribute
  // and is silently dropped on first paint. Forbid it; runtime-dynamic values
  // use a CSS class reading a custom property set via ref.style.setProperty in
  // an effect. The dangerouslySetInnerHTML / raw-innerHTML bans (3.0.4.6) keep
  // the "no raw-HTML sinks" property that makes `script-src 'self'
  // 'unsafe-inline'` safe — with inline scripts allowed, an unescaped HTML sink
  // is an XSS vector. The `.ts`/`.tsx` glob is deliberate: it also catches a
  // direct `el.innerHTML = …` write in a plain `.ts` helper, not just the JSX
  // escape hatch. See CLAUDE.md > CSP.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
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
  ]),
]);

export default eslintConfig;
