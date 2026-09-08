# Required review authorization

Delivery reads `tools/delivery/review-policy.json` from GitHub at the PR's exact
base commit. After merge, including archive verification, it reads the actual
merge commit's first parent. The fixed path and revision come from the collector;
the receipt cannot select another policy or supply authorized authors.

The policy is repository configuration maintained through the destination
branch's access and review controls. Changes in a candidate head cannot authorize
that candidate. An approved policy must already exist on its destination branch.
Protect changes to this file with the repository's required review controls.

This implementation does not install or activate a policy. Before activation,
the operator must approve the required seats for each delivery branch and the
GitHub accounts allowed to attest each seat. Resolve their numeric GitHub user
IDs and account types through the authenticated API. Install the approved policy
on each destination branch through the existing authorized process, then collect
fresh delivery evidence against the resulting base. A missing policy blocks
format-2 delivery and archive verification. It does not block local record checks
or alter legacy record readers.

The following is a schema example, not an approved seat list. Account IDs 101
and 202 are fictitious and must be replaced with verified, approved identities.

```json
{
  "format": 1,
  "repository_id": 1247024669,
  "branches": {
    "staging": ["behavior-reviewer", "greptile"]
  },
  "roles": {
    "behavior-reviewer": [{"id": 101, "type": "User"}],
    "greptile": [{"id": 202, "type": "Bot"}]
  }
}
```

`repository_id` must match GitHub's destination repository ID. Supported
destinations are `development`, `staging` and `main`. Each configured branch lists
its nonempty, unique required roles. Each role lists nonempty, unique principals
with a positive integer `id` and `type` of `User` or `Bot`. Every required role
must have principals. The candidate must include every required role for its
destination. Additional selected roles must also be declared in the policy.
Missing branches, unknown roles, malformed policy and unavailable API evidence
fail closed.

GitHub's returned `user.id` and `user.type` authorize the comment or review for
the selected role. Login names, body text, author association and receipt author
claims do not grant authority. An authorized operator may post native-agent
evidence for each explicitly assigned role. That is the operator's attestation
of requested versus observed model and pin, not proof that GitHub ran the agent.
Use `Not observable` when the runtime identity is unavailable. A bot account
qualifies only for the roles explicitly assigned to its own ID and type.

Every format-2 receipt retains `review_policy` with exactly `path`, `commit_sha`
and `blob_sha`. Obtain these from the fixed policy's authenticated GitHub contents
response at the independently verified base SHA. `blob_sha` is GitHub's file
blob SHA. The validator compares this locator with its own fresh collection;
the locator contains no author list.

Archive reads that same immutable merge-parent policy and checks the retained
locator. It does not query current team or collaborator membership, or replace
the policy with today's branch tip. Revoking an author later does not invalidate
an earlier authorized receipt, and granting a role later cannot authorize an
earlier receipt. A policy missing from the historical parent cannot be supplied
retroactively in a receipt or local file. The original authenticated final Linear
receipt and the referenced GitHub review evidence must remain available.

The collector uses GitHub's [contents API at a commit ref](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#get-repository-content)
and the author objects returned by the [review API](https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28#list-reviews-for-a-pull-request)
and [issue-comment API](https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28#list-issue-comments).
GitHub documents [account IDs as durable](https://docs.github.com/en/rest/users/users?apiVersion=2022-11-28#get-a-user-using-their-id).
`User` and `Bot` are the account types this application accepts.
