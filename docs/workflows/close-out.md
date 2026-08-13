# Close-out procedure

Sole end-to-end ship path. Two modes — never infer mode from a branch prefix.

## Mode selection

- **Planned** when `start-session` dispatched close-out with a valid
  `session-ready`/`execute` directive on `lifecycle/<sub-version>`, or a
  dedicated close-out chat after an OW handoff that names planned mode, the
  resolver still reports that session, the plan's `Execution status` is
  `Pending`, and SCRATCHPAD shows `n/n complete — awaiting close-out`. Owns
  version, roadmap, session-plan, and pending-fragment absorption.
- **Ordinary** on any direct "close out" / "ship it" that does not meet planned
  conditions. No resolver, no release-consistency, no edits to `APP_VERSION`,
  public version headings, roadmap, or session execution state — exactly one
  pending changelog fragment instead.

Mid-session Ordered work resumes through `start-session`, not close-out.
Steps are **(shared)**, **(planned)**, or **(ordinary)**.

## Execution contract

Inputs:

1. **(planned)** Directive or handoff selecting planned mode, approved contract
   and plan, master-plan status, and OW-complete SCRATCHPAD. If Ordered work
   remains, `BLOCKED` — return to `start-session`.
2. **(shared)** Focused/local/UX evidence for the changed surface plus the full
   branch diff. User-facing work requires completed `ux-check` reports and the
   operator's browser-review disposition (or not-applicable). Close-out
   consumes that evidence; it does not invoke `ux-check`.
3. **(shared)** Current review, release, baseline, and workflow-policy state.

Outputs (exactly one):

- `SESSION_HANDOFF` **(planned)** — more sessions remain; plan `Complete`,
  handoff pointed, lifecycle branch pushed, no PR.
- `MERGED` **(shared)** — adversarial-review, verify, PR, merge, and production
  proof complete.
- `BLOCKED` **(shared)** — named gate, scope conflict, failed check, or
  external-state block.

One active phase at a time; attach real evidence before completing it. Reopen
only phases invalidated by a later change.

## End-of-session review and local proof (shared)

1. Fix in-scope session problems on the branch. Prefer absorb here; defer only
   on explicit operator scope cut by opening a GitHub Issue titled
   `[Backlog] <short what>` with body fields *what / why-deferred / size /
   trigger*.
2. Judgment review (record not-touched when irrelevant):
   - **Scope** — remove unneeded work. `adversarial-review` owns depth /
     duplication / amplification — do not repeat those audits here.
   - **Data** — ESI-fed datasets: declaration, cache time, store, freshness
     owner, key shape, purge, regenerability. Convex is derived; never writes
     Neon; timers are absolute end timestamps.
   - **Rendering** — most static honest mode; request data in Suspense;
     update `scripts/route-classification.json`. No production builds before
     merge.
   - **UI** — adopted library + `src/components/ui/` wrappers; keyboard /
     pointer / touch.
   - **Public docs** — fix drift in README, CONTRIBUTING, SECURITY, `.github/`,
     `.env.example`, `/legal`.
3. Verify on local dev (Docker DB / API). Never `pnpm build` / `next build` /
   `pnpm vercel-build` before merge.
4. **(ordinary)** User-facing changes need prior `ux-check` + operator
   disposition before the implementation-review gate. Planned work uses a
   dedicated UX Ordered work step under `start-session` before awaiting
   close-out.

## Session memory and the final-session fork (planned)

One sub-version → one lifecycle branch → one PR unless indexed contracts say
one PR per session (then every session opens its own). Ordinary skips this
section — go to **Implementation review gate**.

1. From contract index, master-plan row, and session plan: next session id or
   `Final session`.
2. Non-final under one-sub-version-PR: **Implementation review gate** without
   PR Design notes → **Finalize and verify the current head** → plan
   `Execution status: Complete`, as-built per
   `docs/workflows/schema/session-as-built.md` (PR marker deferred to final),
   SCRATCHPAD handoff, lifecycle commit+push. Stop (`SESSION_HANDOFF`).
3. Final session: continue only when the sub-version is cohesive and reviewable
   as one PR. Mark `Complete` during Implementation review gate finalization,
   before the PR opens.
4. Contract `UX gate: Yes` requires a dedicated UX Ordered work step that
   already invoked `ux-check` and recorded operator disposition — verify in
   SCRATCHPAD/proof ledger. `No` skips. Missing required disposition →
   `BLOCKED` back to `start-session`.

## Implementation review gate (shared)

Sole design-and-independent-review stage before full verify. Do not launch a second
adversarial round after it.

1. **(shared)** Invoke `adversarial-review` against the complete working-tree
   change (request or contract/plan, base, patch + untracked inventory,
   focused/UX evidence, baseline). Keep the worktree stable. Contested items
   surface in chat — no deferral inside the review. Continue only with
   `PASS`.
2. Finalize delivery records before gates and before opening a PR:
   - **(ordinary)** One pending fragment in `content/changelog/pending/` per
     `docs/workflows/schema/changelog-pending.md`. No `APP_VERSION` / version
     heading / roadmap / session-status edits. Design notes → PR `## Notes`.
   - **(planned, own PR, non-final)** Leave release triplet untouched; plan
     `Complete`; Design notes → PR `## Notes`.
   - **(planned, handoff, one-sub-version-PR)** Skip delivery finalization and
     Design notes.
   - **(planned, final)** Sync `origin/main`, absorb pending fragments into
     `### vX.Y.N` per changelog-pending, delete consumed fragments, prepend via
     `docs/workflows/schema/changelog-entry.md`, bump `APP_VERSION`, terminal
     roadmap row, plan `Complete`, Design notes → PR `## Notes`.

## Finalize and verify the current head (shared)

Single full verification checkpoint for the completed head. Do not repeat at
PR open when the head is unchanged.

1. Diff still matches the reviewed subject + corrections + delivery records.
   Screen scope and PII. **(planned)** Expand each plan `SC-N` into an
   in-context atomic proof ledger — every required observable. A passing
   command or suite name is not proof. Missing observable → `BLOCKED`.
   Never return this session to `plan-session`.
2. Reconcile `docs/SCRATCHPAD.md` (durable gotchas only; collapse OW rows).
   Operator-cut scope is a GitHub Issue (`[Backlog] …`).
3. Cheap checks that can still edit: agent policy + `python3 tools/cli.py test`
   after guide/skill/hook/policy changes; doc refs; pending-changelog checker;
   baseline-claims / watch-trigger reporters; plan-named checkers.
   **(planned)** also release consistency. Fix before verify.
4. Stop local Next.js/Convex after review; clear `.next`. Leave Docker Postgres
   running unless stopping for another reason.
5. Clean session-only ignored artifacts (credentials, temp PR bodies,
   `.codegraph/`, failure captures). Tracked guides/tools ship normally.
6. Definition of done once:

   ```bash
   FALLOW_AUDIT_BASE=$(git rev-parse origin/main) pnpm verify
   ```

7. Confirm the worktree still matches preflighted scope and that no
   application, test, executable, dependency-manifest, lockfile, or
   verification-configuration change occurred after verify. Any such change
   invalidates the checkpoint and returns to the applicable preflight and
   verification steps. Uncommitted OW implementation with SCRATCHPAD claiming
   complete → `BLOCKED` back to `start-session`.
8. Commit and push (plain-English conventional style). Push without an empty
   commit when already fully committed.
   - **(ordinary)** Commit all verified scoped changes plus the pending
     fragment.
   - **(planned)** Commit any remaining lifecycle-only delta (plan status,
     as-built, SCRATCHPAD handoff, release records). Ordered-work commits
     already cover implementation.
9. **(planned)** Non-final stops after handoff; final continues to the PR.

## The PR and external-review loop (shared)

1. Reuse verify evidence when the head is unchanged since **Finalize and verify
   the current head**.
2. Open one **draft** PR to `main` (or reuse the open review-only PR). Headings
   in order: `## What this does`, `## Why`, `## Notes`, `## Test plan`.
   **(planned)** With the PR number known, author the as-built, commit, push
   while still draft.
3. Privacy-scrub title/body. Prepare body file + title; run:

   ```bash
   python3 tools/cli.py delivery scrub-pr-body --check \
     --body-file "$PR_BODY_FILE" \
     --title "$PR_TITLE"
   ```

   **(planned)** also
   `python3 tools/cli.py lifecycle check-release --check --expect reconciled`.
   Re-scrub after publish. Confirm head/body/delivery/verify final, then
   mark it ready for review exactly once.
4. Drive ready PRs in batched rounds — never push mid-pass. Each round:

   ```bash
   python3 tools/cli.py delivery poll-pr-gate \
     "$PR_REPOSITORY" "$PR_NUMBER" review
   ```

5. Collect all findings (Greptile, CodeRabbit, Bugbot). Cursor is advisory.
   Triage without widening scope: **Fix** in-scope; **Justify** via
   `@greptileai` (wait for the bot — reply alone does not resolve); **Defer**
   only on explicit operator cut → GitHub Issue `[Backlog] …`. One push per
   round after invalidated evidence is green. Pending justification → `BLOCKED`.

## Merge (shared)

1. Participating Greptile needs live 5/5; every Greptile/CodeRabbit thread
   resolved. At least one participating reviewer with head-exact evidence.
2. Gate of record:
   `python3 tools/cli.py delivery merge-clean-pr` — fail-closed; do not
   substitute its checklist.
3. Unresolved finding rejected by the helper → escalate. Never resolve a thread
   only to clear the gate.

## After merge and production proof (shared)

1. Clean local feature branch and any manual Vercel preview + Neon branch.
2. Wait for the merge-SHA production deployment with the delivery waiter
   (not the Vercel MCP, not a hand-rolled `vercel`/`zsh` poll):

   ```bash
   python3 tools/cli.py delivery wait-prod-deploy <merge-sha>
   ```

   Fail closed on timeout, failed/inactive deploy, or when Production tip
   moves to a different commit. Do not substitute ad-hoc CLI loops for this
   gate.
3. Agent production proof — Playwright log-driven, not a visual browser pass:
   - Browser cache: Cursor agent shells often set `PLAYWRIGHT_BROWSERS_PATH`
     under `cursor-sandbox-cache/`. That path is session-scoped and is **not**
     the host install. Before any prod/UX Playwright command, if that variable
     contains `cursor-sandbox-cache`, point it at the host cache
     (`$HOME/Library/Caches/ms-playwright` on macOS) or unset it. Only run
     `pnpm exec playwright install chromium` when the host cache is actually
     missing the required revision — never as a default close-out step.
   - Always: `pnpm verify:prod` (or `pnpm verify:site-routes -- <url>`).
     Origin-scoped bypass via `scripts/ux-remote-auth.mjs` / env — never
     context-wide `extraHTTPHeaders`.
   - Account-adjacent: also `pnpm ux-check <routes> --base-url=<prod-url>` with
     operator `--cookie-jar` / `--storage-state`.
   - Pass/fail from JSON; failure screenshots under `docs/ux-check/captures/`.
   - See `docs/workflows/ux-check.md` and
     `docs/contributing/end-to-end-testing.md`.
4. Exit by mode:
   - **(ordinary)** `MERGED`. Pending fragment is the only lifecycle record.
   - **(planned)** Update from `origin/main`, run
     `python3 tools/cli.py lifecycle resolve --pretty`, return to
     `start-session`. Resolver owns archive/next-audit decisions.

## Return

```markdown
## Close-out: `SESSION_HANDOFF` | `MERGED` | `BLOCKED`

- **Subject:** <Ordinary or Planned>; session `<id>` or ordinary; head `<full SHA>`
- **Result:** <what completed; ≤2 sentences>
- **Action:** <next step; PR URL or merge SHA when present>
- **Blocker:** <exact blocker or `None`>
```
