# LGI.tools

EVE Online multi-tool. Work lands in slices.

## Workflow

- Ordinary work starts from a direct request. Skip lifecycle state and the
  resolver.
- Planned lifecycle work starts only through `start-session`. Use the
  resolver-selected branch and handler.

## Agent guidance

Use the repository instructions for the active harness:

| Harness | Skills | Named agents |
| --- | --- | --- |
| Cursor | `.cursor/skills/` | `.cursor/agents/` |
| Codex | `.agents/skills/` | `.codex/agents/` |

When both skill copies are discoverable, select the active harness's path.
Keep shared workflow changes aligned across both copies; invocation syntax
and model mappings belong to their harness. Before editing agent guidance,
read that harness's `writing-for-agents` skill.

## Agents

Use a listed agent when the work isolates to it. Other sub-agents are fine
when they help.

Launch `docs-researcher` before writing or editing production or test code that
touches React, Next.js, Convex, Base UI, React Flow, Vitest, or peers.
Generation waits on a Documentation brief.

Launch `repo-mapper` for relationship, consumer, dependency, or blast-radius
questions. It uses Codegraph (`callers`, `callees`, `impact`, `query`;
`status`/`sync` if needed) and returns a Repository map.

Launch `test-runner` before commits, and whenever the local test suite
needs test results: `pnpm typecheck`, `pnpm lint`, Fallow
`dead-code` (default and `--production`), `dupes`, and `health`, plus
caller-supplied focused tests for the diff.

Launch by the exact role name and keep the definition's model pin. In Cursor,
omit Task `model`. In Codex, use `agent_type` and omit `model` and
`reasoning_effort`; read `.agents/skills/_shared/codex-agents.md` before
launching seats. A missing required role blocks that seat; report the loading
failure and repair discovery before retrying.

## Done

Land on GitHub `development` when the local test suite is green. Promote
(`development` → `staging`) and release (`staging` → `main`) wait on
`close-out`, including GitHub Actions Verify on the current PR after reviews.

## Tools

GitHub is the land forge, with one PR for delivery and bot review.
Linear is the ticket home. GitHub issues are not in use. Update watch
comments on standing `LGI-6`.

**gh** — GitHub PRs stay draft. Local suite green, then create:
`gh pr create --draft --head <head> --base <destination> --repo StorminRH/lgi-tools`
Pass `--draft` explicitly. Leave it draft through reviews and fixes.
Always pass `--head`, `--base`, and `--repo`; after `test-runner` the checkout can
be detached. `no-comments` and `comment-sicko` write first. Then request
bots manually on that same PR. Freeze that head. Reviewers run
`gh pr diff <N> --repo StorminRH/lgi-tools`.
The brief is the PR number and head SHA. Keep that freeze until every seat
has returned. Then one batch: triage, dedupe, fix, note on the PR.
A push changes the head SHA.
Re-read `headRefOid` when `view` still shows the previous head. Request Bugbot
once by hand. Accumulating drafts stay draft; final CI waits until
that PR is finishing. GitHub review threads have node IDs; conversation
comments have URLs. A review is a verdict on a head SHA.
`gh pr create --draft --head <head> --base <destination> --repo StorminRH/lgi-tools`
`gh pr diff <N> --repo StorminRH/lgi-tools`
`gh pr view <N> --repo StorminRH/lgi-tools --json headRefOid,baseRefOid,isDraft`
`gh pr comment <N> --repo StorminRH/lgi-tools --body-file <comment-file>`
`gh pr view <N> --repo StorminRH/lgi-tools --comments`
`gh pr list --repo StorminRH/lgi-tools`

List unresolved review threads with the PR number in `PR_NUMBER`:

```sh
gh api graphql --paginate -F number="$PR_NUMBER" -f query='
  query($number: Int!, $endCursor: String) {
    repository(owner: "StorminRH", name: "lgi-tools") {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $endCursor) {
          nodes { id isResolved comments(first: 1) { nodes { databaseId url } } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }' --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'
```

Reply to the thread's first review comment using its `databaseId`, then resolve
its node ID when addressed. Conversation comments are not resolvable threads.
`gh api --method POST repos/StorminRH/lgi-tools/pulls/<N>/comments/<comment-id>/replies --input <reply-json-file>`
The reply JSON has a `body` string.
`gh api graphql -f query='mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { id isResolved } } }' -f id='<thread-node-id>'`

Mark ready at merge with `gh pr ready <N> --repo StorminRH/lgi-tools`.
Merge is `gh pr merge <N> --repo StorminRH/lgi-tools --merge --match-head-commit <head-sha>`.
A Cloud Agent token that refuses that call is BLOCKED. Leave the GitHub PR open.
The operator reviews and merges. Token limits live in `.cursor/cloud-agent.md`.
The conventional git remote alias `origin` points to GitHub only at cutover.

**GitHub Actions** — Final CI is workflow `.github/workflows/test.yml`, named
`Verify`, once the reviews on that PR are idle and the local suite is green on
that head. It runs on `pull_request` and `workflow_dispatch`. Select the PR run
for the current head/base and require successful `verify`, `build`, and `e2e`.
Watch with `gh run watch`. On red, inspect the jobs then logs. The fix is a new
batch, then the new head's PR run. Re-running an old run does not test a new head.
Manual dispatch selects a branch or tag; it does not emit the PR-only
`ci-subject` artifact. Skip `auth-storage.json` in artifacts.
`gh pr checks <N> --repo StorminRH/lgi-tools`
`gh run list --repo StorminRH/lgi-tools --workflow test.yml --event pull_request --branch <head-branch>`
`gh run watch <run-id> --repo StorminRH/lgi-tools --exit-status`
`gh run view <run-id> --repo StorminRH/lgi-tools --json headSha,event,attempt,jobs`
`gh run view <run-id> --repo StorminRH/lgi-tools --log-failed`
`gh run rerun <run-id> --repo StorminRH/lgi-tools`

**vercel** — Manual `development` Preview and the Vercel API.
`vercel deploy`
`vercel ls`
`vercel api`

**neon** — Branch policy. Nothing auto-applies `neon.ts`. Protected `main`
needs `--allow-protected`.
`neon config plan`
`pnpm neon:apply`
`neon branches delete preview/<branch>`

**convex** — Local and anonymous stay `pnpm exec convex`. Hosted preview
delete is the HTTP path under Delivery.
`pnpm exec convex dev`
`pnpm exec convex run`
`pnpm exec convex env set`

## Architecture

Neon holds durable account, character, and ESI data. Convex holds live
projections plus the mapper collaborative-chain exception in `docs/CONVEX.md`.

Production source lives in the deny-by-default Fallow zones. `.fallowrc.json`
is the boundary. No new cross-layer exceptions.

Use existing primitives and configuration. Extract shared code only for a real
second consumer.

## Atlas connections

When discussing Atlas connections, use the glossary at the top of
`src/data/maps/connection-door-types.ts`. Talk about a system and its class
when the class matters, the wormholes in that system, outgoing named holes vs
incoming K162s. Example: jump a P060, land in a C1, the way back is the K162.
Stored `from`/`to` are document ends, not incoming vs outgoing. Call them
systems, not origin or far side.

## Delivery

Feature work lands on GitHub `development`. A `development` Preview is
manual (Vercel dashboard or CLI): Neon `preview/development` (3-day TTL,
0.25-1 CU from `neon.ts`) and Convex `preview/development`. Delete that
Neon branch, Convex preview, and Vercel Preview when the test cycle ends.

Promote at 80 app-facing files versus `staging`. That GitHub PR updates the
long-lived Preview: Neon `staging` and Convex `staging` (`proper-squid-200`).
Durable origin `https://staging.lgi.tools`. EVE SSO callback is
`https://staging.lgi.tools/api/auth/oauth2/callback/eve`.

`main` is the only Production auto-deploy. Every merge onto `staging`
or `main` goes through `close-out`.

`vercel.json` auto-deploys `main` and `staging` only. Neon
project `lively-mode-73649525`. Convex team `stormin-s-projects`, project
`lgi-tools`. Connection strings use role `neondb_owner`.

Convex has no CLI list or delete. Ending a Vercel Preview leaves Convex
running. List and delete with a team access token or PAT, never
`CONVEX_DEPLOY_KEY`, against `https://api.convex.dev/v1`:

```text
GET  /teams/stormin-s-projects/projects/lgi-tools
GET  /projects/<numeric-id>/list_deployments?deploymentType=preview
POST /deployments/<animal-name>/delete
```

The delete path is the animal name (`robust-puffin-832`), not
`preview/development`. Preview Convex expires 5d or 14d from create.

## Cloud Agent

For Cursor Cloud Agent VM setup, secrets, or VM-local e2e, read
`.cursor/cloud-agent.md`. Those Linux provisioning scripts apply only to that
VM. For local Cursor or Codex development, use `README.md#local-development`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
