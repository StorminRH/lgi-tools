---
name: ux-check
description: Run selected Playwright route and interaction acceptance for user-facing changes, then obtain the operator visual disposition.
---

# Run the UX check

Playwright Test owns browser acceptance. Read the [command and evidence
contract](../../../docs/ux-check/README.md) before choosing a lane. This skill
selects affected journeys and consumes their report; it does not own a second
browser runner. Local suite and required CI remain independent under
[verification](../../../docs/workflows/verification.md).

Inputs: the complete diff, affected routes/interactions, exact tested revision,
and a stack that represents the required behavior. Resolve shared consumers
through `repo-mapper`. Include committed, staged, unstaged and untracked changes.
For lifecycle work, retain the selected Ordered work and its operator pause.

1. Select the smallest sufficient route cases and interaction journeys from
   the executable inventory. Require exact URL, principal, ready content and
   changed state. A quiet error shell or empty selection cannot pass.
2. Choose a lane and satisfy its prerequisites. Local mutation uses disposable
   PostgreSQL/Convex data with fixture-owned users, grants and maps. Production
   lanes require a production build and own their server; development probes
   use a separate development server. Missing backend, authentication, fixture
   or selected scenario is `BLOCKED`.
3. Run the selected Playwright command. `pnpm ux-check` uses the same owner as
   `pnpm test:e2e`; use Playwright flags for routes and `E2E_SCENARIOS` for optional
   journeys. Do not substitute retries, allow-empty flags, skips or an unselected
   whole portfolio for meaningful acceptance.
4. Read `docs/ux-check/captures/e2e-report.json`. Require actual execution,
   diagnostic disposition and successful fixture cleanup, including on failure.
   Unexpected first-party HTTP errors, required Convex failures, page/console
   errors and CSP violations fail. Expected failures must match the scenario's
   exact endpoint, method and status.
5. Return the subject and report, selected/unselected/blocked cases, command
   exits, cleanup result and limitations. A clean report is `READY_FOR_REVIEW`.
   Give the operator a short visual checklist for changed routes/interactions
   and wait for their disposition. Agents do not visually approve the product.
   Record `Approved` or `Changes requested` only from the operator. Do not open
   a PR from this skill; return to its delivery owner.

## Lane selection

| Need | Entry point |
| --- | --- |
| Small production route contract | `pnpm test:e2e --grep '<case>'` |
| Changed local interaction | `E2E_SCENARIOS=<journeys> pnpm test:e2e:local` |
| Requested deployed read | `pnpm test:e2e:deployed --grep '<case>'` |
| Development navigation | `E2E_SCENARIOS=<journeys> pnpm test:e2e:dev` |
| Explicit performance observation | `E2E_SCENARIOS=<journeys> pnpm test:e2e:benchmark` |

The command reference owns environment variables, inventory IDs and device
selection. Benchmarks require declared calibration; they do not gate production
or justify paid compute. Listings prove selection only, not browser execution.

## Deployed checks and artifacts

Use a verified deployment revision and operator-supplied authentication. No
synthetic seed, local server, application HTTP write or Convex mutation/action
is allowed in this lane. An authenticated route requiring heartbeat writes
blocks it; choose public smoke when appropriate. Protection bypass headers
stay scoped to the exact origin. Keep auth files outside artifacts.

Upload only the sanitized report and failure diagnostics. Raw traces, screenshots,
video, cookies, headers and storage state have no verified sanitizer and are not
uploadable evidence. A remote GET may have server-side effects the browser cannot
prove absent; preserve the deployment's actual access boundary.

With explicit staging-test direction, [close-out](../close-out/SKILL.md) owns
promotion first, then this skill completes the pending operator review. Merge
or deployment success does not provide that disposition. For tooling-only
changes with no product UI change, record why visual review is not applicable.
