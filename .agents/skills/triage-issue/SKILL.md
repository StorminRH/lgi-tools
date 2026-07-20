---
name: triage-issue
description: >-
  Triage an incoming GitHub issue or contribution for the LGI.tools repo: pull the
  issue, VALIDATE every claim against the actual codebase (diagnose-before-fixing —
  grep/read the cited files, confirm the line numbers and behavior, catch false
  positives, and judge whether it's a one-line fix or the tip of a wider problem),
  then REPORT a clear recommendation plus the response directions to choose from
  (acknowledge/comment, request more info, decline with a reason, invite the
  contributor to open the PR, fix it ourselves, or expand into a broader cleanup).
  Only after the user picks a direction does it act. Use this whenever a new issue
  or contributor PR comes in and you want to size it up before responding —
  phrasings like "triage this issue", "look at issue #160", "a contributor opened
  an issue", "someone filed a bug", "what should I do with this issue", "is this
  bug report real", "handle this contribution", "validate this issue". It NEVER
  posts a comment, opens a PR, or merges without the user's chosen direction.
---

# Triage an issue / contribution (LGI.tools)

<!-- shared-policy-revision: 28 -->

Turns an incoming issue into a validated diagnosis and a short menu of response
directions, then acts only on the one the user chooses. The point is to **respond
from evidence, not from the issue's say-so** — a confident, well-written report
can still be wrong, stale, or the visible corner of a much bigger problem.

Create a native Codex todo list from this skill's numbered phases before
retrieval, keep one item in progress, and attach evidence before completing it.
Treat `docs/DESIGN_PRINCIPLES.md` as the constitution when judging whether a
reported local defect is evidence of broader design or boundary decay.

**Standing guardrails (the whole reason this is a skill, not just "go fix it"):**
- **Diagnose before fixing.** Verify every claim against the code before agreeing
  with it. Show the evidence (`file:line` + a quote), not an assertion.
- **Never act outward without a chosen direction.** Posting a comment, opening a
  PR, editing labels, or merging are the user's calls. Triage + report first; the
  user picks; *then* you act.
- **Hold the chosen scope.** If validation reveals a bigger problem, that's a
  *finding to surface in the report* — offer "expand scope" as an explicit option,
  don't silently absorb it.

---

## Step 1 — Pull the issue (or contribution)

- If given a number: `gh issue view <n> --comments`. For a PR: `gh pr view <n> --comments` and `gh pr diff <n>`.
- If given nothing: `gh issue list --state open` and either pick the one the user
  clearly means, or ask which.

Read it for: the concrete **claim(s)**; the **author** (a first-time / external
contributor changes the etiquette below); whether they **offered to open a PR**;
and any **direction they proposed** (e.g. "option 1/2/3, your call").

---

## Step 2 — Validate against the codebase

For **each** claim, confirm it independently. Don't trust line numbers or "X was
removed" / "Y is broken" — check:

- The cited files/lines exist and say what's claimed. Orient with Graphify first
  (`graphify query` / `graphify explain`) before grepping or reading raw source.
- Behavioral claims hold against live state, not just memory. (E.g. "this page
  404s" → does the route file exist? does the live URL actually 404, or is a 429
  rate-limit being misread as gone? `curl -sS -o /dev/null -w "%{http_code}"`.)
- Whether the same root cause appears **elsewhere** — one dangling reference,
  stale command, or missing guard is often a class. When the surface looks broad,
  run a quick read-only search sweep to size it (a fan-out of read-only finders is
  ideal for "find every instance of this across the repo"). The gap
  between "the 4 spots they found" and "the ~21 spots that actually exist" is
  exactly what makes triage worth doing.
- Repo context that reframes it: `AGENTS.md`, auto-memory, the recent changelog
  (`content/changelog/`).

Land on two verdicts:

- **Validity:** `valid` · `partially valid` · `false positive` · `needs info` ·
  `duplicate` · `works-as-intended`.
- **Scope:** `trivial` (one-line) · `contained` (one coherent change) ·
  `tip-of-iceberg` (a whole class — name how wide).

---

## Step 3 — Report + recommend, then offer directions

Write a short report: the validated diagnosis with evidence, the two verdicts, and
a plain-English **recommendation**. Then present the response directions and ask
the user to choose (recommended option first, labeled "(Recommended)"). Pick the
axes that actually apply — don't ask dead questions:

- **Response type** — when the issue isn't simply "go fix it":
  `acknowledge & fix` · `request more info` · `decline with a reason`
  (works-as-intended / out-of-scope) · `close as duplicate`.
- **Who opens the PR** — when a fix is wanted: `invite the contributor`
  (especially if they offered, or you want to grow repeat contributors — friendlier
  but slower) vs. `we do it` (faster, full control).
- **Scope** — when validation found an iceberg: `minimal fix` (just what was
  reported) vs. `expand into a broader cleanup` (fix the whole class). Spell out
  the diff-size / risk trade-off so the choice is informed.

If a real decision is genuinely the user's (publish-vs-keep-private, relationship
with a contributor, how wide to go), surface it and let the user decide — not a
default you silently choose.

---

## Step 4 — Act on the chosen direction

**Comment-only paths** (acknowledge / request info / decline / invite-PR): draft
the comment in the repo's plain-English voice (the `AGENTS.md` commit/PR style — no
jargon or file-path dumps), **credit the contributor by name**, and for an invite,
point them at `CONTRIBUTING.md`. Show the draft, then post with `gh issue comment
<n> -F <file>` once the user is good with it.

**Fix-it-ourselves path:**
- Anything beyond a trivial one-liner → **plan mode first** (the repo requires a
  plan before an autonomous run; confirm scope, ctx7-check any library APIs).
- Implement on a branch (`docs/…`, `fix/…`, `feat/…` as fits), keeping to the
  chosen scope.
- The PR that resolves it **must say `Fixes #<n>`** so the issue auto-closes on
  merge. Acknowledge the reporter in the issue thread either way.
- Ship via the **`close-out` skill** (push → PR → Greptile loop → squash-merge),
  which carries the merge authorization and the green-only gate.
  Every completed sub-version bumps `APP_VERSION` and adds a changelog entry —
  internal and user-facing work alike; only user-facing work adds the `ux-check`
  + Ryan review pause.

**Contribution PRs** follow the same spine: validate the diff against the codebase
and CI, then offer `approve & merge` (via `close-out`) · `request changes`
(specific, kind) · `decline with a reason`. Greptile + CI are the review of record.

---

## The directions menu (quick reference)

```
Validity → Scope → Response
  valid / partial / false-positive / needs-info / duplicate / works-as-intended
  trivial / contained / tip-of-iceberg
  ─────────────────────────────────────────────────────────────────
  acknowledge & fix ──┬─ who: contributor-opens-PR | we-open-PR
                      └─ scope: minimal | expand-to-cleanup
  request more info        (comment, then pause)
  decline with a reason    (works-as-intended | out-of-scope | duplicate)
```

Default to **thorough validation, minimal-but-honest reporting, and the user's
call on direction.** A first issue answered with evidence and a real choice of
next steps is how a repo earns repeat contributors.
