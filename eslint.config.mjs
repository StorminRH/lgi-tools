import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Shared `no-restricted-syntax` selector sets. Factored out because flat config
// REPLACES (does not merge) a rule's options for each matching file — so a
// per-file exemption that lifts one ban must re-list every ban it still wants.
// Keeping the CSP selectors in one const lets the tones.ts / preview-sandbox
// exemptions re-state them verbatim with no drift.
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

// Raw color literals belong in the token layer (the `@theme` block in
// globals.css and tones.ts), not hardcoded at call sites. Two shapes: a hex
// anywhere inside a Tailwind arbitrary value — `bg-[#1e2c3a]`, but also one
// embedded mid-value like `shadow-[0_0_4px_#dd4444]` (`\[[^\]]*#…` matches the
// hex wherever it sits in the `[…]` chunk, in a className or cva/clsx string —
// a TemplateElement when interpolated); and a whole-string hex constant like an
// SVG `fill="#0d0f14"`. tones.ts (the JS source for SVG fills) and the
// preview sandbox are exempted below. 3.3.9 routed every call-site color
// into a `--color-*` token; this keeps them there. (rgba is intentionally out
// of scope — the rule bans hex only.)
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
      // not next/image. The old CSP dropped next/image's injected inline
      // `style="color:transparent"` attribute; that no longer applies (OOB.1.1
      // added `'unsafe-inline'` to style-src), but the codebase still uses plain
      // <img> — a next/image migration is deferred. See CONTRIBUTING.md
      // (Security & CSP).
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
        ...apiFetchSelectors,
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
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...esiHostSelectors,
        ...textSizeSelectors,
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
        ...apiFetchSelectors,
        ...processEnvSelectors,
        ...textSizeSelectors,
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
        ...textSizeSelectors,
      ],
    },
  },
  // The preview sandbox is a design scratchpad that intentionally tries
  // off-palette one-offs; exempt it from the hex-color ban, but keep every
  // other ban. (The old dev sandbox tree was removed in #210.)
  {
    files: ["src/app/preview/**/*.{ts,tsx}"],
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
