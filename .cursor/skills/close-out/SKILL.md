---
name: close-out
description: Promote development onto staging, or cut a staging-to-main release. Use when the operator asks to close out, promote, ship, or merge those two lines.
---

# Close out work

Two rituals. Promote merges Origin `development` onto `staging`. Release
merges Origin `staging` onto `main`. Pick the ritual from the ask, or from
a start-session dispatch whose resolver stage is `promote-needed`. Ordered
work stays on `development` through `start-session`. After a promote, the
next Start Session continues Ordered work or planning.

When talking with the operator, write in plain English and invoke `unslop`
on what you say.

## 1. Select the ritual

Done when this chat is one ritual, named from the ask or the resolver.

- **Promote** when the operator asked to promote, close out a review
  chunk, or merge `development` onto `staging`, or when start-session
  dispatched this skill for resolver stage `promote-needed`. That
  happens at 80 app-facing files versus `staging`.
- **Release** when the operator asked to cut a release, ship production,
  or merge `staging` onto `main`.

One ritual per chat. A session ending is not a ritual. If the ask is a
land or a session wrap, stop and point at `start-session`.

Outputs. Exactly one:

- `PROMOTED`. Origin PR merged to `staging`. Dump PR closed unmerged.
- `RELEASED`. Origin `main` holds the cut. Production proof passed.
- `BLOCKED`. Named gate, oversize dump, failed check, or missing ask.

## 2. Promote development onto staging

Done when the Origin PR has merged to `staging`, as-builts for that
delivery are on the PR, Depot was green, and the GitHub dump is closed
unmerged.

1. Fetch `origin/development` and `origin/staging`. Work from the
   `development` tip. Uncommitted Ordered work returns to `start-session`.
2. Run `python3 tools/cli.py lifecycle count-app-facing`. A smaller
   clean chunk is fine when the operator asked for one. A pile well
   over 100 is `BLOCKED`. Split first.
3. Invoke `adversarial-review` against `development` onto `staging`.
   Keep the tree still. Contested items go to chat. Continue only on
   `PASS`. Land accepted code fixes onto `development` through
   `start-session` land and clean, then continue.
4. Author as-builts for the work this PR delivers to `staging`, per
   `docs/workflows/schema/session-as-built.md`. One record per session
   in the range, and one for ordinary work in the same PR. A session
   that still has work only on `development` waits for a later promote.
   Put the records on the Origin PR. The Delivered outcome carries the
   player-facing bullets the release changelog will lift. Do not write
   an as-built after an Ordered work step. Do not write a pending
   changelog fragment.
5. Open the Origin PR (`development` → `staging`) per **Origin PR**.
   Wait until Depot is green.
6. Dump that range to GitHub for bots. Add a `github` remote to
   `https://github.com/StorminRH/lgi-tools.git` when it is missing.
   Push Origin `staging` to GitHub `staging` so the dump base matches
   the already-reviewed line. Push Origin `development` to
   `dump/<YYYY-MM-DD>-<shortsha>`. Open a draft GitHub PR on
   `StorminRH/lgi-tools` (`dump/...` → `staging`) with `gh pr create`
   or the GitHub MCP. Request Greptile and CodeRabbit by hand. Origin
   `main` stays off GitHub `main`.
7. Iterate dump findings until they are resolved. **Fix** in-scope
   items on Origin and comment the fix on the Origin PR. Re-push the
   dump branch. Wait until the Origin PR is Depot-green again.
   **Justify** on the dump PR when the finding is wrong. **Defer** only
   on an explicit operator cut by opening a GitHub Issue
   `[Backlog] <short what>` with *what / why-deferred / size / trigger*.
   One Origin push per round after the local test suite is green on
   those fixes.
8. Merge the Origin PR to `staging` per **Merge the Origin PR**. Then
   close the dump PR unmerged. Stop. No `APP_VERSION`, no changelog, no
   Production.

## 3. Cut a release

Done when Origin `main` is at the cut, `APP_VERSION` matches the latest
lifecycle identity already on `staging`, the changelog is written from
those as-builts, and production proof passed.

1. Confirm the operator asked for this ritual. Fetch `origin/staging`
   and `origin/main`. Work from the `staging` tip.
2. Invoke `adversarial-review` against `staging` onto `main`. Same
   continue rule as promote. Land accepted code fixes onto `staging`
   through `start-session` land and clean.
3. Set `APP_VERSION` in `src/config/app-version.ts` to the latest
   lifecycle identity already on `staging`. That is the last session or
   Ordered work number this train delivered (session `4.0.5`, first
   Ordered work `4.0.5.1`). Do not ask for a number.
4. Write the public changelog from the as-builts in `staging...main`.
   Form: `docs/workflows/schema/changelog-entry.md`. The overview is
   the as-built Delivered paragraphs, invoked through `unslop`. The
   bullets are those records' `Added:` / `Changed:` / `Fixed:` /
   `Removed:` lines, grouped in that order. Do not write or fold
   pending fragments. Run
   `python3 tools/cli.py lifecycle check-release --check --expect reconciled`.
   Land that commit onto `staging`.
5. Bots already saw this work at promote. Open the Origin PR
   (`staging` → `main`) per **Origin PR**. Wait until Depot is green.
   Merge it to `main` per **Merge the Origin PR**.
6. Wait for the merge-SHA Production deploy:

   ```bash
   python3 tools/cli.py delivery wait-prod-deploy <merge-sha>
   ```

   Fail closed on timeout, a failed or inactive deploy, or a Production
   tip that moved to a different commit.
7. Agent production proof is log-driven Playwright. Always run
   `pnpm verify:prod` (or `pnpm verify:site-routes -- <url>`).
   Account-adjacent routes also run
   `pnpm ux-check <routes> --base-url=<prod-url>` with the operator
   `--cookie-jar` / `--storage-state`. Pass or fail from JSON. Browser
   cache and origin-scoped bypass live in the `ux-check` skill.
8. Fetch `origin/main`. Run
   `python3 tools/cli.py lifecycle resolve --pretty` and report it.
   Stop.

## 4. Origin PR

Done when the draft Origin PR exists and Depot is green.

1. Open one draft Origin PR via ManagePullRequest. Head and base are
   the ritual's two lines. Headings in order: `## What this does`,
   `## Why`, `## Notes`, `## Test plan`.
2. Scrub title and body:

   ```bash
   python3 tools/cli.py delivery scrub-pr-body --check \
     --body-file "$PR_BODY_FILE" \
     --title "$PR_TITLE"
   ```

3. Standing done is the Depot pipeline. Wait with
   `origin pr checks --watch`. If Checks are empty while Depot is
   running, use
   `depot ci run list --repo stormin/lgi-tools --org k2f4dzqwd4` and
   `depot ci status <run-id> --org k2f4dzqwd4`. Re-scrub after publish.
   Mark ready for review once.

## 5. Merge the Origin PR

Done when the Origin PR is merged to its base line.

Merge with `origin pr merge`. That merge is what moves the work onto
`staging` or `main`. Delete leftover source branches. Leave
`development`, `staging`, and `main`.

## Return

Render this form in chat. Use exactly these four bullets. Do not wrap the
result in a code fence or prepend a second summary.

## Close-out: `PROMOTED` | `RELEASED` | `BLOCKED`

- **Subject:** <Promote or Release>; `<from>` → `<to>`; head `<full SHA>`
- **Result:** <what completed; ≤2 sentences>
- **Action:** <next step; Origin PR URL or merge SHA when present>
- **Blocker:** <exact blocker or `None`>
