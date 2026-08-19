---
name: close-out
description: Finish and ship completed work through required review, verification, pull-request delivery, conditional merge, and production proof. Assumes any required UX gate is already satisfied by a prior ux-check step. Use when the operator asks to wrap up, close out, ship, or merge ordinary work or an approved lifecycle session.
---

# Close out work

Sole end-to-end ship path. Two modes — never infer mode from a branch prefix.

After merge, agent production proof is the repo's required runtime check, not a
visual browser pass or bare HTTP check.

## Mode selection

- **Planned** when `start-session` dispatched close-out with a valid
  `session-ready`/`execute` directive on the lifecycle branch, or a dedicated
  close-out chat after an Ordered work (OW) handoff that names planned mode,
  the resolver still reports that session, and the plan's `Execution status` is
  `Pending`. Owns version, roadmap, session-plan, and pending-fragment
  absorption.
- **Ordinary** on any direct "close out" / "ship it" that does not meet those
  conditions. No resolver, no release-consistency, no edits to version
  identity, public version headings, roadmap, or session execution state —
  exactly one pending changelog fragment instead.

Mid-session Ordered work resumes through `start-session`, not close-out.
Close-out consumes prior `ux-check` evidence; it does not invoke `ux-check`.
User-facing planned work uses a dedicated UX Ordered work step under
`start-session` before awaiting close-out. Ordinary user-facing work needs
that `ux-check` plus operator disposition before the implementation-review
gate.

Outputs — exactly one:

- `SESSION_HANDOFF` — planned, more sessions remain; plan `Complete`, handoff
  pointed, lifecycle branch pushed, no PR.
- `MERGED` — review, verify, PR, merge, and production proof complete.
- `BLOCKED` — named gate, scope conflict, failed check, or external-state
  block.

One active phase at a time. Attach real evidence before completing a phase.

## 1. End-of-session review

1. Fix in-scope problems on the branch. Prefer absorb here. Defer only on
   explicit operator cut by opening a GitHub Issue titled
   `[Backlog] <short what>` with body fields *what / why-deferred / size /
   trigger*.
2. Judgment review (record not-touched when irrelevant): scope leftover;
   public-doc drift in README, CONTRIBUTING, SECURITY, `.github/`,
   `.env.example`, and legal pages. Do not repeat `adversarial-review`.
3. Verify on local dev. If Ordered work remains, `BLOCKED` — return to
   `start-session`.

## 2. Planned: session memory and the final-session fork

Ordinary skips this section — go to **Implementation review gate**.

One sub-version → one lifecycle branch → one PR unless indexed contracts say
one PR per session.

1. From contract index, master-plan row, and session plan: next session id or
   `Final session`.
2. Non-final under one-sub-version-PR: **Implementation review gate** without
   filling PR `## Notes` → **Finalize and verify the current head** → plan
   `Execution status: Complete`, as-built per
  `docs/workflows/schema/session-as-built.md` (PR marker deferred to final),
  lifecycle commit+push. Stop (`SESSION_HANDOFF`).
3. Final session: continue only when the sub-version is cohesive as one PR.
   Mark `Complete` during Implementation review gate finalization, before the
   PR opens.
4. Contract `UX gate: Yes` requires the dedicated UX Ordered work step already
   recorded in the `ux-check` return (operator disposition). `No` skips.
   Missing disposition → `BLOCKED` back to `start-session`.

## 3. Implementation review gate

Sole design-and-independent-review stage before full verify. Do not launch a
second adversarial round after it.

1. Invoke `adversarial-review` against `origin/main...HEAD` plus any
   uncommitted patch. Keep the worktree stable. Contested items surface in
   chat. Continue only with `PASS`.
2. Finalize delivery records before gates and before opening a PR:
   - **Ordinary:** one pending fragment in `content/changelog/pending/` per
     `docs/workflows/schema/changelog-pending.md`. No version-identity /
     version-heading / roadmap / session-status edits. PR `## Notes` is
     filled when the PR opens.
   - **Planned, own PR, non-final:** leave the release triplet untouched; plan
     `Complete`; fill PR `## Notes` when the PR opens.
   - **Planned, handoff, one-sub-version-PR:** skip delivery finalization and
     PR `## Notes`.
   - **Planned, final:** sync `origin/main`, absorb pending fragments into
     `### vX.Y.N` per changelog-pending, delete consumed fragments, prepend via
     `docs/workflows/schema/changelog-entry.md`, bump version identity,
     terminal roadmap row, plan `Complete`, fill PR `## Notes` when the PR
     opens.

## 4. Finalize and verify the current head

Local cheap gate before commit. Do not repeat that packet at PR open when the
head is unchanged. Standing done is the Origin PR Depot pipeline in
**The PR and external-review loop**.

1. Diff still matches the reviewed subject plus corrections plus delivery
   records. Screen scope and PII. Planned: expand each plan `SC-N` into an
   in-context atomic proof ledger — every required observable. A passing
   command or suite name is not proof. Missing observable → `BLOCKED`.
   Never return this session to `plan-session`.
2. Durable gotchas: planned work records them in the as-built Successor
   notes. Ordinary work records them in the relevant nested `AGENTS.md`
   landmine or canonical guide. Operator-cut scope is a GitHub Issue
   (`[Backlog] …`).
3. Cheap checks that can still edit: policy + `python3 tools/cli.py test`
   after guide/skill/hook/policy changes; doc refs; pending-changelog checker;
   baseline-claims / watch-trigger reporters; plan-named checkers. Planned also
   runs release consistency. Fix before verify.
4. Stop local long-running dev servers after review; clear stale build cache.
5. Clean session-only ignored artifacts. Tracked guides/tools ship normally.
6. Local cheap gate once, through `gate-runner`:

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm exec fallow dead-code --fail-on-issues
   pnpm exec fallow dupes --fail-on-issues
   pnpm exec fallow health --fail-on-issues
   ```

   Plus caller-supplied focused tests for the diff. Skip focused tests when
   the diff cannot affect them. Standing done is the Origin PR Depot
   pipeline in **The PR and external-review loop**.

7. Confirm the worktree still matches preflighted scope. Any application, test,
   executable, dependency-manifest, lockfile, or verification-configuration
   change after verify invalidates the checkpoint. Uncommitted OW
   implementation after the last Ordered work step → `BLOCKED` back to
   `start-session`.
8. Commit and push (plain-English conventional style). Ordinary: all verified
   scoped changes plus the pending fragment. Planned: remaining lifecycle-only
   delta (plan status, as-built, release records).
9. Planned non-final stops after handoff; final continues to the PR.

## 5. The PR and external-review loop

1. Reuse the cheap-gate packet when the head is unchanged since **Finalize and
   verify the current head**.
2. Open one **draft** PR to `main` (or reuse the open review-only PR). Headings
   in order: `## What this does`, `## Why`, `## Notes`, `## Test plan`.
   Planned: with the PR number known, author the as-built, commit, push while
   still draft. After the PR exists, standing done is the Depot pipeline.
   Wait with `origin pr checks --watch`. If Checks are empty while Depot is
   running, use `depot ci run list --repo stormin/lgi-tools --org k2f4dzqwd4`
   and `depot ci status <run-id> --org k2f4dzqwd4`.
3. Privacy-scrub title/body:

   ```bash
   python3 tools/cli.py delivery scrub-pr-body --check \
     --body-file "$PR_BODY_FILE" \
     --title "$PR_TITLE"
   ```

   Planned also
   `python3 tools/cli.py lifecycle check-release --check --expect reconciled`.
   Re-scrub after publish. Confirm head/body/delivery/verify final, then
   mark it ready for review exactly once.
4. Drive ready PRs in batched rounds — never push mid-pass:

   ```bash
   python3 tools/cli.py delivery poll-pr-gate \
     "$PR_REPOSITORY" "$PR_NUMBER" review
   ```

5. Collect all findings (Greptile, CodeRabbit, Bugbot). Advisory IDE review is
   not the gate of record. **Fix** in-scope; **Justify** via `@greptileai`
   (wait for the bot); **Defer** only on explicit operator cut → GitHub Issue
   `[Backlog] …`. One push per round after invalidated evidence is green.

## 6. Merge (shared)

1. Participating Greptile needs live 5/5; every Greptile/CodeRabbit thread
   resolved. At least one participating reviewer with head-exact evidence.
2. Gate of record: `python3 tools/cli.py delivery merge-clean-pr` — fail-closed.
3. Unresolved finding rejected by the helper → escalate. Never resolve a thread
   only to clear the gate.

## 7. After merge and production proof

1. Clean the local feature branch and any manual preview or ephemeral data
   branch.
2. Wait for the merge-SHA production deployment:

   ```bash
   python3 tools/cli.py delivery wait-prod-deploy <merge-sha>
   ```

   Fail closed on timeout, failed/inactive deploy, or when Production tip
   moves to a different commit.
3. Agent production proof is log-driven Playwright, not a visual pass. Browser
   cache and origin-scoped bypass live in the `ux-check` skill. Always run
   `pnpm verify:prod` (or `pnpm verify:site-routes -- <url>`).
   Account-adjacent: also `pnpm ux-check <routes> --base-url=<prod-url>` with
   operator `--cookie-jar` / `--storage-state`. Pass/fail from JSON.
4. Ordinary: `MERGED`. Pending fragment is the only lifecycle record.
   Planned: update from `origin/main`, run
   `python3 tools/cli.py lifecycle resolve --pretty`, return to
   `start-session`.

## Return

Render this form in chat. Use exactly these four bullets. Do not wrap the
result in a code fence or prepend a second summary.

## Close-out: `SESSION_HANDOFF` | `MERGED` | `BLOCKED`

- **Subject:** <Ordinary or Planned>; session `<id>` or ordinary; head `<full SHA>`
- **Result:** <what completed; ≤2 sentences>
- **Action:** <next step; PR URL or merge SHA when present>
- **Blocker:** <exact blocker or `None`>
