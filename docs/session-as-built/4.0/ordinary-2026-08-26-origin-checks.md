# Ordinary Work As-Built — Origin checks watch, Bugbot wait, merge-token BLOCKED

**Record status:** Final
**Recorded:** 2026-08-26
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#33`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

None.

## Divergences from plan

None.

## Final surfaces

- `.cursor/skills/close-out/SKILL.md` — `origin pr checks <N> --watch` in the foreground, Bugbot on open, merge token refusal is `BLOCKED`
- `AGENTS.md` — create keeps `--head` and `--base`; checks take a change number; merge is `origin pr merge <N>`
- `.cursor/cloud-agent.md` — this Cloud Agent Origin token can create, comment, and watch; it is not scoped for merge or `origin ruleset list`
- `CONTRIBUTING.md` — checks take a change number

## Discovered work

None.

## Successor notes

- `--head` and `--base` belong on `origin pr create`. `origin pr checks` rejects them.
- After `test-runner` the checkout can be detached. Pass the change number. A subscription or `--json` snapshot is extra.
- Merge default, `--merge`, `--squash`, `--auto`, and `--branch` all hit the same unscoped gate. `origin api` merge calls 401. Leave the Origin PR open. The operator merges, or upgrades the token. A branch push is not a merge.
- Bugbot auto-reviews the Origin PR once, on open. Later versions keep that pass. Dump review stays Greptile and CodeRabbit.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `7788e81e75782449129ae373aa6aa6e7b602a5ba`..`stormin/test-cleanup-combined-3a87`, then corrected on `662b4c91d98dcb084a6570f9a392bba3eddf31f3`; Roles: structure-reviewer, behavior-reviewer, thermos, no-comments; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: these four files were excluded from the app-facing packet. Review ran on the 97 test files in the same PR. See `ordinary-2026-08-26-test-cleanup.md`.
