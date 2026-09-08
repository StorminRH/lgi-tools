# Verification contract

Use this contract to select local evidence, commission `test-runner`, and
judge reuse. Required GitHub merge checks are a separate delivery gate in
[delivery](delivery.md). Testing quality remains in
[testing principles](../contributing/testing-principles.md) and
[end-to-end testing](../contributing/end-to-end-testing.md).

## Select the cumulative scope

Compare against the last applicable verified revision, including earlier
unverified commits, staged/unstaged changes and untracked files. Inspect
content and consumers: a `docs/` path may contain executable probes or
application inputs. Record scope, relevant dependencies/configuration,
environment and existing evidence before selecting commands.

| Change | Local evidence |
| --- | --- |
| Pure prose or policy | Review meaning, links and references. Application checks are `NOT REQUIRED`. |
| Machine-consumed guidance, agent metadata, schemas or tooling | Relevant parsers, contract checks, focused tooling tests and runtime discovery where changed behavior requires it. |
| Application behavior, tests, dependencies, build or runtime configuration | Focused behavior proof plus applicable typecheck, lint and Fallow gates. Broaden for actual blast radius. |
| Coverage/verification infrastructure | Execute the changed contract and its prerequisites; prove required cases really ran. |

Use `test-runner` for selected executable checks to keep logs and diagnosis
out of the parent context. A prose-only change does not launch an app-test
seat. An already running native `test-runner` executes the assigned checks
directly; it does not launch another `test-runner`.

For application scope the standard local packet is `pnpm typecheck`,
`pnpm lint`, `pnpm exec fallow dead-code --fail-on-issues`,
`pnpm exec fallow dead-code --production --fail-on-issues`,
`pnpm exec fallow dupes --fail-on-issues`, `pnpm fallow:health:local`,
and focused tests selected for the cumulative diff. This packet is not the
full coverage suite. `pnpm verify` includes full coverage and coverage-fed
Fallow; read current scripts for prerequisites and exact composition.

## Schedule and execute

Batch compatible focused Vitest files in one invocation with the same
configuration and prerequisites. Run at most two independent heavy commands
at once. Each command has a separate execution result, numeric exit from
the tool, and diagnostic/log location. Do not combine commands into a shell
chain or manufacture exit codes.

Serialize actual dependencies and shared writers. Full coverage finishes
before coverage-fed Fallow; build finishes before browser tests using that
build. One writer owns coverage/build output at a time. Fallow 3.20 uses
fixed temporary filenames within its cache: serialize Fallow modes sharing
a cache, or supply distinct `FALLOW_CACHE_DIR` values. Confirm disposable DB
isolation before overlapping DB suites. Benchmarks run without competing
loads. A focused coverage map cannot stand in for whole-suite coverage.

## Reuse and return

Reuse successful evidence only after comparing relevant source, test,
dependency, configuration and environment inputs. Keep the original tested
SHA and explain its applicability to the current head; committing identical
bytes or editing prose does not by itself invalidate application proof.
Dirty-tree proof also records the tested diff/content identity. A relevant
change invalidates dependent evidence, not every unrelated result. Missing
or unverifiable evidence is never a pass. Local reuse cannot waive current
GitHub required checks or substitute head proof for a tested merge ref.

Return the conclusion first with cumulative scope and current revision,
then one record per selected or reused command:

- Command: exact execution, or the omitted check.
- Status: `PASS`, `FAIL`, `BLOCKED`, `NOT RUN`, or `NOT REQUIRED`.
- Exit: tool-reported numeric exit; `Unknown` when unavailable.
- Tested inputs: original SHA/diff, environment and prerequisites.
- Applicability: current head and relevant equivalence, or invalidation reason.
- Evidence: concise decisive diagnostic and accessible artifact/log path.
- Next action: required correction or rerun condition, or None.

`NOT REQUIRED` means the scope does not call for that check. `NOT RUN` means
it was selected but unexecuted. `BLOCKED` names the unavailable prerequisite;
`FAIL` means execution failed. Only successful executed or explicitly reused
evidence earns `PASS`. Never claim DB coverage when the DB cases skipped.
Keep raw output and retries in the child or artifacts; the parent requests
only the missing evidence rather than routinely repeating the investigation.
