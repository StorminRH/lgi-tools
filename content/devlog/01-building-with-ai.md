## Building with AI
<!-- updated: 2026-06-30 -->

This project was built with AI. Not partially, not as autocomplete, and not as a small productivity boost. The web app exists because AI made it possible for me to build something I could not have built by hand.

That does not mean I treat the AI like magic. My role in this project has been architecture, research, planning, constraint-setting, review, and direction. I start with the idea for what I want the tool to do, then spend time trying to understand what kind of system that idea belongs in. Once I have a rough model, I work with AI to turn it into small, scoped implementation steps. The AI writes the code. My job is to make sure the work is pointed in the right direction and boxed in by enough rules that the result has a chance of looking like something a good developer would have designed.

The biggest lesson is that AI coding without constraints turns into slop very quickly. It can produce code that looks clean in isolation but duplicates existing logic, bypasses shared boundaries, invents patterns the rest of the repo does not use, or solves the immediate prompt while damaging the system around it. The output can be confident and wrong at the same time. That is the dangerous part.

So the process is not “ask for a feature and accept the answer.” It is closer to: research the problem, turn that into a small plan, give the AI one narrow piece at a time, tell it what it is not allowed to do, run the rails, and review the result against the architecture rather than just the visible page.

A lot of the project’s history is the story of turning painful lessons into rails. Early on, the checks were mostly the familiar ones: lint and tests. [PR #77](https://github.com/StorminRH/lgi-tools/pull/77) changed that into a local definition of done by bundling type-checking, linting, tests, and unused-code analysis into `pnpm verify`. Later, [PR #116](https://github.com/StorminRH/lgi-tools/pull/116) replaced the dead-code-only checker with Fallow, [PR #119](https://github.com/StorminRH/lgi-tools/pull/119) forced the repo through the cleanup needed to make that gate meaningful, and [PR #158](https://github.com/StorminRH/lgi-tools/pull/158) made new duplication fail instead of merely report. The rule did not appear fully formed. It started as “run some checks,” then became “this is what done means.”<sup><a href="#code-ai-verify-package">1</a></sup>

CI repeats that posture instead of trusting me, or an agent, to remember it. The workflow installs from a clean checkout, type-checks, lints, checks that route metadata has not drifted, runs the suite with coverage, and then runs Fallow against the actual change base. The coverage part looks like detail, but it is load-bearing: without it, a cross-cutting AI refactor can make inherited complexity or duplication look newly introduced just because the file entered the diff. The repo learned to make the machine compare the right thing, not just compare something.<sup><a href="#code-ai-ci-workflow">2</a></sup>

The second lesson was that prose rules are too easy for AI to miss. Architecture boundaries, design-token rules, typed API calls, environment handling, and route metadata all started as things a prompt could ask for. That was not good enough. The repo now turns many of those rules into lint checks, static-analysis checks, and build-time assertions. The exact examples get their own later sections, but the pattern is the important part here: “please follow the pattern” became “the repo will reject the wrong pattern.”<sup><a href="#code-ai-eslint-rails">3</a></sup>

Fallow is the wider structural net. It is where the repo checks for unused files and exports, dependency mistakes, boundary violations, complexity, and duplication. The useful lesson there was restraint. The goal was not to build the strictest possible machine. It was to build a machine that catches the failure modes this repo actually had. That is why the config has explicit entries, explicit exceptions, and a duplication baseline instead of pretending every repeated shape is automatically bad. Some repetition is debt. Some is boring framework shape. Some is a bad abstraction waiting to happen. The rail has to know the difference, or it just becomes noise.<sup><a href="#code-ai-fallow-rails">4</a></sup>

The route rails are a good example of that same process, but this is only the high-level version. The repo records what routes exist, what kind of rendering they are supposed to use, and what authorization class each API route belongs to. Later, the dedicated route-assertion section goes through the details. Here, the lesson is simpler: metadata that matters at deploy time cannot live only in my head or in an agent’s prompt. If a route changes, the repo should notice.<sup><a href="#code-ai-route-presence">5</a></sup><sup><a href="#code-ai-route-render-mode">6</a></sup><sup><a href="#code-ai-authz-markers">7</a></sup>

The softer side of this is documentation. [PR #162](https://github.com/StorminRH/lgi-tools/pull/162) moved contributor-facing conventions into a tracked guide instead of an internal working file, and [PR #167](https://github.com/StorminRH/lgi-tools/pull/167) wrote down the shared UI/component pattern. That matters because AI agents are only as good as the constraints they can see. If the repo has a house style but the prompt does not surface it, the AI will invent one. The fix is not to hope the agent guesses right. The fix is to put the decision where both humans and agents can find it.

That is the discipline around the whole project. I am not trying to pretend I hand-wrote a professional-grade application from scratch. I am trying to understand good design well enough to direct AI toward it, then build enough rails that bad output gets caught before it becomes part of the system. When something breaks through those rails, I treat that as a process failure and add a stronger boundary the next time.

<!-- uth:code-excerpts:start -->
<!-- Editor note: each snapshot below is defined by a header carrying id (required),
     file, lines, lang, and an OPTIONAL ref="<40-char commit sha>". A ref turns the
     file:lines label into a pinned GitHub permalink — add it only when `file` is a real
     repository path (never a prose label like a PR review thread), and the precise
     #Lx-Ly anchor is emitted only for a single clean line range. Keep each snapshot to
     about 30 lines; longer context belongs behind the permalink. -->
<!-- uth:code id="code-ai-verify-package" file="package.json" lines="43-50" lang="json" -->
```json
"test": "vitest run",
"test:coverage": "vitest run --coverage",
"fallow": "fallow audit --fail-on-issues",
"fallow:health": "fallow health --coverage coverage/coverage-final.json",
"verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm fallow"
```

<!-- uth:code id="code-ai-ci-workflow" file=".github/workflows/test.yml" lines="32-69" lang="yaml" -->
```yaml
- run: pnpm typecheck

- run: pnpm lint

# Lightweight presence gate (no build): every src/app route is classified
# in route-classification.json and vice-versa. The full render-MODE assert
# (assert:routes) needs `next build` and runs at deploy, so this catches a
# route added or removed without its classification entry here in plain CI.
- run: pnpm assert:routes-present

# Run the suite WITH coverage so the fallow audit below reads real
# per-function coverage. Without it the audit falls back to a static estimate
# whose new-only attribution can misflag PRE-EXISTING complexity and
# cross-file duplication as "introduced" the moment a PR pulls an already-
# complex/duplicated file into its diff.
- run: pnpm test:coverage

# The `pnpm fallow` script carries `--fail-on-issues`, so the gate now
# fails on ANY finding the changeset INTRODUCES — duplication included.
- run: pnpm fallow
  env:
    FALLOW_AUDIT_BASE: ${{ github.event.pull_request.base.sha || github.event.before }}
```

<!-- uth:code id="code-ai-eslint-rails" file="eslint.config.mjs" lines="12-185" lang="js" -->
```js
const cspSelectors = [
  { selector: "JSXAttribute[name.name='style']" },
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']" },
  { selector: "AssignmentExpression[left.property.name=/^(inner|outer)HTML$/]" },
];

const hexColorSelectors = [
  { selector: "Literal[value=/\[[^\]]*#[0-9a-fA-F]{3,8}/]" },
  { selector: "TemplateElement[value.raw=/\[[^\]]*#[0-9a-fA-F]{3,8}/]" },
  { selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]" },
];

const apiFetchSelectors = [
  { selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.value=/^\/api\//]` },
  { selector: String.raw`CallExpression[callee.name='fetch'][arguments.0.quasis.0.value.raw=/^\/api\//]` },
];

const processEnvSelectors = [
  {
    selector:
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']:not([property.name=/^NEXT_PUBLIC_/])",
  },
];
```

<!-- uth:code id="code-ai-fallow-rails" file=".fallowrc.json" lines="36-163" lang="jsonc" -->
```jsonc
"rules": {
  "unused-files": "error",
  "unused-exports": "error",
  "unused-dependencies": "error",
  "unlisted-dependencies": "error",
  "boundary-violation": "error"
},
"health": {
  "maxCyclomatic": 20,
  "maxCognitive": 15,
  "maxCrap": 30.0,
  "thresholdOverrides": [
    {
      "files": ["src/**/*.tsx"],
      "maxCrap": 9999,
      "reason": "intentional-policy: presentational components are covered by visual/preview review, not unit tests."
    }
  ]
},
"boundaries": {
  "zones": [
    { "name": "ui", "patterns": ["src/components/ui/**"] },
    { "name": "features", "autoDiscover": ["src/features"] },
    { "name": "data", "autoDiscover": ["src/data"] }
  ]
},
"audit": {
  "gate": "new-only",
  "dupesBaseline": "fallow-baselines/dupes.json"
}
```

<!-- uth:code id="code-ai-route-presence" file="scripts/assert-routes-present.mjs" lines="1-67" lang="js" -->
```js
// CI presence check (no build required): every route-defining file under
// src/app has a classification entry in scripts/route-classification.json, and
// every classification entry still has a file. The full render-MODE assert
// (assert-route-classification.mjs) needs a `next build` and runs at deploy.

const missing = [...discovered].filter((k) => !classified.has(k)).sort();
const stale = [...classified].filter((k) => !discovered.has(k)).sort();

if (missing.length || stale.length) {
  console.error(`\nAdd new routes to (and remove deleted ones from) ${CLASSIFICATION_PATH} in the same change.`);
  process.exit(1);
}
```

<!-- uth:code id="code-ai-route-render-mode" file="scripts/assert-route-classification.mjs" lines="1-90" lang="js" -->
```js
// Asserts that `next build`'s render mode for every route matches the committed
// expectation in route-classification.json. Runs after `next build` so a route
// can't silently regress to a more dynamic mode.

function classify(route) {
  if (!prerendered.has(route)) return 'dynamic';
  const metaPath = metaPathFor(route);
  if (!existsSync(metaPath)) return 'partial';
  return 'postponed' in readJson(metaPath) ? 'partial' : 'static';
}

if (errors.length > 0) {
  console.error('\n✗ Route render-mode classification check failed:');
  process.exit(1);
}
```

<!-- uth:code id="code-ai-authz-markers" file="src/app/api/authz-markers.test.ts" lines="8-77" lang="ts" -->
```ts
// Mechanical authorization-classification guard. Every route handler under
// src/app/api must self-declare its authorization class on its own comment line:
//
//   // authz: public | auth | admin | cron | service
//
// This asserts ONLY that the marker is present, unique, and well-formed.

const MARKER_RE = /^[ \t]*\/\/[ \t]*authz:[ \t]*([a-z]+)[ \t]*$/gm;
const VALID_CLASSES = new Set(['public', 'auth', 'admin', 'cron', 'service']);

it.each(ROUTE_FILES)('%s declares exactly one valid authz class', (file) => {
  const src = readFileSync(file, 'utf8');
  const matches = [...src.matchAll(MARKER_RE)];
  expect(matches.length).toBeGreaterThan(0);
  expect(matches.length).toBeLessThan(2);
  expect(VALID_CLASSES.has(matches[0][1])).toBe(true);
});
```
<!-- uth:code-excerpts:end -->
