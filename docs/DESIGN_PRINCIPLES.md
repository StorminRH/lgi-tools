# Design Principles (LGI.tools)

**Audience:** AI agents writing code in this repo, and the maintainer reviewing it.
**Role:** This is the constitution. The stage documents — `docs/SESSION_PLANNING.md`,
`docs/PRE_PR_DESIGN_REVIEW.md`, `docs/VERSION_AUDIT.md` — all defer to this file.
`docs/CODE_HEALTH_BASELINE.md` records the current evidence produced by those
procedures; it is state, not a competing source of design policy.
When any rule elsewhere (including a fallow threshold or a slice boundary) conflicts
with a principle here, **this file wins**, via the precedence procedure in §4.

Synthesized from John Ousterhout (*A Philosophy of Software Design*, CS 190 notes,
Tcl/Raft papers) and Martin Fowler (refactoring, code smells, self-testing code,
opportunistic refactoring), applied to this specific codebase.

---

## 1. The objective

Every design decision is judged by one criterion: **does it reduce the apparent
complexity of the system for the next change?** Complexity is anything that makes
the code hard to understand and modify. It has three symptoms — check for all
three whenever you evaluate a design:

1. **Change amplification** — one logical change forces edits in many places.
2. **Cognitive load** — a maintainer must hold too much in mind to change one thing safely.
3. **Unknown unknowns** — there is knowledge you'd need that nothing points you to.

Working code is not the bar. "Working isn't good enough." The bar is: the system
after your change should look like it was *designed* to include your change.

## 2. The principles

Each principle has an agent-checkable test. Apply the test literally.

### P1 — Deep modules

A module's interface must be **much simpler than its implementation**. Depth =
functionality hidden per concept exposed.

> **Test:** Can a caller use this module correctly knowing only its exported
> signatures and their doc comments? If a caller must also understand internals,
> call order, or sibling state, the module is shallow — fix the interface, not
> the caller.

**Corollary (critical for this repo):** length is not the enemy; shallowness is.
A 600-line file with one cohesive responsibility and a 3-function surface
(`src/data/eve-data/tree-resolver.ts`, `convex/engine.ts`) is a *good* module.
Never split a file just to make it shorter. Splitting is justified only when it
**reduces what callers must know** — i.e., when the pieces have different callers
or different reasons to change.

### P2 — Information hiding, one owner per decision

Every design decision (a data shape, an ordering rule, a policy, a magic value)
lives in exactly one module; nothing else may need to know it exists.

> **Test:** Name the decision your new code embodies. Grep for other places that
> would break if the decision changed. If any exist outside the owning module,
> knowledge has leaked — pull it into the owner.

**Anti-pattern — temporal decomposition:** never structure modules around
execution order (`validate → transform → persist → notify` files). Structure
around who *owns the knowledge*. This repo already does this well
(`membership.ts` = pure verdicts, `affiliation.ts` = orchestration,
`queries.ts` = DB half); preserve that separation of "policy vs. plumbing".

### P3 — New layer, new abstraction

Each layer must present a *different, more useful* mental model than the layer
below it. Pass-through functions and wrapper-forests are red flags.

> **Test:** For any new function that calls exactly one other function, ask what
> it hides. If the answer is "nothing — it renames arguments and forwards",
> delete it and call through directly.

Sanctioned exceptions in this repo — layers that genuinely add abstraction:
`apiFetch` over raw fetch (typed contracts + policy), `esiFetch` (rate-limit
budget), `readEnv`/`requireEnv` (validated registry), the `components/ui`
wrap-once library primitives. Do not add a second wrapper on top of any of these.

### P4 — Somewhat general-purpose, never speculative

Prefer the slightly more general interface that serves today's need
(`quote(order)` beats `quoteForGoldTierWithCoupon(order)`), but build **nothing**
for hypothetical futures. This matches CONTRIBUTING.md's "minimal by default"
and "extract a primitive when a second real consumer exists".

> **Test:** Does every parameter, flag, and export have a caller *in this PR or
> already in the repo*? If not, remove it.

### P5 — Pull complexity downward

The module author absorbs the pain so callers don't. Handle the messy edge cases
*inside*; export the calm result. Where possible, **define errors out of
existence** — design the API so the failure mode can't occur — rather than
throwing and forcing every caller to handle it.

> **Test:** Count the error/edge cases a caller of your new API must handle.
> For each, ask: could the module handle it, default it, or make it impossible?
> Each one you can't eliminate needs a doc comment explaining why the caller
> must own it.

### P6 — Strategic programming: don't hack around it

When existing structure resists the change you're making, that resistance *is*
the signal. Fix the structure first (preparatory refactoring: "make the change
easy, then make the easy change"), then implement the feature on the improved
structure. Never wedge a feature in with a workaround, a copied block, a new
special case, or a widened context object "just for now".

> **Test:** If your plan contains the words "for now", "temporarily", "hack",
> or adds a second copy of existing logic — stop and re-plan
> (see `docs/SESSION_PLANNING.md` §3).

### P7 — Comments carry non-obvious knowledge

Comments exist to hold what code cannot express: interface contracts, design
rationale, invariants, units, ownership, why-not-the-obvious-way. This repo's
rationale-dense comment style (see the section banners in
`src/features/auth/queries.ts`, the field docs in `PricingContextValue`) is
correct — keep it. Write interface comments **before** implementing; if the
comment is hard to write, the interface is wrong.

> **Test:** Does the comment say something the signature doesn't? Delete
> comments that restate code. Add comments wherever a reviewer would ask "why?".
> **Red flag:** a comment that exists to *navigate* an interface ("fields 12–19
> are for the market score") means the interface is too broad — fix the
> interface (P1), don't polish the comment.

### P8 — Depth beats decomposition dogma

Never produce "classitis": many tiny hooks/components/services each exposing a
new concept. More pieces ≠ better design. In React terms: **leaf components stay
shallow and presentational; the feature slice is the deep module.** Providers,
context objects, and barrel files must not accrete into wide grab-bags.

> **Test (context width):** Adding a field to a context/provider value that
> already has many fields is *widening a public interface* — treat it with the
> same suspicion as adding a parameter to a public API. Ask first whether a
> narrower selector hook or a sibling context serves the consumer better.

### P9 — Refactoring is small, behavior-preserving, and test-backed

Structural change happens as a sequence of small steps, each keeping the suite
green. Before restructuring code with weak coverage, add **characterization
tests** (lock current behavior, even if imperfect) at the seam you're about to
move. Never mix a behavior change and a structural change in the same commit —
a reviewer must be able to see "this commit changes shape, not behavior".

> **Test:** After every extract/move/rename step, `pnpm test` is green. If a
> step can't be made behavior-preserving, it's a feature change — plan it as one.

### P10 — Metrics rank attention; they never dictate design

`fallow`, lint, coverage, and CI are **fitness functions**: they exist to catch
the failure modes this repo actually has and to point at pressure. They are
subordinate to P1–P9. Complexity scores (cyclomatic/cognitive/CRAP) are proxies;
a cohesive algorithm can legitimately exceed them, and a shallow fragment-forest
can pass them while making the system worse.

> **Test:** Before "fixing" a metric violation, ask which principle the code
> actually violates. If the answer is "none — the metric dislikes a deep,
> cohesive function", use the escape hatch in §4.1 instead of shallowing the code.

**Audit-remediation corollary:** a version-close audit is design feedback, not a
score-reporting ceremony. Every confirmed Floss or Campaign extends the current
master version until a fresh audit verifies the underlying design outcome.
Remediation planning must also apply `docs/SESSION_PLANNING.md` and define the
later `docs/PRE_PR_DESIGN_REVIEW.md` evidence before implementation begins.
Watch is the only non-blocking classification because it records pressure that
does not yet justify intervention; every Watch names the evidence that would
promote it to actionable work.

## 3. Red flags — recognize and name them

When you see one of these in code you're touching, name it in your notes and
either fix it in-flow (small) or file it to `docs/backlog.md` (large):

| Red flag | What it looks like here |
| --- | --- |
| Shallow module | Export whose doc comment is longer than the value it hides; hook that wraps one call |
| Information leakage | Same decision (shape, ordering, constant) known in ≥2 modules |
| Temporal decomposition | Modules named for pipeline steps instead of owned knowledge |
| Pass-through layer | Function/component that forwards with no added abstraction |
| Wide public surface | Context value / barrel / props object where consumers use ≤3 of many fields |
| Mixed change axes | One file that changes for unrelated reasons (see auth/queries.ts, §5) |
| Conjoined methods | You can't understand one function without reading its sibling |
| Special-case creep | Flags/optional params multiplying to route around a design |
| Voodoo constant | A threshold/magic value exported for callers to pass back in |
| Comment as apology | Rationale comment explaining an interface that shouldn't need one |
| Hack around pressure | "for now", duplicated block, boundary exception widened casually |

## 4. Precedence: when rails conflict with principles

This repo's rails (fallow zones, complexity thresholds, dupes baseline, lint
rules) were built to catch real failure modes and they stay load-bearing. But
the maintainer has decided: **when a rail and a deep design genuinely conflict,
the design wins and the rail is adjusted deliberately.** "Deliberately" means
via one of these two procedures — never by silent suppression, and never by
contorting the code to appease the tool.

### 4.1 Complexity/CRAP threshold vs. a deep, cohesive function

If `fallow` flags cyclomatic/cognitive/CRAP on a function and splitting it would
create shallow fragments or conjoined pieces (P1/P8):

1. Confirm the function is genuinely cohesive: one responsibility, one caller-facing
   concept, rationale comments present (P7). If it's actually doing several
   unrelated jobs, the metric is right — split by change axis instead.
2. If cohesive: add a scoped entry to `health.thresholdOverrides` in
   `.fallowrc.json` (or the narrowest available suppression) **with a `// note`
   explaining which principle justified it and the date**.
3. Record the override in `docs/CODE_HEALTH_BASELINE.md` in the same change.
   `docs/VERSION_AUDIT.md` reviews every recorded override for staleness — an
   override is a loan, not a gift.

The CRAP metric couples complexity to coverage; where the honest fix is a
characterization test rather than a split, prefer the test. Where neither a
test nor a split makes the design better, override with rationale.

### 4.2 Slice boundary vs. an improved design

The current zone map (`.fallowrc.json` `boundaries`, enforced by Fallow and
described in CONTRIBUTING.md) is a snapshot of the design, not scripture. If
the right design needs a boundary redrawn (e.g., promoting shared contracts out
of a feature slice, splitting a slice, adding a composition layer):

1. Propose the redraw **in the planning session**, not mid-implementation
   (`docs/SESSION_PLANNING.md` §6). State which decision the new boundary hides
   and which imports it will newly allow/forbid.
2. Update both representations in one commit: `.fallowrc.json` zones/rules and
   the prose in CONTRIBUTING.md. Fallow is the single mechanical owner; do not
   restore duplicate ESLint boundary rules. A boundary that exists in only one
   of the two is a future unknown-unknown.
3. Watch for the **exception-widening smell**: the `auth-surface` zone is a
   deliberate, 3-file platform-contract exception. If a change wants to add a
   fourth file to it, that is a design event, not a config edit — it likely
   means auth's shared contracts deserve their own platform module rather than
   a wider exception inside a feature slice.

## 5. Repo map: what "deep" means here

**The unit of depth is the feature slice, not the component.** A slice's public
surface should be: its route entry, its `api-contract.ts`, and a small number of
top-level components/hooks. Everything else is private implementation.

Known-good deep modules — protect these, imitate their shape:
- `src/data/eve-data/tree-resolver.ts` — long, cohesive, rationale-rich algorithm.
- `convex/engine.ts` — one sanctioned sync engine behind a small surface.
- `src/lib/esi/` (`esiFetch` + budget), `src/lib/api-client.ts`, `src/lib/env.ts` —
  small interfaces hiding real policy.
- The industry-planner's pure-logic file pairs (`build-*.ts` + co-located tests) —
  policy extracted from components, testable, presentation left shallow.

The always-current hotspot table, evidence, surface metrics, and campaign queue
live in `docs/CODE_HEALTH_BASELINE.md`. Session planning reads it before
designing work; pre-PR review updates affected rows in the same change; the
version audit replaces the whole snapshot. Never copy live numbers back into
this constitution.

**Standing interpretation:** a hotspot is where interface breadth, unrelated
change axes, and churn coincide — not merely a long file. A baseline row must
state the direction of the fix, not just “make it smaller.”

**Explicit non-goals:** do not shorten `tree-resolver.ts`, `engine.ts`, or other
long-but-cohesive modules; do not add wrapper layers over the sanctioned gates;
do not backfill tests for coverage's sake; do not restructure code you aren't
otherwise touching except through the version-audit campaign process. The
baseline may reaffirm these modules as protected non-goals but cannot override
this rule.

## 6. One-paragraph summary an agent can hold

Judge every change by whether the next change gets cheaper. Make interfaces
small and implementations rich; give every decision one home; let each layer buy
a new abstraction or not exist; absorb edge cases inside modules; when the
structure fights you, fix the structure first with small green-test steps; write
down the why; and treat fallow and the boundaries as instruments that serve this
design — recalibrated deliberately when the design outgrows them, never obeyed
into shallowness.
