# Durable handoff and delivery receipt

The work issue in Linear owns one current handoff: stage, reachable repository,
branch/full SHA and PR; next action or actual blocker; accepted decisions and
source links; applicable proof and its reuse limits. Read current state before
updating. Preserve concurrent contributions under their issue/branch. Reachable
committed work or an accessible artifact is necessary for cross-harness resume;
a machine-only uncommitted path is a recorded access blocker. If saving fails,
report the checkpoint unsaved and retain a local draft.

Append compact receipt comments; corrections identify the comment they supersede.
Each comment contains one `lgi-delivery-receipt` fenced JSON block. Obtain the
actual comment ID and its owning issue through the authenticated Linear connector
in the current delivery operation. Save that returned object as temporary JSON
with `id`, `body`, and `issue.identifier` (for example `LGI-119`). When a connector
returns issue identity separately, attach only the independently retrieved issue
identity; never infer it from the receipt's assertions.

```json
{
  "format": 2,
  "delivery_id": "LGI-119-promotion-1",
  "stage": "pre-merge",
  "subject": {
    "repository": "StorminRH/lgi-tools",
    "pr": 123,
    "base": "staging",
    "base_sha": "<full SHA>",
    "head_sha": "<full SHA>",
    "merge_ref_sha": "<current GitHub PR merge-ref SHA>"
  },
  "criteria": {
    "SC-1": {"status": "PASS", "checks": [123456], "observable": "Specific result covering all atomic proof rows"}
  },
  "local": {"status": "PASS", "head_sha": "<full SHA>", "applicability": "Cumulative unverified delta and reuse limits", "evidence": "Reachable proof locator"},
  "review_policy": {"path": "tools/delivery/review-policy.json", "commit_sha": "<base SHA>", "blob_sha": "<GitHub policy blob SHA>"},
  "reviews": [
    {"role": "behavior-reviewer", "kind": "comment", "id": 456789, "requested": "configured role/model", "observed": "Not observable", "verdict": "PASS", "disposition": "Accepted findings fixed; rejected finding rationale"}
  ]
}
```

Use `criteria: {}` for ordinary/partial scope. Each criterion names actual
successful GitHub check-run IDs on the head or current merge-ref, with the
observable covering every atomic row. The authenticated caller verifies semantic
coverage and local evidence applicability; the deterministic comparator cannot
infer those facts from prose. Local states are `PASS` or `NOT REQUIRED` with an
applicability explanation; `BLOCKED` and `NOT RUN` cannot finalize. Final review
sources must contain their role, full head SHA, successful verdict (`PASS` or
`CLEAN`) and the recorded disposition.
A `review` source also binds GitHub's review commit; `comment` supports an
authorized operator posting native-agent evidence on the real PR. Each source
must contain exactly one `requested=<value>` line and one `observed=<value>` line
matching the receipt. Preserve the requested role/model/pin separately from
observed runtime identity; use `Not observable` when unavailable. For example:

```text
behavior-reviewer <full head SHA> PASS; No accepted findings remain
requested=gpt-5.6-sol / high
observed=Not observable
```

The [required review authorization policy](review-policy.md) binds each role to
GitHub's returned author ID and account type. Every format-2 receipt must retain
the exact `review_policy` locator independently collected from the PR base, or
the actual merge first parent after merge. The policy defines minimum required
roles for the destination; the candidate cannot omit them. Policy configuration
and activation are prerequisites, not evidence supplied by the receipt. Resolve
all review threads with recorded dispositions.

```sh
python3 tools/cli.py delivery check-receipt --record PATH --comment-file PATH --comment UUID --stage pre-merge
```

This command independently retrieves GitHub PR identity, frozen candidate bytes,
current base/merge-ref, ruleset and classic required checks, immutable review
policy and review author identities, review evidence and
all review threads. Missing access, stale subjects and pending/failed required
checks block. Current base/head and potential merge identity come from one
GraphQL PR response, including the exact two merge parents; REST's cached merge
SHA and workflow-run associated PR links are not applicability evidence.

The Actions adapter accepts source-head check identities only when all selected
Actions checks belong to one successful `test.yml` run and its exact current
attempt. It downloads the unique, unexpired `ci-subject` artifact emitted by the
workflow after verify, build and e2e pass. That isolated job runs trusted YAML
without checking out repository code. The runtime JSON binds repository,
workflow ref/SHA, run/attempt, PR, base/head refs and SHAs, and tested merge SHA.
The checker verifies that immutable subject against the current GraphQL pair.
Artifact downloads authenticate only the GitHub API hop; signed HTTPS storage
receives no credentials. ZIP size, entry identity/type and JSON shape are bounded.
Missing, expired, duplicate or stale proof blocks current merge eligibility. A
full rerun is required when successful jobs remain on an earlier run attempt.
Other providers may supply checks directly on the exact tested merge SHA; a
source-head-only PASS has no generic applicability exception.

To retain the validated CI subject, add `--ci-observation-out PATH` to a successful
current `check-receipt` invocation. Copy the generated object into `ci_observation`
in the final authenticated Linear receipt. It records the original observation
time, provider, run/attempt, artifact ID/digest, exact runtime subject, selected
check IDs and required-check contexts. Promoted/released Actions receipts require
that observation and compare it with live evidence. Preserve it before the
one-day artifact expires; no repository commit is needed.

It uses existing git GitHub credentials. There is no Linear token
requirement and ordinary app/fork tests have no remote dependency.

The command explicitly does **not** authenticate a caller-supplied Linear JSON
file or establish semantic proof coverage. The delivery operator must perform
the fresh authenticated collection and proof applicability check in the same
operation. A self-authored JSON file, URL, or PASS word alone is insufficient.
GitHub protection remains the merge gate; this receipt is additional evidence.

After merge, append a receipt with `stage: merged` and `merge_sha`. The validator
checks GitHub's merged PR and commit, its base parent, and the CI merge-ref's
base/head parents. For `promoted` (base staging) or `released` (base main), also add
deployment proof. Merged with a failed deployment remains merged and cannot
finalize promotion/release. A generic green check is not deployment proof.

For GitHub Deployments, use `deployment: {"id": 123, "sha": "<merge SHA>",
"environment": "Production", "state": "success"}` (use the actual provider
spelling; stage comparison ignores case). Record `deployment_observation` with
`observed_at` (ISO timestamp with timezone) and `success_status_id` (the actual
GitHub successful status ID). The command retrieves the deployment and latest
status independently and checks that identity.

For Vercel, freshly collect the authenticated response bodies from
`GET /v13/deployments/<id>?withGitRepoInfo=true&teamId=<team>` and
`GET /v4/aliases/<durable-domain>?projectId=<project>&teamId=<team>`.
Save `{ "deployment": <deployment response>, "alias": <alias response> }`
in the file supplied to `--deployment-file`. Supply the expected configuration
with `--vercel-project`, `--vercel-team`, `--vercel-alias` and, for promotion,
`--vercel-environment` (custom environment ID). These values come from the
accepted delivery configuration, independently of the exported responses.

The receipt's deployment object contains `provider: "vercel"`, actual `id`,
`sha`, `environment` (`staging` or `production`), `state: "success"`,
`project_id`, `team_id`, `alias` (the durable domain), and `environment_id`
(the staging custom environment ID, or null for production).
`deployment_observation` contains `observed_at` and `alias` (the exact raw alias
response collected at finalization). Preserve this observation in the final
Linear receipt for later historical archive verification.

The adapter requires READY; exact project/team; GitHub source type, repository ID,
branch and full merge SHA; the exact staging custom environment with null target,
or production target without a custom environment; and current durable alias
routing to the same deployment. Optional GitHub metadata must agree. Old
cursor-origin deployments cannot satisfy GitHub proof. JSON files do not
authenticate themselves: the caller must freshly retrieve both responses through
the authenticated Vercel connector/API before current delivery finalization.
The field contracts follow Vercel's official
[deployment API](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url)
and [alias API](https://vercel.com/docs/rest-api/aliases/get-an-alias).

Archive uses historical delivery, because later promotions replace the current
alias. Review authorization uses the policy fetched from GitHub at the actual
merge first parent and the final receipt's matching policy locator. Current
membership or a newer branch policy cannot change historical role authority.
Missing historical policy blocks archive. GitHub review bodies remain editable;
the original authenticated Linear receipt and matching source fields are still
required, and this check does not establish the time of a review-body edit.
For Actions, the authenticated final Linear receipt's original
`ci_observation` survives artifact expiry. Archive verifies the original successful
run attempt, suite and selected checks through GitHub, the retained exact runtime
subject, and immutable Git merge parents. It uses the original required-check
contexts and does not require the current branch base, potential merge, or a
fresh artifact. The retained observation is authenticated Linear history, not a
new cryptographic attestation; missing original proof blocks archive. `--archive-history` requires a previously final promoted/released Linear
receipt, including its original observation time, full subject, criteria, reviews
and deployment proof. GitHub history verifies the recorded successful status
against live status history, allowing a later inactive status. Vercel history
requires a freshly authenticated current READY deployment for the same project,
GitHub SHA and environment, plus the original alias response retained in the
authenticated final Linear receipt. It verifies the former alias-to-deployment
mapping without claiming that the old deployment still serves that alias. Missing
prior observation or source evidence blocks archive. The command reports
historical delivery separately from current routing.

For archive pre/post verification, supply `--receipt-dir DIR`. Each format-2
record needs `DIR/<Delivery ID>.json` with `comment_id`, the freshly collected
`comment` object, and `stage` (`promoted` or `released`). For Vercel also include
`vercel_export` containing the fresh deployment response and `vercel_expected`
containing `project_id`, `team_id`, `alias`, and `environment_id`; historical alias
evidence comes from the final Linear receipt. Both archive phases invoke
historical receipt verification. Delete active artifacts only after the post-copy
verifier succeeds. The local resolver merely reports artifact readiness and never
infers external delivery from the Linear locator.
