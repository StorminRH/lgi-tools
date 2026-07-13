## Fallow
<!-- updated: 2026-06-30 -->

ESLint catches sharp edges while I am working. TypeScript catches type mistakes. Tests catch behavior I remembered to pin down.

Fallow sits in a different category. It is not about one line of code being invalid. It is about whether the repo is quietly getting harder to reason about: unused files, dead exports, duplicated helpers, dependency drift, cross-slice imports, and functions that grow complex enough that future changes become risky. Those are the kinds of problems that do not always break the app today. They break the next session.

That matters more in an AI-built codebase than I expected. AI is very good at adding code. It is less naturally good at removing the right code, noticing when an export is no longer used, or understanding that a convenient import crossed an architectural boundary. A human can feel that a repo is getting heavier. An agent usually needs a measurable signal. Fallow gives the project that signal.

The easiest way to think about it is this: Fallow is the repo-scale reviewer that asks, “Did this change leave the codebase in a shape that the next change can safely build on?” It is not judging product behavior. It is judging structural health.

The first version of this idea was less clean. Earlier in the project, I had boundary rules living in ESLint and dead-code checks living elsewhere. That split worked for simple cases, but it was not the right long-term division of labor. ESLint is best when the rule can be enforced at the syntax level: do not use raw colors, do not call `fetch('/api/...')` directly, do not bypass the ESI gate, do not read `process.env` outside the env registry. Fallow is better for graph-shaped questions: what imports what, what is unused, what duplicated, what got more complex, and what changed compared with the base branch.

[PR #116](https://github.com/StorminRH/lgi-tools/pull/116) made that split explicit. The old dead-code-only gate was replaced with `fallow audit`, and the broader architecture-boundary lint plugin stopped being the place for repo-graph policy. That was not just a tool swap. It was a correction in how I wanted rails to work. Fast syntax checks stay in ESLint. Repo structure belongs in the tool that can see the repo as a graph.<sup><a href="#code-fallow-package">1</a></sup>

Fallow now runs as part of `pnpm verify`, and CI runs it after coverage. That order matters. Coverage data gives Fallow more context about what code was actually exercised, while `FALLOW_AUDIT_BASE` pins the comparison to the merge base so the audit can focus on what the current branch introduced. I do not want every branch blocked by every old wart in the repo. I want new work to stop making the repo worse.<sup><a href="#code-fallow-package">1</a></sup><sup><a href="#code-fallow-ci">2</a></sup>

The configuration starts with entries and ignores. That sounds dull, but it is one of the places these tools can lie if they are not tuned. Generated files, build output, framework artifacts, documentation, and screenshots should not be treated like app source. The entry list tells Fallow what the real graph is supposed to be: app routes, scripts, tests, Convex functions, and the code paths that actually ship. Without that, an audit can become noisy enough that people stop respecting it.<sup><a href="#code-fallow-entry-rules">3</a></sup>

The rule levels are intentionally uneven. Some findings fail the build: unused files, unused exports, unused dependencies, unlisted dependencies, and boundary violations. Those are concrete enough that I want the branch stopped. Other findings are warnings: circular dependencies, unresolved imports, duplicate exports, and a few lower-confidence signals. That restraint is important. A rail that blocks too much becomes a wall people look for ways around. A rail that blocks the right things becomes part of the workflow.<sup><a href="#code-fallow-entry-rules">3</a></sup>

Complexity is where I had to be careful. It is easy to say “no complex functions” and create a rule that looks virtuous but fights the shape of real UI and route code. The repo sets cyclomatic, cognitive, and CRAP thresholds, but it also records narrow overrides where coverage is the wrong signal for a surface. Those overrides are not meant to be loopholes. They are notes to future-me and future agents: this is an acknowledged edge case, not an accidental blind spot.<sup><a href="#code-fallow-health-overrides">4</a></sup>

Duplication gets the same treatment. Some duplication is a mistake. Some is a deliberate seam. The audit blocks new duplicate code aggressively, but it carries a baseline ledger for existing sanctioned clones. That lets the tool distinguish “this was already accepted” from “this branch copied another helper instead of extracting the right boundary.” In an AI workflow, that distinction matters because copied code is one of the easiest ways for an agent to appear productive while making the repo harder to maintain.<sup><a href="#code-fallow-duplicates">5</a></sup><sup><a href="#code-fallow-dup-baseline">6</a></sup>

The architecture boundaries are the part that most directly protects the shape of LGI.tools. The repo is split into zones: auth surface, UI, features, data, lib, and shared code. Fallow encodes which directions are allowed. Feature code can depend on its own slice and sanctioned shared layers. Data slices should not reach back into feature UI. Shared code should stay boring. The few exceptions are written down, like the NPC stats dependency on the EVE data slice. That is the standard I want: if the exception is real, name it; do not let it appear as an accidental import.<sup><a href="#code-fallow-boundaries">7</a></sup>

Fallow is doing for the codebase what the ESI gate does for outbound API calls. The ESI gate protects a shared external budget. Fallow protects a shared internal budget: review attention, maintainability, architectural clarity, and future change capacity. Neither one makes the app more exciting on its own. Both keep the app from quietly spending something important.

The lesson from adding Fallow was not “more tools are better.” The lesson was that each rail needs the right job. TypeScript handles types. ESLint handles local syntax-level bans. Tests handle behavior. Route assertions handle rendering mode. Greptile reviews the diff after the fact. Fallow watches the repo’s structure so AI-generated code cannot keep adding weight without leaving evidence.

That is the part I care about most: evidence. I do not need a model to guess whether the branch made the repo messier. I need a repeatable audit that can say what changed, what became unused, what crossed a boundary, what duplicated, and what got more complex. Once that evidence exists, I can direct the AI with much better instructions. Without it, I am just asking the same kind of system that created the mess to notice the mess by feel.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-fallow-package" file="package.json" lines="43-48" lang="json" -->
```json
{
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "fallow": "fallow audit --fail-on-issues",
  "fallow:health": "fallow health --coverage coverage/coverage-final.json",
  "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm fallow"
}
```

<!-- uth:code id="code-fallow-ci" file=".github/workflows/test.yml" lines="42-69" lang="yaml" -->
```yaml
# Run the suite WITH coverage so the fallow audit below reads real
# per-function coverage (coverage/coverage-final.json, which fallow
# auto-detects). Without it the audit falls back to a static estimate
# whose new-only attribution can misflag PRE-EXISTING complexity and
# cross-file duplication as "introduced" the moment a PR pulls an already-
# complex/duplicated file into its diff — which a cross-cutting refactor
# inevitably does. Real coverage makes the inherited-vs-introduced call
# accurate, matching what `pnpm test:coverage && pnpm fallow` does locally.
- run: pnpm test:coverage

# fallow audit is the static gate of record (dead code, duplication,
# complexity, architecture boundaries), scoped to the PR diff with
# new-only attribution. FALLOW_AUDIT_BASE pins the base so detection is
# robust on the merge-commit checkout; a main push falls back to the
# commit before the push. fallow is a static analyzer (no DB needed); it
# consumes the coverage emitted by the step above.
#
# The `pnpm fallow` script carries `--fail-on-issues`, so the gate now
# fails on ANY finding the changeset INTRODUCES — duplication included
# (previously warn-only) alongside the warn-level rules (circular deps,
# unresolved imports, etc.). Inherited findings stay excluded by the
# new-only attribution, so a PR is only blocked by problems it adds, not
# by pre-existing ones it happens to touch. Sanctioned existing clones live
# in fallow-baselines/dupes.json.
- run: pnpm fallow
  env:
    FALLOW_AUDIT_BASE: ${{ github.event.pull_request.base.sha || github.event.before }}
```

<!-- uth:code id="code-fallow-entry-rules" file=".fallowrc.json" lines="8-52" lang="json" -->
```json
{
  "ignoreExportsUsedInFile": true,
  "entry": [
    "src/db/migrate.ts",
    "src/db/backfill-users-if-empty.ts",
    "src/db/ingest-sde-if-empty.ts",
    "src/db/ingest-sde.ts",
    "src/db/refresh-prices.ts",
    "src/db/refresh-sde.ts",
    "scripts/validate-resolver-output.ts",
    "scripts/assert-route-classification.mjs",
    "scripts/ux-capture.mjs",
    "drizzle.config.ts"
  ],
  "ignorePatterns": [
    "convex/_generated/**",
    ".next/**",
    "out/**",
    "build/**",
    "**/*.d.ts",
    "next-env.d.ts",
    "**/*.generated.ts",
    "drizzle/**",
    "docs/**",
    "convex/**/*.test.ts"
  ],
  "rules": {
    "unused-files": "error",
    "unused-exports": "error",
    "unused-types": "off",
    "unused-dependencies": "error",
    "unlisted-dependencies": "error",
    "unused-enum-members": "warn",
    "unused-class-members": "warn",
    "unresolved-imports": "warn",
    "duplicate-exports": "warn",
    "circular-dependencies": "warn",
    "re-export-cycle": "warn",
    "boundary-violation": "error",
    "coverage-gaps": "off",
    "stale-suppressions": "warn",
    "feature-flags": "off"
  }
}
```

<!-- uth:code id="code-fallow-health-overrides" file=".fallowrc.json" lines="54-116" lang="json" -->
```json
{
  "health": {
    "maxCyclomatic": 20,
    "maxCognitive": 15,
    "maxCrap": 30.0,
    "thresholdOverrides": [
      {
        "files": ["src/**/*.tsx"],
        "maxCrap": 9999,
        "reason": "intentional-policy: presentational components are covered by visual/preview review, not unit tests. CRAP's coverage weighting flags every untested component — a coverage expectation the repo has declined for this surface. Cyclomatic + cognitive stay universal, so a genuinely tangled component still fails."
      },
      {
        "files": ["src/db/**", "scripts/**"],
        "maxCrap": 9999,
        "maxCognitive": 20,
        "reason": "intentional-policy: deploy/CLI entry scripts (the `entry` set in this config). They run at build/deploy, gated by assert:routes, the migrations, and the SDE-pipeline tests — not unit coverage."
      },
      {
        "files": ["src/app/**/route.ts", "src/proxy.ts"],
        "maxCrap": 9999,
        "maxCognitive": 18,
        "reason": "framework-convention: Next.js route handlers + middleware are a sequence of boundary guard clauses (parse -> Zod -> auth -> rate-limit -> dispatch); validation-at-the-boundary is an architecture invariant."
      },
      {
        "files": ["src/**/queries.ts"],
        "maxCrap": 9999,
        "reason": "intentional-policy: DB-bound data accessors. They build/run SQL against already-typed inputs and are verified via the consuming routes/pages and integration, not unit coverage."
      }
    ]
  }
}
```

<!-- uth:code id="code-fallow-duplicates" file=".fallowrc.json" lines="118-164" lang="json" -->
```json
{
  "duplicates": {
    "mode": "mild",
    "minTokens": 50,
    "minLines": 5,
    "minOccurrences": 2,
    "threshold": 0,
    "ignoreDefaults": true,
    "ignore": [
      "**/*.test.ts",
      "**/*.test.tsx",
      "convex/_generated/**",
      "drizzle/**"
    ]
  },
  "audit": {
    "gate": "new-only",
    "dupesBaseline": "fallow-baselines/dupes.json"
  }
}
```

<!-- uth:code id="code-fallow-dup-baseline" file="fallow-baselines/dupes.json" lines="3-39" lang="json" -->
```json
{
  "clone_groups": [
    "src/app/api/cron/refresh-gsc/route.ts:27-57|src/app/api/cron/refresh-industry-indices/route.ts:33-53",
    "src/app/api/market-history/refresh/route.ts:53-65|src/app/api/market-prices/refresh/route.ts:52-67",
    "src/components/ui/bar-chart.tsx:98-128|src/components/ui/trend-chart.tsx:121-151",
    "src/data/market-prices/use-refresh-on-view.ts:116-125|src/features/industry-planner/queries.ts:181-190",
    "src/db/backfill-users-if-empty.ts:115-132|src/db/ingest-sde-if-empty.ts:152-169|src/db/refresh-sde.ts:67-82",
    "src/db/industry-jobs-sync.ts:71-79|src/db/skills-sync.ts:73-81",
    "src/features/owned-assets/refresh.ts:33-37|src/features/owned-blueprints/refresh.ts:35-39"
  ]
}
```

<!-- uth:code id="code-fallow-boundaries" file=".fallowrc.json" lines="133-158" lang="json" -->
```json
{
  "boundaries": {
    "zones": [
      {
        "// note": "First-match-wins: auth-surface is listed BEFORE the features autoDiscover zone so these 3 files classify here, not into features/auth.",
        "name": "auth-surface",
        "patterns": [
          "src/features/auth/types.ts",
          "src/features/auth/schema.ts",
          "src/features/auth/api-contract.ts"
        ]
      },
      { "name": "ui", "patterns": ["src/components/ui/**"] },
      { "name": "features", "autoDiscover": ["src/features"] },
      { "name": "data", "autoDiscover": ["src/data"] },
      { "name": "lib", "patterns": ["src/lib/**"] },
      { "name": "shared", "patterns": ["src/components/*.tsx", "src/components/telemetry/**"] }
    ],
    "rules": [
      { "from": "auth-surface", "allow": ["auth-surface", "lib"] },
      { "from": "features", "allow": ["ui", "data", "lib", "shared", "auth-surface"] },
      { "from": "data", "allow": ["lib", "auth-surface"] },
      { "from": "data/npc-stats", "allow": ["lib", "auth-surface", "data/eve-data"] },
      { "from": "lib", "allow": ["lib"] },
      { "from": "ui", "allow": ["lib"] },
      { "from": "shared", "allow": ["ui", "lib", "data", "features", "auth-surface"] }
    ]
  }
}
```
<!-- uth:code-excerpts:end -->
