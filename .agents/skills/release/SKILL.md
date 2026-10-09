---
name: release
description: >-
  Release LGI Tools from staging to main: agree the changelog entry and
  version bump with the user, then run the promote skill in release mode
  (two review rounds, green Verify and Coverage health, hold). Use only when
  the user explicitly asks to release or move staging to main.
---

# Release

This is the promote skill in release mode, with a changelog step first.

## Changelog and version

Before the pull request exists:

1. Fetch `origin`. Read `git log origin/main..origin/staging` and the
   changed areas, then `docs/changelog-entry.md` and the current
   `src/config/app-version.ts`.
2. Propose the next version number and the full entry in chat, rendered as
   it will appear in `content/changelog/vX.Y.md`.
3. Iterate with the user until they approve the wording and the version. Do
   not commit before that approval.
4. On `staging`, prepend the entry, bump `APP_VERSION`, run `pnpm check`
   through the test-runner subagent, commit `Record v<X.Y.N> changelog`, and
   push.

## Then

Read and follow [../promote/SKILL.md](../promote/SKILL.md) in release mode.
Release does not request Greptile or CodeRabbit. After the user merges, merge
`origin/main` back into `development` as promote describes.
